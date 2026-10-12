/**
 * Public coin list for other sites. Cached 10 seconds. No wallet, no proof, no profile text.
 */
const CHAINS = new Set(["ethereum", "bsc", "base", "robinhood", "solana", "arc", "tron", "ton"]);
const ID = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|T[1-9A-HJ-NP-Za-km-z]{33}|EQ[A-Za-z0-9_-]{46})$/;

export type PublicCoin = {
  chain: string;
  id: string;
  name: string;
  symbol: string;
  image: string;
  createdAt: string;
  buys: number;
  path: string;
};

type Row = {
  chain: string;
  mode: string;
  name: string;
  symbol: string;
  contract: string;
  image: string;
  buys: number;
  created_at: string;
};

const cache = new Map<string, { at: number; body: string }>();

function pathFor(row: Row): string {
  if (row.mode === "plain") return `/token/${row.chain}/${row.contract}`;
  if (row.mode === "curve") return `/coin/${row.chain}/${row.contract}`;
  return `/c/${row.chain}/${row.contract}`;
}

function mapRow(row: Row): PublicCoin {
  return {
    chain: row.chain,
    id: row.contract,
    name: row.name,
    symbol: row.symbol,
    image: row.image,
    createdAt: row.created_at,
    buys: row.buys,
    path: pathFor(row),
  };
}

async function remember(key: string, load: () => Promise<string>): Promise<string> {
  const now = Date.now();
  for (const [entry, row] of cache) {
    if (now - row.at >= 10_000) cache.delete(entry);
  }
  const hit = cache.get(key);
  if (hit) return hit.body;
  const body = await load();
  cache.set(key, { at: Date.now(), body });
  return body;
}

export function openChain(value: string | null): string | null {
  if (!value) return null;
  const chain = value.trim().toLowerCase();
  if (!CHAINS.has(chain)) throw new Error("That chain is not open.");
  return chain;
}

export function openId(value: string): string {
  const id = value.trim();
  if (!ID.test(id)) throw new Error("That coin looks wrong.");
  return id;
}

export async function coinsBody(chain: string | null): Promise<string> {
  return remember(`list:${chain ?? ""}`, async () => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = chain
      ? await sql<Row>`
          select chain, mode, name, symbol, contract, image, buys, created_at::text as created_at
          from coins where chain = ${chain}
          order by created_at desc limit 50
        `
      : await sql<Row>`
          select chain, mode, name, symbol, contract, image, buys, created_at::text as created_at
          from coins
          order by created_at desc limit 50
        `;
    return JSON.stringify({ coins: rows.map(mapRow) });
  });
}

export async function coinBody(chain: string, id: string): Promise<string> {
  return remember(`coin:${chain}:${id}`, async () => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<Row>`
      select chain, mode, name, symbol, contract, image, buys, created_at::text as created_at
      from coins
      where chain = ${chain} and lower(contract) = ${id.toLowerCase()}
      limit 1
    `;
    return JSON.stringify({ coin: rows[0] ? mapRow(rows[0]) : null });
  });
}

export function publicHeaders(status = 200): Headers {
  return new Headers({
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": status === 200 ? "public, max-age=10" : "no-store",
  });
}
