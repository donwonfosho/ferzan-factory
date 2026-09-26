import { createServerFn } from "@tanstack/react-start";
import { CHAINS as META } from "./catalog";
import { chainRpc, chainRpcBatch, type RelayChain } from "./relay";

const TRADE_TOPIC = "0xffbf3942a32ceb2aabfe4f2596228deead369ce3b97102bb8734075fe3510af5";
const SWAP_V3 = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const SWAP_V2 = "0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b";
const GET_POOL_V3 = "0x1698ee82";
const GET_POOL_V2 = "0x79bc57d5";

type Venue =
  | { kind: "v3"; factory: string; quote: string; fees: number[] }
  | { kind: "v2"; factory: string; quote: string; stable: boolean };

const VENUES: Record<RelayChain, Venue[]> = {
  base: [
    {
      kind: "v3",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      quote: "0x4200000000000000000000000000000000000006",
      fees: [500, 3000, 10000],
    },
    { kind: "v2", factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da", quote: "0x4200000000000000000000000000000000000006", stable: false },
    { kind: "v2", factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da", quote: "0x4200000000000000000000000000000000000006", stable: true },
  ],
  ethereum: [
    {
      kind: "v3",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      quote: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      fees: [500, 3000, 10000],
    },
  ],
  bsc: [
    {
      kind: "v3",
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      quote: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      fees: [500, 2500, 10000],
    },
  ],
  robinhood: [],
  arc: [],
};

export type Fill = {
  t: number;
  price: number;
  venue: "curve" | "market";
  side: "buy" | "sell";
  who: string;
  native: string;
};

type Log = { data?: string; blockNumber?: string; topics?: string[] };

const cache = new Map<string, { at: number; rows: Fill[] }>();

function asChain(value: unknown): RelayChain {
  if (value === "ethereum" || value === "bsc" || value === "base" || value === "robinhood" || value === "arc") return value;
  throw new Error("That chain is not open.");
}

function word(data: string, index: number): bigint {
  const body = data.startsWith("0x") ? data.slice(2) : data;
  const hex = body.slice(index * 64, index * 64 + 64);
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return 0n;
  return BigInt("0x" + hex);
}

function intWord(data: string, index: number): bigint {
  const n = word(data, index);
  return n >= 1n << 255n ? n - (1n << 256n) : n;
}

function padAddr(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function padUint(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function addressOut(hex: unknown): string | null {
  if (typeof hex !== "string") return null;
  const body = hex.replace(/^0x/, "").padStart(64, "0").slice(-40);
  if (!/^[a-fA-F0-9]{40}$/.test(body) || /^0+$/.test(body)) return null;
  return "0x" + body;
}

function priceOf(nativeRaw: bigint, tokenRaw: bigint, tokenDecimals: number, nativeDecimals: number): number {
  if (nativeRaw <= 0n || tokenRaw <= 0n) return 0;
  const scale = 10n ** 18n;
  const ratio = Number((nativeRaw * scale) / tokenRaw) / Number(scale);
  const n = ratio * 10 ** (tokenDecimals - nativeDecimals);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function getLogs(chain: RelayChain, address: string, topic: string): Promise<Log[]> {
  const latestHex = await chainRpc(chain, "eth_blockNumber", []);
  if (typeof latestHex !== "string") return [];
  const latest = BigInt(latestHex);
  try {
    const rows = await chainRpc(
      chain,
      "eth_getLogs",
      [{ address, topics: [topic], fromBlock: "0x0", toBlock: "latest" }],
      14000,
    );
    if (Array.isArray(rows)) return rows as Log[];
  } catch {
    /* public RPCs often refuse a full-history scan */
  }
  const out: Log[] = [];
  const step = 100_000n;
  let end = latest;
  for (let i = 0; i < 8 && end > 0n; i += 1) {
    const start = end > step ? end - step : 0n;
    try {
      const rows = await chainRpc(
        chain,
        "eth_getLogs",
        [{ address, topics: [topic], fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16) }],
        12000,
      );
      if (Array.isArray(rows)) out.push(...(rows as Log[]));
    } catch {
      /* skip a window the node will not serve */
    }
    if (start === 0n || out.length > 500) break;
    end = start - 1n;
  }
  return out;
}

async function blockTimes(chain: RelayChain, blocks: bigint[]): Promise<Map<string, number>> {
  const ids = [...new Set(blocks.map((b) => b.toString()))].slice(0, 120);
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 30) {
    const slice = ids.slice(i, i + 30);
    try {
      const rows = await chainRpcBatch(
        chain,
        slice.map((id) => ({ method: "eth_getBlockByNumber", params: ["0x" + BigInt(id).toString(16), false] })),
      );
      rows.forEach((row, index) => {
        const stamp = row && typeof row === "object" && "timestamp" in row ? (row as { timestamp?: string }).timestamp : "";
        if (typeof stamp === "string" && stamp.startsWith("0x")) map.set(slice[index], Number(BigInt(stamp)) * 1000);
      });
    } catch {
      /* times fall back below */
    }
  }
  return map;
}

async function poolAddresses(chain: RelayChain, token: string): Promise<{ address: string; quote: string; kind: "v3" | "v2" }[]> {
  const found: { address: string; quote: string; kind: "v3" | "v2" }[] = [];
  await Promise.all(
    VENUES[chain].map(async (venue) => {
      const fees = venue.kind === "v3" ? venue.fees : [venue.stable ? 1 : 0];
      await Promise.all(
        fees.map(async (fee) => {
          const data =
            venue.kind === "v3"
              ? GET_POOL_V3 + padAddr(token) + padAddr(venue.quote) + padUint(BigInt(fee))
              : GET_POOL_V2 + padAddr(token) + padAddr(venue.quote) + padUint(BigInt(fee));
          try {
            const raw = await chainRpc(chain, "eth_call", [{ to: venue.factory, data: "0x" + data.replace(/^0x/, "") }, "latest"]);
            const address = addressOut(raw);
            if (address) found.push({ address, quote: venue.quote, kind: venue.kind });
          } catch {
            /* no pool */
          }
        }),
      );
    }),
  );
  return found;
}

export const listFills = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; contract: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad chart request.");
    const row = data as Record<string, unknown>;
    const contract = typeof row.contract === "string" ? row.contract : "";
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) throw new Error("Contract looks wrong.");
    return { chain: asChain(row.chain), contract };
  })
  .handler(async ({ data }): Promise<Fill[]> => {
    const key = `${data.chain}:${data.contract.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 20_000) return hit.rows;

    const meta = META[data.chain];
    const quoteIsToken0 = (quote: string) => quote.toLowerCase() < data.contract.toLowerCase();
    const logs: { block: bigint; native: bigint; token: bigint; venue: "curve" | "market"; side: "buy" | "sell"; who: string }[] = [];

    const curveLogs = await getLogs(data.chain, data.contract, TRADE_TOPIC);
    for (const log of curveLogs) {
      if (!log.data || !log.blockNumber) continue;
      const native = word(log.data, 1);
      const token = word(log.data, 2);
      if (native > 0n && token > 0n) {
        const topic = log.topics?.[1] ?? "";
        const who = /^0x[a-fA-F0-9]{64}$/.test(topic) ? "0x" + topic.slice(-40) : "";
        logs.push({ block: BigInt(log.blockNumber), native, token, venue: "curve", side: word(log.data, 0) === 0n ? "sell" : "buy", who });
      }
    }

    const pools = await poolAddresses(data.chain, data.contract);
    for (const pool of pools) {
      const swaps = await getLogs(data.chain, pool.address, pool.kind === "v3" ? SWAP_V3 : SWAP_V2);
      const quote0 = quoteIsToken0(pool.quote);
      for (const log of swaps) {
        if (!log.data || !log.blockNumber) continue;
        let native = 0n;
        let token = 0n;
        if (pool.kind === "v3") {
          const amount0 = intWord(log.data, 0);
          const amount1 = intWord(log.data, 1);
          const q = quote0 ? amount0 : amount1;
          const t = quote0 ? amount1 : amount0;
          native = q < 0n ? -q : q;
          token = t < 0n ? -t : t;
        } else {
          const amount0 = word(log.data, 0) + word(log.data, 2);
          const amount1 = word(log.data, 1) + word(log.data, 3);
          native = quote0 ? amount0 : amount1;
          token = quote0 ? amount1 : amount0;
        }
        if (native > 0n && token > 0n) logs.push({ block: BigInt(log.blockNumber), native, token, venue: "market", side: "buy", who: "" });
      }
    }

    const times = await blockTimes(
      data.chain,
      logs.map((row) => row.block),
    );
    const rows = logs
      .map((row) => {
        const price = priceOf(row.native, row.token, meta.tokenDecimals, meta.nativeDecimals);
        const t = times.get(row.block.toString()) ?? 0;
        if (!price || !t) return null;
        return { t, price, venue: row.venue, side: row.side, who: row.who, native: row.native.toString() };
      })
      .filter((row): row is Fill => Boolean(row))
      .sort((a, b) => a.t - b.t);

    const capped = rows.length > 360 ? rows.filter((_, index) => index % Math.ceil(rows.length / 360) === 0 || index === rows.length - 1) : rows;
    cache.set(key, { at: Date.now(), rows: capped });
    return capped;
  });

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const holderCache = new Map<string, { at: number; rows: { address: string; amount: string }[] }>();

export const listHolders = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; contract: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad holder request.");
    const row = data as Record<string, unknown>;
    const contract = typeof row.contract === "string" ? row.contract : "";
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) throw new Error("Contract looks wrong.");
    return { chain: asChain(row.chain), contract };
  })
  .handler(async ({ data }) => {
    const key = data.chain + ":" + data.contract.toLowerCase();
    const hit = holderCache.get(key);
    if (hit && Date.now() - hit.at < 20_000) return hit.rows;
    const logs = await getLogs(data.chain, data.contract, TRANSFER_TOPIC);
    const balances = new Map<string, bigint>();
    const self = data.contract.toLowerCase();
    for (const log of logs) {
      const from = topicAddress(log.topics?.[1]);
      const to = topicAddress(log.topics?.[2]);
      const amount = word(log.data ?? "0x", 0);
      if (!from || !to || amount <= 0n) continue;
      if (from !== "0x0000000000000000000000000000000000000000") {
        balances.set(from, (balances.get(from) ?? 0n) - amount);
      }
      if (to !== "0x0000000000000000000000000000000000000000") {
        balances.set(to, (balances.get(to) ?? 0n) + amount);
      }
    }
    const rows = [...balances.entries()]
      .filter(([address, amount]) => amount > 0n && address !== self && address !== "0x000000000000000000000000000000000000dead")
      .sort((a, b) => (a[1] > b[1] ? -1 : 1))
      .slice(0, 12)
      .map(([address, amount]) => ({ address, amount: amount.toString() }));
    holderCache.set(key, { at: Date.now(), rows });
    return rows;
  });

function topicAddress(topic: string | undefined) {
  if (!topic || !/^0x[a-fA-F0-9]{64}$/.test(topic)) return "";
  return "0x" + topic.slice(-40).toLowerCase();
}
