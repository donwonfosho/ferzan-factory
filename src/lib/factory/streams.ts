/**
 * A coin's live stream. Only the recorded creator can set or end it, with the same
 * wallet proof used for posts. The link has to be https on YouTube, Twitch, Kick, or X.
 * It stays up for 12 hours, or until the creator ends it.
 */
import { createServerFn } from "@tanstack/react-start";
import { proofAddress, readProof, type Proof } from "./proof";

const CHAINS = new Set(["base", "bsc", "ethereum", "robinhood", "solana", "arc", "tron", "ton"]);
const HOSTS = new Set(["youtube.com", "youtu.be", "twitch.tv", "kick.com", "x.com"]);
const API = "https://launch.ferzaneco.com/api";

export type LiveStream = { coin: string; chain: string; token: string; url: string };

export function coinKey(chain: string, token: string): string {
  const id = token.startsWith("0x") || token.startsWith("0X") ? token.toLowerCase() : token.trim();
  return `${chain.trim().toLowerCase()}:${id}`;
}

function sameWallet(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.startsWith("0x") || a.startsWith("0X") || b.startsWith("0x") || b.startsWith("0X")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** https links on the four hosts only. www is allowed. Anything else is refused. */
export function streamUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That link is not allowed.");
  }
  if (url.protocol !== "https:") throw new Error("That link is not allowed.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!HOSTS.has(host)) throw new Error("That link is not allowed.");
  if (url.username || url.password) throw new Error("That link is not allowed.");
  url.hash = "";
  return url.toString();
}

function args(data: unknown): { chain: string; token: string; curve: string } {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const chain = String(row.chain ?? "").toLowerCase();
  const token = String(row.token ?? "").trim();
  const curve = String(row.curve ?? "").trim();
  if (!CHAINS.has(chain) || token.length < 20 || token.length > 70) throw new Error("That coin looks wrong.");
  if (curve && (curve.length < 20 || curve.length > 70)) throw new Error("That coin looks wrong.");
  return { chain, token, curve };
}

let liveCache: { at: number; value: LiveStream[] } | null = null;

async function creatorOf(chain: string, token: string, curve: string): Promise<string> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const ids = [...new Set([token, curve].filter(Boolean))];
  for (const id of ids) {
    const rows = await sql<{ creator: string }>`
      select creator from coins where chain = ${chain} and contract = ${id} limit 1
    `;
    if (rows[0]?.creator) return rows[0].creator;
  }
  if (chain === "solana" || chain === "ton" || chain === "tron") {
    const id = chain === "solana" ? token : curve || token;
    const path = chain === "solana" ? `/sol-coin/${id}` : `/curve-chart/${id}?tf=300`;
    const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as { creator?: unknown };
      if (typeof body.creator === "string") return body.creator;
    }
  }
  return "";
}

async function verifyTon(address: string, message: string, signature: string): Promise<boolean> {
  const [kind, pub, sig] = signature.split(".");
  if (kind !== "ton" || !/^[0-9a-fA-F]{64}$/.test(pub) || !/^[0-9a-fA-F]{128}$/.test(sig)) return false;
  const [{ WalletContractV4 }, { Address }, { signVerify }] = await Promise.all([import("@ton/ton"), import("@ton/core"), import("@ton/crypto")]);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: Buffer.from(pub, "hex"), walletId: 698983191 });
  if (!wallet.address.equals(Address.parse(address))) return false;
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message)));
  return signVerify(hash, Buffer.from(sig, "hex"), Buffer.from(pub, "hex"));
}

function tronHex(address: string): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const ch of address) {
    const i = alphabet.indexOf(ch);
    if (i < 0) return "";
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(50, "0").slice(0, 42).toLowerCase();
}

async function verifyTron(address: string, message: string, signature: string): Promise<boolean> {
  const [kind, sig] = signature.split(".");
  if (kind !== "tron" || !/^[0-9a-fA-F]{128,130}$/.test(sig)) return false;
  const hash = `0x${Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message))).toString("hex")}` as `0x${string}`;
  const rs = sig.slice(0, 128);
  const candidates = sig.length >= 130 ? [sig.slice(0, 130)] : [rs + "00", rs + "01"];
  const { recoverAddress } = await import("viem");
  const want = tronHex(address);
  if (!want) return false;
  for (const candidate of candidates) {
    try {
      const recovered = await recoverAddress({ hash, signature: `0x${candidate}` as `0x${string}` });
      if (`41${recovered.slice(2).toLowerCase()}` === want) return true;
    } catch {
      /* try the other recovery id */
    }
  }
  return false;
}

export const listLiveStreams = createServerFn({ method: "GET" }).handler(async (): Promise<LiveStream[]> => {
  if (liveCache && Date.now() - liveCache.at < 5_000) return liveCache.value;
  await (await import("./guard.server")).guardRelay("read");
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ coin_key: string; url: string }>`
    select coin_key, url from streams
    where set_at > now() - interval '12 hours'
    order by set_at desc
    limit 200
  `;
  const value = rows.map((row) => {
    const cut = row.coin_key.indexOf(":");
    return { coin: row.coin_key, chain: row.coin_key.slice(0, cut), token: row.coin_key.slice(cut + 1), url: row.url };
  });
  liveCache = { at: Date.now(), value };
  return value;
});

export const setCoinStream = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; token: string; curve: string; url: string; wallet: string; proof: Proof } => {
    const base = args(data);
    const row = data as Record<string, unknown>;
    const wallet = String(row.wallet ?? "").trim();
    const url = row.url === "" ? "" : streamUrl(String(row.url ?? ""));
    if (wallet.length < 20 || wallet.length > 70) throw new Error("That wallet looks wrong.");
    return { ...base, url, wallet, proof: readProof(row.proof) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const creator = await creatorOf(data.chain, data.token, data.curve);
    if (!creator || !sameWallet(creator, data.wallet)) throw new Error("Only the coin's creator can set this.");
    const fields = { chain: data.chain, coin: coinKey(data.chain, data.token), url: data.url };
    if (data.chain === "ton") {
      const { proofMessage, proofDigest } = await import("./proof");
      const message = proofMessage("stream", data.wallet, await proofDigest(fields), data.proof.ts);
      const age = Date.now() - data.proof.ts;
      if (age > 5 * 60_000 || age < -60_000 || !(await verifyTon(data.wallet, message, data.proof.signature))) {
        throw new Error("The signature does not match this wallet.");
      }
    } else if (data.chain === "tron") {
      const { proofMessage, proofDigest } = await import("./proof");
      const message = proofMessage("stream", data.wallet, await proofDigest(fields), data.proof.ts);
      const age = Date.now() - data.proof.ts;
      if (age > 5 * 60_000 || age < -60_000 || !(await verifyTron(data.wallet, message, data.proof.signature))) {
        throw new Error("The signature does not match this wallet.");
      }
    } else {
      const { requireProof } = await import("./proof.server");
      await requireProof("stream", data.wallet, fields, data.proof);
    }
    if (data.chain === "ton" || data.chain === "tron") {
      const { createHash } = await import("node:crypto");
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      await sql`delete from proof_sigs where created_at < now() - interval '15 minutes'`;
      const replayKey = createHash("sha256").update(`${data.wallet.toLowerCase()}|stream|${data.proof.ts}|${data.url}`).digest("hex");
      const used = await sql<{ sig: string }>`
        insert into proof_sigs (sig) values (${replayKey})
        on conflict (sig) do nothing
        returning sig
      `;
      if (!used[0]) throw new Error("That signature was already used. Try again.");
    }
    const key = coinKey(data.chain, data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    if (!data.url) {
      await sql`delete from streams where coin_key = ${key} and set_by = ${proofAddress(data.wallet)}`;
    } else {
      await sql`
        insert into streams (coin_key, url, set_by, set_at)
        values (${key}, ${data.url}, ${proofAddress(data.wallet)}, now())
        on conflict (coin_key) do update set url = ${data.url}, set_by = ${proofAddress(data.wallet)}, set_at = now()
      `;
    }
    liveCache = null;
    return { ok: true };
  });
