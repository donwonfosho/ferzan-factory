/**
 * Public coin list for other sites. Cached 10 seconds. No wallet, no proof, no profile text.
 */
const CHAINS = new Set(["ethereum", "bsc", "base", "robinhood", "solana", "arc", "tron", "ton"]);
const ID = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|T[1-9A-HJ-NP-Za-km-z]{33}|EQ[A-Za-z0-9_-]{46})$/;
const SORTS = new Set(["new", "buys", "volume"]);

export type PublicSort = "new" | "buys" | "volume";

export type PublicCoin = {
  chain: string;
  id: string;
  name: string;
  symbol: string;
  image: string;
  createdAt: string;
  buys: number;
  volumeWei: string;
  path: string;
};

export type PublicTrade = {
  side: string;
  nativeWei: string;
  price: string;
  createdAt: string;
  tx: string;
};

type Row = {
  chain: string;
  mode: string;
  name: string;
  symbol: string;
  contract: string;
  image: string;
  buys: number;
  volume_wei: string;
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
    volumeWei: row.volume_wei,
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

export function openSort(value: string | null): PublicSort {
  const sort = (value ?? "new").trim().toLowerCase();
  if (!SORTS.has(sort)) throw new Error("Sort by new, buys, or volume.");
  return sort as PublicSort;
}

export async function coinsBody(chain: string | null, sort: PublicSort): Promise<string> {
  return remember(`list:${chain ?? ""}:${sort}`, async () => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<Row>`
      select chain, mode, name, symbol, contract, image, buys, volume_wei, created_at::text as created_at
      from coins
      where ${chain}::text is null or chain = ${chain}
      order by
        case when ${sort} = 'volume' then volume_wei::numeric else 0 end desc,
        case when ${sort} = 'buys' then buys else 0 end desc,
        created_at desc
      limit 50
    `;
    return JSON.stringify({ coins: rows.map(mapRow) });
  });
}

export async function coinBody(chain: string, id: string): Promise<string> {
  return remember(`coin:${chain}:${id}`, async () => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<Row>`
      select chain, mode, name, symbol, contract, image, buys, volume_wei, created_at::text as created_at
      from coins
      where chain = ${chain} and lower(contract) = ${id.toLowerCase()}
      limit 1
    `;
    return JSON.stringify({ coin: rows[0] ? mapRow(rows[0]) : null });
  });
}

export async function tradesBody(chain: string, id: string): Promise<string> {
  return remember(`trades:${chain}:${id.toLowerCase()}`, async () => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const coin = await sql<{ contract: string }>`
      select contract from coins
      where chain = ${chain} and lower(contract) = ${id.toLowerCase()}
      limit 1
    `;
    if (!coin[0]) return JSON.stringify({ trades: [] });
    const rows = await sql<{ side: string; native_wei: string; price: string; created_at: string; tx_hash: string }>`
      select side, native_wei, price, created_at::text as created_at, tx_hash
      from prints
      where contract = ${coin[0].contract}
      order by created_at desc
      limit 100
    `;
    const trades: PublicTrade[] = rows.map((row) => ({
      side: row.side,
      nativeWei: row.native_wei,
      price: row.price,
      createdAt: row.created_at,
      tx: row.tx_hash,
    }));
    return JSON.stringify({ trades });
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

export type EmbedCard = {
  chain: string;
  id: string;
  name: string;
  symbol: string;
  image: string;
  path: string;
  price: string | null;
  mcapUsd: number | null;
  progress: number | null;
};

const embedCache = new Map<string, { at: number; value: EmbedCard }>();

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function priceLabel(n: number | null, native: string): string | null {
  if (n === null || n <= 0) return null;
  const text = n >= 1 ? n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : n.toPrecision(3);
  return native ? `${text} ${native}` : text;
}

async function launchJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://launch.ferzaneco.com/api${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Card for /embed. Cached 20 seconds. Missing market fields stay null. */
export async function embedCard(chain: string, id: string): Promise<EmbedCard> {
  const key = `${chain}:${id.toLowerCase()}`;
  const now = Date.now();
  for (const [entry, row] of embedCache) {
    if (now - row.at >= 20_000) embedCache.delete(entry);
  }
  const hit = embedCache.get(key);
  if (hit) return hit.value;
  const listed = JSON.parse(await coinBody(chain, id)) as { coin: PublicCoin | null };
  const coin = listed.coin;
  const chart = await launchJson(`/curve-chart/${encodeURIComponent(id)}?tf=60`);
  let price = priceLabel(numOrNull(chart?.price), typeof chart?.native === "string" ? chart.native.slice(0, 8) : "");
  let mcapUsd = numOrNull(chart?.mcap_usd);
  let progress =
    chart && typeof chart.progress === "number" && Number.isFinite(chart.progress)
      ? Math.max(0, Math.min(100, chart.progress))
      : null;
  if (!price && !(mcapUsd && mcapUsd > 0) && progress === null) {
    const one = await launchJson(`/coin/${encodeURIComponent(chain)}/${encodeURIComponent(id)}`);
    price = priceLabel(numOrNull(one?.price), typeof one?.native === "string" ? one.native.slice(0, 8) : "");
    mcapUsd = numOrNull(one?.mcap_usd);
    progress =
      one && typeof one.progress === "number" && Number.isFinite(one.progress)
        ? Math.max(0, Math.min(100, one.progress))
        : null;
  }
  const value: EmbedCard = {
    chain,
    id,
    name: coin?.name || "",
    symbol: coin?.symbol || "",
    image: coin?.image || "",
    path: coin?.path || `/coin/${chain}/${id}`,
    price,
    mcapUsd: mcapUsd && mcapUsd > 0 ? mcapUsd : null,
    progress,
  };
  embedCache.set(key, { at: Date.now(), value });
  return value;
}

