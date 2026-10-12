import { createServerFn } from "@tanstack/react-start";
import type { ChainId } from "./types";

type Hours = 6 | 24 | 72;
const USD: Record<Hours, number> = { 6: 10, 24: 30, 72: 75 };
const CHAINS = new Set(["ethereum", "bsc", "base", "robinhood", "arc", "solana"]);
const ID = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const FRESH_MS = 3 * 60 * 60 * 1000;
const QUOTE_MS = 30 * 60 * 1000;

export type BoostQuote = {
  chain: string;
  coin: string;
  name: string;
  symbol: string;
  hours: Hours;
  usd: number;
  nativeRaw: string;
  nativeText: string;
  nativeSymbol: string;
  treasury: string;
  /** Signed price, checked at submit so a later price move cannot refuse a correct payment. */
  quote: string;
};

export type BoostView = {
  chain: string;
  coin: string;
  name: string;
  symbol: string;
  image: string;
  path: string;
  txHash: string;
  paidNative: string;
  usd: number;
  startsAt: string;
  endsAt: string;
};

type CoinRow = { chain: string; contract: string; name: string; symbol: string; image: string; mode: string };

function hoursOf(value: unknown): Hours {
  const n = typeof value === "number" ? value : Number(value);
  if (n !== 6 && n !== 24 && n !== 72) throw new Error("Pick 6, 24, or 72 hours.");
  return n;
}

function chainOf(value: unknown): ChainId {
  const chain = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!CHAINS.has(chain)) throw new Error("Boosts are on EVM chains and Solana only.");
  return chain as ChainId;
}

function coinOf(chain: string, value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!ID.test(id)) throw new Error("That coin looks wrong.");
  if (chain === "solana" && id.startsWith("0x")) throw new Error("That coin looks wrong.");
  if (chain !== "solana" && !id.startsWith("0x")) throw new Error("That coin looks wrong.");
  return chain === "solana" ? id : id.toLowerCase();
}

function quoteOf(value: unknown): string {
  const quote = typeof value === "string" ? value.trim() : "";
  if (!/^v1\.\d{10,16}\.\d{1,40}\.[0-9a-f]{64}$/.test(quote)) throw new Error("That quote is not valid. Refresh the price and try again.");
  return quote;
}

function hashOf(chain: string, value: unknown): string {
  const hash = typeof value === "string" ? value.trim() : "";
  if (chain === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash)) throw new Error("Transaction looks wrong.");
    return hash;
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error("Transaction looks wrong.");
  return hash.toLowerCase();
}

function pathFor(row: CoinRow): string {
  if (row.mode === "plain") return `/token/${row.chain}/${row.contract}`;
  if (row.mode === "curve") return `/coin/${row.chain}/${row.contract}`;
  return `/c/${row.chain}/${row.contract}`;
}

function rawFromUsd(usd: number, price: number, decimals: number): bigint {
  const price8 = BigInt(Math.round(price * 1e8));
  if (price8 <= 0n) throw new Error("The price is not available. Try again.");
  const num = BigInt(Math.round(usd * 1e8)) * 10n ** BigInt(decimals);
  return (num + price8 - 1n) / price8;
}

function quoteSecret(): string {
  const value = (process.env.FERZAN_BOOST_SECRET ?? "").trim();
  if (!value) throw new Error("Boosts are not open yet.");
  return value;
}

async function signQuote(chain: string, coin: string, hours: Hours, nativeRaw: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const expires = Date.now() + QUOTE_MS;
  const msg = `v1|${chain}|${coin}|${hours}|${nativeRaw}|${expires}`;
  const sig = createHmac("sha256", quoteSecret()).update(msg).digest("hex");
  return `v1.${expires}.${nativeRaw}.${sig}`;
}

async function readQuote(chain: string, coin: string, hours: Hours, quote: string): Promise<bigint> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const [, expiresText, nativeRaw, sig] = quote.split(".");
  const expires = Number(expiresText);
  const msg = `v1|${chain}|${coin}|${hours}|${nativeRaw}|${expires}`;
  const expect = createHmac("sha256", quoteSecret()).update(msg).digest();
  const got = Buffer.from(sig, "hex");
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) throw new Error("That quote is not valid. Refresh the price and try again.");
  if (!Number.isFinite(expires) || expires > Date.now() + QUOTE_MS + 60_000) throw new Error("That quote is not valid. Refresh the price and try again.");
  if (expires < Date.now()) throw new Error("That quote expired. Refresh the price and try again.");
  return BigInt(nativeRaw);
}

async function findCoin(chain: string, coin: string): Promise<CoinRow> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<CoinRow>`
    select chain, contract, name, symbol, image, mode
    from coins
    where chain = ${chain} and lower(contract) = ${coin.toLowerCase()}
    limit 1
  `;
  if (!rows[0]) throw new Error("That coin is not listed.");
  return rows[0];
}

async function quoteFor(chain: ChainId, hours: Hours): Promise<{ raw: bigint; text: string; symbol: string; treasury: string }> {
  const { CHAINS: META, TREASURY } = await import("./catalog");
  const { nativeUsdNow } = await import("./usd");
  const { formatSmart } = await import("./units");
  const price = await nativeUsdNow(chain);
  if (!price) throw new Error("The price is not available. Try again.");
  const meta = META[chain];
  const raw = rawFromUsd(USD[hours], price, meta.nativeDecimals);
  return {
    raw,
    text: formatSmart(raw, meta.nativeDecimals),
    symbol: meta.native,
    treasury: chain === "solana" ? TREASURY.sol : TREASURY.evm,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function paidOnChain(chain: ChainId, hash: string): Promise<bigint> {
  const { TREASURY, SOLANA_RPC } = await import("./catalog");
  if (chain === "solana") {
    const { Connection } = await import("@solana/web3.js");
    const rpc = new Connection(SOLANA_RPC, "confirmed");
    type SolIx = { program?: string; parsed?: { type?: string; info?: { destination?: string; lamports?: number } } };
    type SolTx = {
      meta: { err: unknown; innerInstructions?: { instructions: SolIx[] }[] } | null;
      blockTime: number | null;
      transaction: { message: { instructions: SolIx[] } };
    };
    let tx: SolTx | null = null;
    for (let i = 0; i < 4; i += 1) {
      tx = (await rpc.getParsedTransaction(hash, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null)) as SolTx | null;
      if (tx) break;
      await sleep(1500);
    }
    if (!tx) throw new Error("That transaction is not on chain yet. Try again in a moment.");
    if (!tx.meta || tx.meta.err) throw new Error("That transaction failed on chain.");
    if (tx.blockTime && Date.now() - tx.blockTime * 1000 > FRESH_MS) throw new Error("That payment is too old. Send a new one.");
    const inner = (tx.meta.innerInstructions ?? []).flatMap((row) => row.instructions);
    let paid = 0n;
    for (const ix of [...tx.transaction.message.instructions, ...inner]) {
      if (ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
      if (ix.parsed.info?.destination !== TREASURY.sol) continue;
      const lamports = ix.parsed.info.lamports;
      if (typeof lamports === "number" && lamports > 0) paid += BigInt(lamports);
    }
    return paid;
  }
  const { chainRpc } = await import("./relay");
  type EvmTx = { to?: string; value?: string } | null;
  type EvmReceipt = { status?: string; blockNumber?: string } | null;
  let tx: EvmTx = null;
  let receipt: EvmReceipt = null;
  for (let i = 0; i < 4; i += 1) {
    tx = (await chainRpc(chain, "eth_getTransactionByHash", [hash]).catch(() => null)) as EvmTx;
    receipt = (await chainRpc(chain, "eth_getTransactionReceipt", [hash]).catch(() => null)) as EvmReceipt;
    if (tx && receipt) break;
    await sleep(1500);
  }
  if (!tx || !receipt) throw new Error("That transaction is not on chain yet. Try again in a moment.");
  if (receipt.status !== "0x1") throw new Error("That transaction failed on chain.");
  if ((tx.to ?? "").toLowerCase() !== TREASURY.evm.toLowerCase()) throw new Error("That payment did not go to the Ferzan treasury.");
  if (receipt.blockNumber) {
    const block = (await chainRpc(chain, "eth_getBlockByNumber", [receipt.blockNumber, false]).catch(() => null)) as { timestamp?: string } | null;
    const ts = block?.timestamp ? Number(BigInt(block.timestamp)) * 1000 : 0;
    if (ts && Date.now() - ts > FRESH_MS) throw new Error("That payment is too old. Send a new one.");
  }
  return BigInt(tx.value ?? "0");
}

export const previewBoost = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: ChainId; coin: string; hours: Hours } => {
    if (!data || typeof data !== "object") throw new Error("That coin looks wrong.");
    const row = data as { chain?: unknown; coin?: unknown; hours?: unknown };
    const chain = chainOf(row.chain);
    return { chain, coin: coinOf(chain, row.coin), hours: hoursOf(row.hours) };
  })
  .handler(async ({ data }): Promise<BoostQuote> => {
    await (await import("./guard.server")).guardRelay("read");
    const coin = await findCoin(data.chain, data.coin);
    const quote = await quoteFor(data.chain, data.hours);
    return {
      chain: data.chain,
      coin: data.coin,
      name: coin.name,
      symbol: coin.symbol,
      hours: data.hours,
      usd: USD[data.hours],
      nativeRaw: quote.raw.toString(),
      nativeText: quote.text,
      nativeSymbol: quote.symbol,
      treasury: quote.treasury,
      quote: await signQuote(data.chain, data.coin, data.hours, quote.raw.toString()),
    };
  });

export const submitBoost = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: ChainId; coin: string; hours: Hours; hash: string; quote: string } => {
    if (!data || typeof data !== "object") throw new Error("That coin looks wrong.");
    const row = data as { chain?: unknown; coin?: unknown; hours?: unknown; hash?: unknown; quote?: unknown };
    const chain = chainOf(row.chain);
    return { chain, coin: coinOf(chain, row.coin), hours: hoursOf(row.hours), hash: hashOf(chain, row.hash), quote: quoteOf(row.quote) };
  })
  .handler(async ({ data }): Promise<{ ok: true; endsAt: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    const coin = await findCoin(data.chain, data.coin);
    const quoted = await readQuote(data.chain, data.coin, data.hours, data.quote);
    const paid = await paidOnChain(data.chain, data.hash);
    const min = (quoted * 95n) / 100n;
    if (paid < min) throw new Error("That payment is short of this tier.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const key = `${coin.chain}:${coin.contract}`;
    try {
      await sql`
        insert into boosts (coin_key, chain, tx_hash, paid_native, usd_at_purchase, starts_at, ends_at)
        values (${key}, ${coin.chain}, ${data.hash}, ${paid.toString()}, ${USD[data.hours]}, now(), now() + make_interval(hours => ${data.hours}))
      `;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/duplicate|unique/i.test(message)) throw new Error("That transaction was already used.");
      throw err;
    }
    cache.clear();
    const rows = await sql<{ ends_at: string }>`select ends_at::text as ends_at from boosts where tx_hash = ${data.hash}`;
    return { ok: true, endsAt: rows[0]?.ends_at ?? "" };
  });

const cache = new Map<string, { at: number; value: BoostView[] }>();

async function loadBoosts(active: boolean): Promise<BoostView[]> {
  const key = active ? "active" : "all";
  const now = Date.now();
  for (const [entry, row] of cache) {
    if (now - row.at >= 5_000) cache.delete(entry);
  }
  const hit = cache.get(key);
  if (hit) return hit.value;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    chain: string;
    contract: string;
    name: string;
    symbol: string;
    image: string;
    mode: string;
    tx_hash: string;
    paid_native: string;
    usd: string;
    starts_at: string;
    ends_at: string;
  }>`
    select c.chain, c.contract, c.name, c.symbol, c.image, c.mode,
           b.tx_hash, b.paid_native, b.usd_at_purchase::text as usd,
           b.starts_at::text as starts_at, b.ends_at::text as ends_at
    from boosts b
    join coins c on b.coin_key = c.chain || ':' || c.contract
    where ${active}::boolean is false or b.ends_at > now()
    order by b.starts_at desc
    limit ${active ? 6 : 200}
  `;
  const value = rows.map((row) => ({
    chain: row.chain,
    coin: row.contract,
    name: row.name,
    symbol: row.symbol,
    image: row.image,
    path: pathFor(row),
    txHash: row.tx_hash,
    paidNative: row.paid_native,
    usd: Number(row.usd),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
  cache.set(key, { at: Date.now(), value });
  return value;
}

export const listPromoted = createServerFn({ method: "GET" }).handler(async (): Promise<BoostView[]> => {
  await (await import("./guard.server")).guardRelay("read");
  return loadBoosts(true);
});

export const listBoosts = createServerFn({ method: "GET" }).handler(async (): Promise<BoostView[]> => {
  await (await import("./guard.server")).guardRelay("read");
  return loadBoosts(false);
});
