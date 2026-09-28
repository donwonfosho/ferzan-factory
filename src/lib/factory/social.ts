/**
 * Coin comments (signed by the commenter's wallet, filtered by the rules in moderation.ts, hidden after
 * three reports) and a wallet's profit on every Ferzan coin (read from the Launch Bot API).
 */
import { createServerFn } from "@tanstack/react-start";
import { postBody, proofAddress, readProof, type Proof } from "./proof";
import { moderate } from "./moderation";

const API = "https://launch.ferzaneco.com/api";
const CHAINS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);
const ADDR = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46})$/;
const SIGNER = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const key = (a: string) => (a.startsWith("0x") ? a.toLowerCase() : a);

function coinArgs(data: unknown): { chain: string; token: string } {
  const row = rec(data);
  const chain = String(row.chain ?? "");
  const token = String(row.token ?? "").trim();
  if (!CHAINS.has(chain) || !ADDR.test(token)) throw new Error("That coin looks wrong.");
  return { chain, token: key(token) };
}

export type Comment = { id: string; author: string; body: string; createdAt: string };

export const listComments = createServerFn({ method: "POST" })
  .validator(coinArgs)
  .handler(async ({ data }): Promise<Comment[]> => {
    await (await import("./guard.server")).guardRelay("read");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ id: string; author: string; body: string; created_at: string }>`
      select p.id::text as id, p.author, p.body, p.created_at::text as created_at
      from posts p
      where p.chain = ${data.chain} and p.contract = ${data.token}
        and (select count(*) from comment_reports r where r.post_id = p.id) < 3
      order by p.created_at desc
      limit 60
    `;
    return rows.map((r) => ({ id: r.id, author: r.author, body: r.body, createdAt: r.created_at }));
  });

const known = new Map<string, number>();
async function isFerzanCoin(token: string): Promise<boolean> {
  const hit = known.get(token);
  if (hit && Date.now() - hit < 3_600_000) return true;
  const res = await fetch(`${API}/creator-score/${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(6_000) }).catch(() => null);
  const ok = Boolean(res && res.ok && rec(await res.json().catch(() => null)).found === true);
  if (ok) {
    if (known.size > 5000) known.clear();
    known.set(token, Date.now());
  }
  return ok;
}

export const addComment = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; token: string; author: string; body: string; proof: Proof } => {
    const base = coinArgs(data);
    const row = rec(data);
    const author = String(row.author ?? "").trim();
    const body = postBody(String(row.body ?? "").slice(0, 400));
    if (!SIGNER.test(author)) throw new Error("Sign in or connect a wallet to comment.");
    const why = moderate(body);
    if (why) throw new Error(why);
    return { ...base, author: key(author), body, proof: readProof(row.proof) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const { requireProof } = await import("./proof.server");
    await requireProof("post", data.author, { contract: proofAddress(data.token), chain: data.chain, body: data.body }, data.proof);
    if (!(await isFerzanCoin(data.token))) throw new Error("Comments are open on coins launched through Ferzan.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const recent = await sql<{ n: string; last: string | null }>`
      select count(*)::text as n, max(created_at)::text as last from posts
      where author = ${data.author} and created_at > now() - interval '1 hour'
    `;
    const last = recent[0]?.last ? Date.parse(recent[0].last) : 0;
    if (last && Date.now() - last < 15_000) throw new Error("Wait a few seconds before the next comment.");
    if (Number(recent[0]?.n ?? 0) >= 20) throw new Error("That's the limit for this hour. Try again later.");
    await sql`insert into posts (contract, chain, author, body) values (${data.token}, ${data.chain}, ${data.author}, ${data.body})`;
    return { ok: true };
  });

export const reportComment = createServerFn({ method: "POST" })
  .validator((data: unknown): { id: string; reporter: string; proof: Proof } => {
    const row = rec(data);
    const id = String(row.id ?? "");
    const reporter = String(row.reporter ?? "").trim();
    if (!/^\d{1,18}$/.test(id)) throw new Error("That comment looks wrong.");
    if (!SIGNER.test(reporter)) throw new Error("Sign in or connect a wallet to report.");
    return { id, reporter: key(reporter), proof: readProof(row.proof) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const { requireProof } = await import("./proof.server");
    await requireProof("post", data.reporter, { report: data.id }, data.proof);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`insert into comment_reports (post_id, reporter) values (${data.id}::bigint, ${data.reporter}) on conflict do nothing`;
    return { ok: true };
  });

export type PnlRow = {
  chain: string;
  token: string;
  symbol: string;
  name: string;
  unit: string;
  spent: number;
  received: number;
  holdingValue: number;
  pnl: number;
  pnlUsd: number;
  pnlPct: number;
  trades: number;
  mcapUsd: number;
  holding: boolean;
  path: string;
};
export type PnlAll = { items: PnlRow[]; spentUsd: number; valueUsd: number; pnlUsd: number; pnlPct: number; coins: number; wins: number };

export const getPnlAll = createServerFn({ method: "GET" })
  .validator((data: unknown): { wallet: string } => {
    const wallet = String(rec(data).wallet ?? "").trim();
    if (!ADDR.test(wallet)) throw new Error("bad wallet");
    return { wallet };
  })
  .handler(async ({ data }): Promise<PnlAll | null> => {
    const res = await fetch(`${API}/pnl-all/${encodeURIComponent(data.wallet)}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!res || !res.ok) return null;
    const it = rec(await res.json().catch(() => null));
    const t = rec(it.totals);
    const items = (Array.isArray(it.items) ? it.items : [])
      .slice(0, 200)
      .map((raw) => {
        const r = rec(raw);
        return {
          chain: str(r.chain, 12),
          token: str(r.token, 70),
          symbol: str(r.symbol, 16),
          name: str(r.name, 40),
          unit: str(r.unit, 8),
          spent: num(r.spent),
          received: num(r.received),
          holdingValue: num(r.holding_value),
          pnl: num(r.pnl),
          pnlUsd: num(r.pnl_usd),
          pnlPct: num(r.pnl_pct),
          trades: num(r.trades),
          mcapUsd: num(r.mcap_usd),
          holding: r.holding === true,
          path: str(r.path, 120),
        };
      })
      .filter((r) => PATH.test(r.path));
    return { items, spentUsd: num(t.spent_usd), valueUsd: num(t.value_usd), pnlUsd: num(t.pnl_usd), pnlPct: num(t.pnl_pct), coins: num(t.coins), wins: num(t.wins) };
  });
