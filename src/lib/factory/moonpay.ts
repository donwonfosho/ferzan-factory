import { createServerFn } from "@tanstack/react-start";
import { tonWalletAddress } from "./ton-address";

/** MoonPay currency codes, checked against MoonPay's list. The first code is the chain's own coin. */
export const FUND_CODES: Record<string, readonly string[]> = {
  solana: ["sol", "usdc_sol"],
  ethereum: ["eth", "usdc"],
  base: ["eth_base", "usdc_base"],
  bsc: ["bnb_bsc"],
  arbitrum: ["eth_arbitrum", "usdc_arbitrum"],
  optimism: ["eth_optimism"],
  polygon: ["pol_polygon", "usdc_polygon"],
  avalanche: ["avax_cchain"],
  robinhood: ["eth_robinhood"],
  arc: ["usdc_arc"],
  linea: ["eth_linea"],
  monad: ["mon_mon"],
  hyperevm: ["hype_hyperevm", "usdc_hyperevm"],
  tron: ["trx"],
  ton: ["ton"],
};

/** Codes MoonPay will sell for USD. Robinhood and Arc are not in this list. */
export const SELL_CODES = ["sol", "usdc_sol", "eth", "usdc", "eth_base", "usdc_base", "bnb_bsc", "trx", "ton"] as const;

function clean(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") throw new Error("Bad fund request.");
  return data as Record<string, unknown>;
}

/** UQ form only. An EQ address is converted; anything that is not a wallet address is refused. */
function tonReceive(address: string): string | null {
  const uq = tonWalletAddress(address);
  if (uq.startsWith("UQ") && /^UQ[A-Za-z0-9_-]{46}$/.test(uq)) return uq;
  return null;
}

function receiveAddress(chain: string, address: string): string | null {
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) ? address : null;
  if (chain === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) ? address : null;
  if (chain === "ton") return tonReceive(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : null;
}

/** Signed MoonPay checkout when a publishable key is set. Otherwise the same hosted page with no key and no signature. */
export const moonpayUrl = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; address: string; code: string } => {
    const row = clean(data);
    const chain = typeof row.chain === "string" ? row.chain : "";
    const codes = FUND_CODES[chain];
    if (!codes) throw new Error("That chain cannot be funded here.");
    const asked = typeof row.code === "string" ? row.code : codes[0];
    if (!codes.includes(asked)) throw new Error("That chain cannot be funded here.");
    const raw = typeof row.address === "string" ? row.address.trim() : "";
    const address = receiveAddress(chain, raw);
    if (!address) throw new Error("Address looks wrong.");
    return { chain, address, code: asked };
  })
  .handler(async ({ data }): Promise<{ ok: true; url: string; signed: boolean }> => {
    await (await import("./guard.server")).guardRelay("send");
    const { env } = await import("@/lib/env.server");
    const publishable = env("MOONPAY_PUBLISHABLE_KEY");
    if (!publishable) {
      const params = new URLSearchParams({
        currencyCode: data.code,
        walletAddress: data.address,
        baseCurrencyCode: "usd",
        enabledPaymentMethods: "apple_pay,google_pay,credit_debit_card",
        showWalletAddressForm: "true",
      });
      return { ok: true, url: `https://buy.moonpay.com/?${params.toString()}`, signed: false };
    }
    const { createHmac } = await import("node:crypto");
    const params = new URLSearchParams({
      apiKey: publishable,
      currencyCode: data.code,
      walletAddress: data.address,
      showWalletAddressForm: "false",
      colorCode: "39F3C3",
    });
    const query = `?${params.toString()}`;
    const secret = env("MOONPAY_SECRET_KEY");
    if (secret) {
      const signature = createHmac("sha256", secret).update(query).digest("base64");
      params.set("signature", signature);
    }
    return { ok: true, url: `https://buy.moonpay.com?${params.toString()}`, signed: true };
  });
