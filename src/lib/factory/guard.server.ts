/**
 * Limits on the public relay (the server functions that talk to chains for the browser).
 * Server-only: imports the request context.
 *
 * 1. Only this site's own pages may call them (Fetch-Metadata check shared with auth).
 * 2. Each visitor (by Cloudflare's cf-connecting-ip) gets a per-minute budget, counted in the
 *    database so it holds across serverless instances. Addresses are stored as a salted hash.
 * 3. Transactions the relay prepares or broadcasts must be one of the things this site
 *    actually sends: a site curve or token deploy, buy/sell/claim on a coin on the board,
 *    or a plain transfer of the chain's coin.
 */
import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { FERZAN_CURVE_BYTECODE, CURVE_SELECTOR } from "./curve-bytecode";
import { FERZAN_TOKEN_BYTECODE } from "./token-bytecode";

export type RelayBucket = "read" | "send";

/** Requests per visitor per minute. Receipt polling (every 2s) fits inside "read". */
const LIMITS: Record<RelayBucket, number> = { read: 240, send: 20 };

const CURVE_CALLS = new Set<string>([
  CURVE_SELECTOR.buy,
  CURVE_SELECTOR.buyMin,
  CURVE_SELECTOR.sell,
  CURVE_SELECTOR.sellMin,
  CURVE_SELECTOR.claim,
]);

/** Programs a Solana transaction sent through the relay may touch. */
const SOLANA_PROGRAMS = new Set([
  "11111111111111111111111111111111", // System
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Account
  "ComputeBudget111111111111111111111111111111", // Compute budget
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", // Memo
  "G7n5XBB7pjvKS7JfC6esgQGGAyPku5cposdiHfVAUxnJ", // Site curve program
  "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN", // Meteora DBC
]);

/** Hosts that reach Vercel directly (the custom domain), with no proxy in front. */
const DIRECT_HOSTS = new Set(["ferzan-factory.com", "www.ferzan-factory.com"]);

/**
 * The real visitor address, or null when we cannot know it. Two ways in:
 * - ferzan-factory.com goes straight to Vercel, which sets x-real-ip to the visitor and
 *   overwrites any value a client sends. A client-sent cf-connecting-ip is NOT trusted here.
 * - ferzan-factory.grok.me goes Cloudflare -> Envoy -> Vercel, so x-real-ip is a shared proxy;
 *   Cloudflare's cf-connecting-ip is the visitor there.
 * The door is read from x-forwarded-host, which Vercel sets itself.
 */
export function visitor(): string | null {
  const h = getRequest()?.headers;
  if (!h) return null;
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase().split(",")[0].split(":")[0].trim();
  const ip = (DIRECT_HOSTS.has(host) ? h.get("x-real-ip") : h.get("cf-connecting-ip"))?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** A short salted tag for the visitor (never the address), so two devices can be compared. */
export async function visitorTag(): Promise<string | null> {
  const ip = visitor();
  if (!ip) return null;
  const { createHash } = await import("node:crypto");
  const salt = process.env.FERZAN_INGEST_SECRET ?? "ferzan-relay";
  return createHash("sha256").update(salt + "|tag|" + ip).digest("hex").slice(0, 8);
}

async function visitorKey(bucket: RelayBucket, ip: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const salt = process.env.FERZAN_INGEST_SECRET ?? "ferzan-relay";
  return bucket + ":" + createHash("sha256").update(salt + "|" + ip).digest("hex").slice(0, 32);
}

/** Call first in every relay handler. Throws on cross-site calls or when the visitor is over budget. */
export async function guardRelay(bucket: RelayBucket): Promise<void> {
  assertSameSiteRequest();
  const ip = visitor();
  // Without the visitor address, counting would lump everyone behind the proxy into
  // one budget and lock the site. The same-site check and transaction allowlists still apply.
  if (!ip) return;
  const key = await visitorKey(bucket, ip);
  const minute = Math.floor(Date.now() / 60_000);
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ hits: number }>`
    insert into relay_hits (key, minute, hits) values (${key}, ${minute}, 1)
    on conflict (key, minute) do update set hits = relay_hits.hits + 1
    returning hits
  `;
  if (Math.random() < 0.02) {
    await sql`delete from relay_hits where minute < ${minute - 10}`;
  }
  if ((rows[0]?.hits ?? 0) > LIMITS[bucket]) throw new Error("Too many requests from here. Wait a minute and try again.");
}

/** EVM: only site deploys, and buy/sell/claim on a coin that is on the board. */
export async function assertAllowedEvmTx(chain: string, to: string | null | undefined, data: string): Promise<void> {
  const body = data.toLowerCase();
  if (!to) {
    if (body.startsWith(FERZAN_CURVE_BYTECODE.toLowerCase()) || body.startsWith(FERZAN_TOKEN_BYTECODE.toLowerCase())) return;
    throw new Error("Only Ferzan coins can be created from this site.");
  }
  // A plain coin transfer (no calldata): the account menu's Send, and moving funds out of the old browser wallet.
  if (body === "0x" || body === "") return;
  if (!CURVE_CALLS.has(body.slice(0, 10))) throw new Error("This site only sends buy, sell and claim to a coin.");
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const found = await sql<{ contract: string }>`
    select contract from coins where contract = ${to.toLowerCase()} and chain = ${chain} limit 1
  `;
  if (!found[0]) throw new Error("That coin is not on the floor yet.");
}

/** Solana: every instruction must use a known program. */
export async function assertAllowedSolanaTx(rawBase64: string): Promise<void> {
  const { VersionedTransaction } = await import("@solana/web3.js");
  let programs: string[];
  try {
    const tx = VersionedTransaction.deserialize(Buffer.from(rawBase64, "base64"));
    const keys = tx.message.staticAccountKeys;
    programs = tx.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]?.toBase58() ?? "");
  } catch {
    throw new Error("Transaction looks wrong.");
  }
  if (!programs.length || programs.some((id) => !SOLANA_PROGRAMS.has(id))) {
    throw new Error("This site only sends Ferzan launches and trades.");
  }
}
