/** Server-only: asks Relay / deBridge for a bridge route and checks what comes back before the wallet ever sees it. */
import { BRIDGE_META, type BridgeChain, type BridgeQuote } from "./bridge-buy";

const RELAY = "https://api.relay.link/quote/v2";
const DLN = "https://dln.debridge.finance/v1.0/dln/order/create-tx";
const NATIVE_EVM = "0x0000000000000000000000000000000000000000";
const SOL_NATIVE = "11111111111111111111111111111111";
const TRX_NATIVE_DLN = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

const EVM_ID: Partial<Record<BridgeChain, number>> = { ethereum: 1, base: 8453, bsc: 56, robinhood: 4663, arc: 5042 };
const RELAY_ID: Partial<Record<BridgeChain, number>> = { ...EVM_ID, solana: 792703809 };
const DLN_ID: Record<BridgeChain, number> = { ethereum: 1, base: 8453, bsc: 56, robinhood: 4663, arc: 5042, solana: 7565164, tron: 100000026 };
const DLN_TOKEN: Record<BridgeChain, string> = {
  ethereum: NATIVE_EVM, base: NATIVE_EVM, bsc: NATIVE_EVM, robinhood: NATIVE_EVM, arc: NATIVE_EVM, solana: SOL_NATIVE, tron: TRX_NATIVE_DLN,
};

const isHex = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v);
const isAddr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const big = (v: unknown): bigint => {
  try {
    if (typeof v === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(v)) return BigInt(v);
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  } catch {
    /* fall through */
  }
  return 0n;
};

function fmt(raw: bigint, dec: number, keep = 6): string {
  const base = 10n ** BigInt(dec);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(dec, "0").slice(0, keep).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Room above the amount for the bridge's own fixed fee on the source chain (0.006 of the native coin). */
const slack = (dec: number) => 6n * 10n ** BigInt(Math.max(dec - 3, 0));

async function viaRelay(q: { from: BridgeChain; to: BridgeChain; amount: string; sender: string; recipient: string }): Promise<BridgeQuote> {
  const srcId = EVM_ID[q.from];
  const dstId = RELAY_ID[q.to];
  if (!srcId || !dstId) throw new Error("Relay does not cover that pair.");
  const res = await fetch(RELAY, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      user: q.sender,
      recipient: q.recipient,
      originChainId: srcId,
      destinationChainId: dstId,
      originCurrency: NATIVE_EVM,
      destinationCurrency: q.to === "solana" ? "So11111111111111111111111111111111111111112" : NATIVE_EVM,
      amount: q.amount,
      tradeType: "EXACT_INPUT",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.message ?? body.error ?? `Relay answered ${res.status}`).slice(0, 160));
  const evm: BridgeQuote["evm"] = [];
  for (const step of (Array.isArray(body.steps) ? body.steps : []) as { items?: { data?: Record<string, unknown> }[] }[]) {
    for (const item of step.items ?? []) {
      const d = item.data ?? {};
      if (!isAddr(d.to) || !isHex(d.data ?? "0x")) continue;
      if (d.chainId !== undefined && Number(d.chainId) !== srcId) throw new Error("The route is for another network.");
      if (typeof d.from === "string" && d.from.toLowerCase() !== q.sender.toLowerCase()) throw new Error("The route was built for another wallet.");
      evm.push({ to: d.to, data: String(d.data ?? "0x"), value: big(d.value).toString() });
    }
  }
  if (!evm.length || evm.length > 2) throw new Error("Relay sent no usable transaction.");
  const total = evm.reduce((s, t) => s + BigInt(t.value), 0n);
  const dec = BRIDGE_META[q.from].dec;
  if (total > BigInt(q.amount) + slack(dec)) throw new Error("The route asks for more than you entered. Nothing was sent.");
  const det = (body.details ?? {}) as { currencyOut?: { amount?: unknown; currency?: { decimals?: number } } };
  const outRaw = big(det.currencyOut?.amount).toString();
  const outDec = Number(det.currencyOut?.currency?.decimals ?? BRIDGE_META[q.to].dec);
  return {
    via: "relay", evm, solHex: "", outRaw,
    outText: outRaw !== "0" ? `${fmt(BigInt(outRaw), outDec)} ${BRIDGE_META[q.to].sym}` : "",
    feeText: "",
  };
}

async function viaDln(q: { from: BridgeChain; to: BridgeChain; amount: string; sender: string; recipient: string }): Promise<BridgeQuote> {
  const params = new URLSearchParams({
    srcChainId: String(DLN_ID[q.from]),
    srcChainTokenIn: DLN_TOKEN[q.from],
    srcChainTokenInAmount: q.amount,
    dstChainId: String(DLN_ID[q.to]),
    dstChainTokenOut: DLN_TOKEN[q.to],
    dstChainTokenOutAmount: "auto",
    dstChainTokenOutRecipient: q.recipient,
    srcChainOrderAuthorityAddress: q.sender,
    dstChainOrderAuthorityAddress: q.recipient,
  });
  const res = await fetch(`${DLN}?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.error) throw new Error(String((body.error as string) ?? body.errorMessage ?? body.message ?? `deBridge answered ${res.status}`).slice(0, 160));
  const tx = (body.tx ?? {}) as Record<string, unknown>;
  const est = (body.estimation ?? {}) as { dstChainTokenOut?: { amount?: unknown; decimals?: number } };
  const outRaw = big(est.dstChainTokenOut?.amount).toString();
  const outText = outRaw !== "0" ? `${fmt(BigInt(outRaw), Number(est.dstChainTokenOut?.decimals ?? BRIDGE_META[q.to].dec))} ${BRIDGE_META[q.to].sym}` : "";
  if (q.from === "solana") {
    const blob = String(tx.data ?? "");
    const hex = blob.startsWith("0x") ? blob.slice(2) : blob;
    if (!/^[0-9a-fA-F]{100,}$/.test(hex)) throw new Error("deBridge sent no usable Solana transaction.");
    return { via: "debridge", evm: [], solHex: hex, outRaw, outText, feeText: "" };
  }
  if (!isAddr(tx.to) || !isHex(tx.data)) throw new Error("deBridge sent no usable transaction.");
  const value = big(tx.value);
  if (value > BigInt(q.amount) + slack(BRIDGE_META[q.from].dec)) throw new Error("The route asks for more than you entered. Nothing was sent.");
  return { via: "debridge", evm: [{ to: tx.to, data: tx.data, value: value.toString() }], solHex: "", outRaw, outText, feeText: "" };
}

export async function quoteBridge(q: { from: BridgeChain; to: BridgeChain; amount: string; sender: string; recipient: string }): Promise<BridgeQuote> {
  const meta = BRIDGE_META[q.from];
  const raw = BigInt(q.amount);
  if (raw > BigInt(Math.round(meta.max)) * 10n ** BigInt(meta.dec)) throw new Error(`That is more than the ${meta.max} ${meta.sym} limit for one bridge.`);
  // Solana and Tron routes are deBridge only; everything else tries Relay first and falls back to deBridge.
  if (q.from === "solana" || q.to === "solana" || q.to === "tron") return viaDln(q);
  try {
    return await viaRelay(q);
  } catch (first) {
    try {
      return await viaDln(q);
    } catch {
      throw first instanceof Error ? first : new Error("No route for that pair right now.");
    }
  }
}

export async function tronSun(address: string): Promise<{ sun: string }> {
  try {
    const res = await fetch(`https://api.trongrid.io/v1/accounts/${address}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { data?: { balance?: unknown }[] };
    return { sun: String(big(body.data?.[0]?.balance)) };
  } catch {
    return { sun: "0" };
  }
}
