/**
 * Server-only calls to the Ferzan Launch Bot API (launch.ferzaneco.com).
 * If this deployment has a Launch Bot key it is sent server-side only; the browser only gets unsigned transactions.
 */
import { env } from "@/lib/env.server";
import { chainRpc, type RelayChain } from "./relay";
import type { AnyLaunchTx, BotLaunchChain, BotLaunchInput, CurveLaunchChain, TonMessage } from "./bot-launch";

const API = "https://launch.ferzaneco.com/api";

/** The bots' curve factories (from the Launch Bot deploys). A build pointing anywhere else is refused. */
const FACTORIES: Record<CurveLaunchChain, string> = {
  bsc: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
  base: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
  ethereum: "0xc774ad391868bdbe7f8a3b8e0edfc3b0c0bfb17a",
  robinhood: "0xc774ad391868bdbe7f8a3b8e0edfc3b0c0bfb17a",
  arc: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
};
const CHAIN_IDS: Record<CurveLaunchChain, number> = { bsc: 56, base: 8453, ethereum: 1, robinhood: 4663, arc: 5042 };
/** Ferzan's Tron launch factory (TBcPG1XKutsns1dJtgJeWQDuGRxeESeMXn), as TronGrid writes it. */
const TRON_FACTORY_HEX = "4112001441b5746c26ce9f287e48404e4fbc7d57d8";
const TRON_MAX_FEE_SUN = 50_000_000n; // the launch fee is fixed in the factory (5 TRX); refuse anything above 50
const TON_MAX_NANO = 1_500_000_000n; // a TON launch sends about 0.6 TON in total

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function tronHex(address: string): string {
  let n = 0n;
  for (const ch of address) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error("Tron wallet looks wrong.");
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(50, "0").slice(0, 42);
}

/** keccak256("CurveLaunched(address,address,address)") */
const CURVE_LAUNCHED = "0x188ae4cd8aa7c0376e9501e76fb7a19dd1454add5c88bffbf75f391807a14475";

async function call(path: string, body: unknown, secret = false, timeoutMs = 60_000): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  // The Launch Bot no longer needs a shared key from the website: nothing is announced until it has
  // checked the launch on chain. A key is still sent if this deployment has one.
  const value = secret ? (env("FERZAN_INGEST_SECRET") ?? "") : "";
  if (value.length >= 24) headers["x-ferzan-ingest"] = value;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("The launch service did not answer. Try again in a minute.");
  }
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof out.detail === "string" ? out.detail : `The launch service answered ${res.status}.`;
    throw new Error(detail.slice(0, 300));
  }
  return out;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const asBig = (v: unknown): string => {
  const s = asString(v);
  if (!/^\d+$/.test(s)) throw new Error("The launch service sent a transaction we cannot use.");
  return s;
};

export async function startLaunch(input: BotLaunchInput): Promise<AnyLaunchTx> {
  const created = await call(
    "/site/launch-requests",
    {
      chain: input.chain,
      name: input.name,
      symbol: input.symbol,
      wallet_address: input.wallet,
      description: input.description,
      image: input.image,
      grad_native: input.gradNative,
      dev_buy: input.devBuy || "0",
      max_buy: input.maxBuy || "0",
      start_minutes: input.startMinutes || "0",
      website: input.website,
      x: input.x,
      telegram: input.telegram,
      supply_whole: input.supplyWhole || "1000000000",
    },
    true,
  );
  const requestId = asString(created.request_id);
  if (!/^[0-9a-f-]{36}$/.test(requestId)) throw new Error("The launch service did not start the launch.");

  const built = await call(`/launch-requests/${requestId}/build-tx`, { wallet_address: input.wallet });
  if (input.chain === "tron") {
    const tx = (built.transaction ?? {}) as Record<string, unknown>;
    const raw = (tx.raw_data ?? {}) as { contract?: { type?: string; parameter?: { value?: Record<string, unknown> } }[] };
    const c = raw.contract?.[0];
    const v = c?.parameter?.value ?? {};
    if (c?.type !== "TriggerSmartContract" || String(v.contract_address ?? "").toLowerCase() !== TRON_FACTORY_HEX) {
      throw new Error("The launch transaction does not go to the Ferzan Tron factory.");
    }
    if (String(v.owner_address ?? "").toLowerCase() !== tronHex(input.wallet)) throw new Error("The launch was built for another wallet.");
    const fee = BigInt(asBig(v.call_value ?? "0"));
    if (fee > TRON_MAX_FEE_SUN) throw new Error("The launch fee looks wrong.");
    if (!/^[0-9a-f]{64}$/.test(asString(tx.txID))) throw new Error("The launch service sent a transaction we cannot use.");
    return { kind: "tron", requestId, transactionJson: JSON.stringify(tx), feeSun: fee.toString() };
  }
  if (input.chain === "ton") {
    const list = Array.isArray(built.messages) ? built.messages : [];
    const messages: TonMessage[] = list.map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      const msg: TonMessage = { address: asString(r.address), amount: asBig(r.amount) };
      if (typeof r.stateInit === "string") msg.stateInit = r.stateInit;
      if (typeof r.payload === "string") msg.payload = r.payload;
      return msg;
    });
    const total = messages.reduce((sum, m) => sum + BigInt(m.amount), 0n);
    if (messages.length < 2 || messages.length > 3 || !messages[0].stateInit || total > TON_MAX_NANO) {
      throw new Error("The TON launch looks wrong. Nothing was sent.");
    }
    if (!messages.every((m) => /^[A-Za-z0-9_-]{48}$/.test(m.address))) throw new Error("The TON launch looks wrong.");
    return { kind: "ton", requestId, messages, validUntil: Number(built.valid_until) || Math.floor(Date.now() / 1000) + 600, network: asString(built.network) || "-239" };
  }
  if (input.chain === "solana") {
    const txHex = asString(built.unsigned_transaction);
    const mint = asString(built.mint_address);
    if (!/^[0-9a-f]+$/.test(txHex) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      throw new Error("The launch service sent a transaction we cannot use.");
    }
    return { kind: "solana", requestId, txHex, mint, costText: asString(built.cost_text) };
  }
  const tx = (built.unsigned_transaction ?? {}) as Record<string, unknown>;
  const to = asString(tx.to).toLowerCase();
  const evmChain = input.chain as CurveLaunchChain;
  if (to !== FACTORIES[evmChain]) throw new Error("The launch transaction does not go to the Ferzan factory.");
  if (Number(tx.chainId) !== CHAIN_IDS[evmChain]) throw new Error("The launch was built for another network.");
  const data = asString(tx.data);
  if (!/^0x[0-9a-fA-F]+$/.test(data)) throw new Error("The launch service sent a transaction we cannot use.");
  // `value` arrives as a JSON number and can lose digits; the fee and dev buy come as exact strings.
  const launchFeeWei = asBig(tx.launch_fee_wei ?? "0");
  const devBuyWei = asBig(tx.dev_buy_wei ?? "0");
  return {
    kind: "evm",
    requestId,
    to,
    data,
    value: (BigInt(launchFeeWei) + BigInt(devBuyWei)).toString(),
    gas: asBig(tx.gas),
    chainId: CHAIN_IDS[evmChain],
    launchFeeWei,
    devBuyWei,
  };
}

export async function sendSolana(requestId: string, signedB64: string): Promise<{ signature: string }> {
  const out = await call(`/launch-requests/${requestId}/sol-broadcast`, { signed_tx_b64: signedB64 });
  const signature = asString(out.signature);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) throw new Error("Solana did not take the launch.");
  return { signature };
}

export async function finishLaunch(input: {
  requestId: string;
  chain: BotLaunchChain;
  hash: string;
  mint: string;
}): Promise<{ token: string; curve: string }> {
  // The bots verify the transaction on chain (sender, factory or mint) before they post anything.
  // Tron and TON: the Launch Bot waits for the chain itself (up to about 90 seconds) before it answers.
  const slow = input.chain === "tron" || input.chain === "ton";
  const out = await call(
    `/launch-requests/${input.requestId}/complete`,
    { tx_hash: input.hash, result_token_address: input.mint },
    false,
    slow ? 110_000 : 60_000,
  );
  if (input.chain === "solana") return { token: input.mint, curve: "" };
  if (input.chain === "tron" || input.chain === "ton") {
    const token = asString(out.token);
    if (!token) throw new Error("The coin launched, but its address is not readable yet. It will show on the floor shortly.");
    return { token, curve: "" };
  }
  const receipt = (await chainRpc(input.chain as RelayChain, "eth_getTransactionReceipt", [input.hash])) as {
    logs?: { address?: string; topics?: string[] }[];
  } | null;
  for (const log of receipt?.logs ?? []) {
    const t = log.topics ?? [];
    if ((log.address ?? "").toLowerCase() === FACTORIES[input.chain as CurveLaunchChain] && (t[0] ?? "").toLowerCase() === CURVE_LAUNCHED && t.length >= 3) {
      return { curve: "0x" + t[1].slice(-40), token: "0x" + t[2].slice(-40) };
    }
  }
  throw new Error("The coin launched, but the site could not read its address yet. It will show on the floor shortly.");
}
