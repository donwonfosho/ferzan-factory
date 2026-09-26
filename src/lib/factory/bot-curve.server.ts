/** Server-only reads for bot-launched curves: the coin's own chain plus the public Launch Bot API. */
import { chainRpcBatch, chainRpc, type RelayChain } from "./relay";
import { SEL, addrWord, word, type BotCurveChain, type BotCurveState } from "./bot-curve";

const API = "https://launch.ferzaneco.com/api";
const cache = new Map<string, { at: number; value: unknown }>();

async function apiJson(path: string, ttlMs: number): Promise<Record<string, unknown> | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Record<string, unknown> | null;
  let value: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (res.ok) value = (await res.json()) as Record<string, unknown>;
  } catch {
    value = null;
  }
  cache.set(path, { at: Date.now(), value });
  return value;
}

const big = (hex: unknown): bigint => (typeof hex === "string" && /^0x[0-9a-fA-F]+$/.test(hex) ? BigInt(hex.slice(0, 66)) : 0n);
const wordAt = (hex: unknown, i: number): bigint => {
  const s = typeof hex === "string" ? hex.replace(/^0x/, "") : "";
  const w = s.slice(i * 64, i * 64 + 64);
  return w.length === 64 ? BigInt("0x" + w) : 0n;
};
const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const https = (v: unknown): string => {
  const s = str(v);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};

function decodeString(hex: unknown): string {
  const s = typeof hex === "string" ? hex.replace(/^0x/, "") : "";
  if (s.length < 128) return "";
  const len = Number(BigInt("0x" + s.slice(64, 128)));
  const bytes = s.slice(128, 128 + len * 2);
  try {
    return Buffer.from(bytes, "hex").toString("utf8").replace(/[^\x20-\x7e -￿]/g, "").slice(0, 40);
  } catch {
    return "";
  }
}

export async function loadCurve(input: { chain: BotCurveChain; curve: string; wallet: string; tf: number }): Promise<BotCurveState> {
  const chain = input.chain as RelayChain;
  const c = input.curve;
  const call = (to: string, data: string) => ({ method: "eth_call", params: [{ to, data }, "latest"] });
  const [tok, grad, real, gradd, start, maxb] = await chainRpcBatch(chain, [
    call(c, SEL.token),
    call(c, SEL.gradTarget),
    call(c, SEL.realEth),
    call(c, SEL.graduated),
    call(c, SEL.startTime),
    call(c, SEL.maxBuyPerWallet),
  ]);
  const tokenWord = typeof tok === "string" ? tok.replace(/^0x/, "") : "";
  if (tokenWord.length !== 64 || /^0+$/.test(tokenWord)) throw new Error("That is not a Ferzan curve on this chain.");
  const token = "0x" + tokenWord.slice(24);

  const [chart, info] = await Promise.all([
    apiJson(`/curve-chart/${c}?tf=${input.tf}`, 10_000),
    apiJson(`/curve-info/${c}`, 300_000),
  ]);
  let name = str(info?.name, 40);
  let symbol = str(info?.symbol, 12);
  if (!name || !symbol) {
    const [nm, sy] = await chainRpcBatch(chain, [call(token, "0x06fdde03"), call(token, "0x95d89b41")]);
    name = name || decodeString(nm);
    symbol = symbol || decodeString(sy);
  }

  let mine: BotCurveState["mine"] = null;
  if (input.wallet) {
    const w = input.wallet;
    const [bal, lock, alw, bought, nat] = await chainRpcBatch(chain, [
      call(token, SEL.balanceOf + addrWord(w)),
      call(token, SEL.lockedUntilGraduation + addrWord(w)),
      call(token, SEL.allowance + addrWord(w) + addrWord(c)),
      call(c, SEL.boughtNative + addrWord(w)),
      { method: "eth_getBalance", params: [w, "latest"] },
    ]);
    mine = {
      balance: big(bal).toString(),
      locked: big(lock).toString(),
      allowance: big(alw).toString(),
      bought: big(bought).toString(),
      nativeBalance: big(nat).toString(),
    };
  }

  const stats = (chart?.creator_stats ?? {}) as Record<string, unknown>;
  const candles = Array.isArray(chart?.candles) ? (chart!.candles as unknown[]) : [];
  const trades = Array.isArray(chart?.trades) ? (chart!.trades as unknown[]) : [];
  return {
    chain: input.chain,
    curve: c,
    token,
    name: name || "Unnamed",
    symbol: symbol || "?",
    image: https(info?.image),
    description: str(info?.description, 500),
    links: { website: https(info?.website), x: https(info?.x), telegram: https(info?.telegram) },
    native: str(chart?.native, 8) || (input.chain === "bsc" ? "BNB" : "ETH"),
    nativeUsd: num(chart?.native_usd),
    price: num(chart?.price),
    mcapUsd: num(chart?.mcap_usd),
    progress: num(chart?.progress),
    gradTarget: big(grad).toString(),
    realEth: big(real).toString(),
    graduated: big(gradd) === 1n,
    startTime: Number(big(start)),
    maxBuy: big(maxb).toString(),
    creator: str(chart?.creator, 42),
    creatorLaunches: num(stats.launches),
    creatorGraduated: num(stats.graduated),
    candles: candles
      .filter((k): k is number[] => Array.isArray(k) && k.length >= 6 && k.every((x) => typeof x === "number"))
      .slice(-400)
      .map((k) => [k[0], k[1], k[2], k[3], k[4], k[5]] as [number, number, number, number, number, number]),
    trades: trades.slice(0, 25).map((t) => {
      const r = (t ?? {}) as Record<string, unknown>;
      return { ts: num(r.ts), buy: r.buy === true, native: num(r.native), tokens: num(r.tokens), trader: str(r.trader, 42), tx: str(r.tx, 66) };
    }),
    mine,
  };
}

export async function quote(input: { chain: BotCurveChain; curve: string; side: "buy" | "sell"; amount: string }): Promise<{ out: string; refund: string }> {
  const data = (input.side === "buy" ? SEL.quoteBuy : SEL.quoteSell) + word(BigInt(input.amount));
  const raw = await chainRpc(input.chain as RelayChain, "eth_call", [{ to: input.curve, data }, "latest"]);
  // quoteBuy -> (tokensOut, grossUsed, refund, fee); quoteSell -> (nativeOut, fee)
  return { out: wordAt(raw, 0).toString(), refund: input.side === "buy" ? wordAt(raw, 2).toString() : "0" };
}
