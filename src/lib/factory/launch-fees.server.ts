/**
 * Reads the launch fee from the same place that charges it.
 * EVM: launchFeeWei() on the curve factory and the plain factory.
 * Tron: launchFeeSun() on the curve factory and the plain factory.
 * Solana: the Launch Bot's base fee (LAUNCH_FEE_LAMPORTS), published as launch_fee_sol.
 *   There is no on-chain Solana factory getter; that number is what the launch transaction sends.
 * TON: the Launch Bot adds LAUNCH_FEE_NANOTON as an extra wallet message. It is not stored
 *   on a contract and nothing public returns it, so this read fails and the page shows no number.
 */
import { LAUNCH_CHAIN_META, type CurveLaunchChain } from "./bot-launch";
import { FACTORIES, PLAIN_FACTORIES, TRON_PLAIN_FACTORY } from "./bot-launch.server";
import { chainRpc, type RelayChain } from "./relay";
import { TRON_CURVE_FACTORY } from "./tron-curve";
import type { FeeQuote, LaunchFeeTable } from "./launch-fees";

const API = "https://launch.ferzaneco.com/api";
const LAUNCH_FEE_WEI = "0x83eeb3bb";
const EVM: CurveLaunchChain[] = ["base", "bsc", "ethereum", "robinhood", "arc"];

const miss = (): FeeQuote => ({ ok: false });

function quote(raw: bigint, decimals: number, symbol: string): FeeQuote {
  if (raw < 0n) return miss();
  return { ok: true, raw: raw.toString(), decimals, symbol };
}

async function evmFee(chain: CurveLaunchChain, factory: string): Promise<FeeQuote> {
  try {
    const hex = await chainRpc(chain as RelayChain, "eth_call", [{ to: factory, data: LAUNCH_FEE_WEI }, "latest"]);
    if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(hex)) return miss();
    return quote(BigInt(hex), 18, LAUNCH_CHAIN_META[chain].native);
  } catch (err) {
    console.error("launch fee", chain, factory, err);
    return miss();
  }
}

async function tronFeeSun(address: string): Promise<bigint | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch("https://api.trongrid.io/wallet/triggerconstantcontract", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          owner_address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
          contract_address: address,
          function_selector: "launchFeeSun()",
          visible: true,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const body = (await res.json()) as { constant_result?: string[]; result?: { message?: string }; Error?: string };
      const hex = body.constant_result?.[0] ?? "";
      if (/^[0-9a-fA-F]{1,64}$/.test(hex)) return BigInt(`0x${hex}`);
      const msg = `${body.result?.message ?? ""} ${body.Error ?? ""}`;
      if (attempt === 0 && /rate|suspend|429|too many/i.test(msg)) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        continue;
      }
      console.error("launch fee tron", address, msg || res.status);
      return null;
    } catch (err) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      console.error("launch fee tron", address, err);
      return null;
    }
  }
  return null;
}

async function tronFee(address: string): Promise<FeeQuote> {
  const sun = await tronFeeSun(address);
  return sun == null ? miss() : quote(sun, 6, "TRX");
}

/** The base Solana launch fee, before any FERZAN holder discount. */
async function solanaFee(): Promise<FeeQuote> {
  try {
    const res = await fetch(`${API}/ferzan-perks/11111111111111111111111111111111`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return miss();
    const body = (await res.json()) as { launch_fee_sol?: unknown };
    const n = body.launch_fee_sol;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1_000) return miss();
    return quote(BigInt(Math.round(n * 1e9)), 9, "SOL");
  } catch (err) {
    console.error("launch fee solana", err);
    return miss();
  }
}

let cache: { at: number; value: LaunchFeeTable } | null = null;

export async function readLaunchFees(): Promise<LaunchFeeTable> {
  if (cache && Date.now() - cache.at < 20_000) return cache.value;
  const [sol, tron, evm] = await Promise.all([
    solanaFee(),
    (async () => {
      const curve = await tronFee(TRON_CURVE_FACTORY);
      const plain = await tronFee(TRON_PLAIN_FACTORY);
      return { curve, plain };
    })(),
    Promise.all(
      EVM.map(async (chain) => {
        const [curve, plain] = await Promise.all([evmFee(chain, FACTORIES[chain]), evmFee(chain, PLAIN_FACTORIES[chain])]);
        return [chain, curve, plain] as const;
      }),
    ),
  ]);
  const value = {
    solana: { curve: sol, plain: sol },
    tron,
    // No public getter. Do not invent 0.
    ton: { curve: miss(), plain: miss() },
  } as LaunchFeeTable;
  for (const [chain, curve, plain] of evm) {
    value[chain] = { curve, plain };
  }
  cache = { at: Date.now(), value };
  return value;
}
