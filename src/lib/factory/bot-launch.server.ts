/**
 * Server-only calls to the Ferzan Launch Bot API (launch.ferzaneco.com).
 * The shared secret never leaves this server; the browser only gets unsigned transactions.
 */
import { env } from "@/lib/env.server";
import { chainRpc, type RelayChain } from "./relay";
import type { BotLaunchChain, BotLaunchInput, EvmLaunchTx, SolanaLaunchTx } from "./bot-launch";

const API = "https://launch.ferzaneco.com/api";

/** The bots' curve factories (from the Launch Bot deploys). A build pointing anywhere else is refused. */
const FACTORIES: Record<Exclude<BotLaunchChain, "solana">, string> = {
  bsc: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
  base: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
  ethereum: "0xc774ad391868bdbe7f8a3b8e0edfc3b0c0bfb17a",
  robinhood: "0xc774ad391868bdbe7f8a3b8e0edfc3b0c0bfb17a",
};
const CHAIN_IDS: Record<Exclude<BotLaunchChain, "solana">, number> = { bsc: 56, base: 8453, ethereum: 1, robinhood: 4663 };

/** keccak256("CurveLaunched(address,address,address)") */
const CURVE_LAUNCHED = "0x188ae4cd8aa7c0376e9501e76fb7a19dd1454add5c88bffbf75f391807a14475";

async function call(path: string, body: unknown, secret = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (secret) {
    const value = env("FERZAN_INGEST_SECRET") ?? "";
    if (value.length < 24) throw new Error("Launching is not set up on this site yet.");
    headers["x-ferzan-ingest"] = value;
  }
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
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

export async function startLaunch(input: BotLaunchInput): Promise<EvmLaunchTx | SolanaLaunchTx> {
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
    },
    true,
  );
  const requestId = asString(created.request_id);
  if (!/^[0-9a-f-]{36}$/.test(requestId)) throw new Error("The launch service did not start the launch.");

  const built = await call(`/launch-requests/${requestId}/build-tx`, { wallet_address: input.wallet });
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
  if (to !== FACTORIES[input.chain]) throw new Error("The launch transaction does not go to the Ferzan factory.");
  if (Number(tx.chainId) !== CHAIN_IDS[input.chain]) throw new Error("The launch was built for another network.");
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
    chainId: CHAIN_IDS[input.chain],
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
  await call(`/launch-requests/${input.requestId}/complete`, { tx_hash: input.hash, result_token_address: input.mint });
  if (input.chain === "solana") return { token: input.mint, curve: "" };
  const receipt = (await chainRpc(input.chain as RelayChain, "eth_getTransactionReceipt", [input.hash])) as {
    logs?: { address?: string; topics?: string[] }[];
  } | null;
  for (const log of receipt?.logs ?? []) {
    const t = log.topics ?? [];
    if ((log.address ?? "").toLowerCase() === FACTORIES[input.chain] && (t[0] ?? "").toLowerCase() === CURVE_LAUNCHED && t.length >= 3) {
      return { curve: "0x" + t[1].slice(-40), token: "0x" + t[2].slice(-40) };
    }
  }
  throw new Error("The coin launched, but the site could not read its address yet. It will show on the floor shortly.");
}
