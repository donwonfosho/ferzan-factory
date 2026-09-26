import { createServerFn } from "@tanstack/react-start";

const CURRENCY: Record<string, string> = {
  solana: "sol",
  ethereum: "eth",
  base: "eth_base",
  bsc: "bnb_bsc",
  robinhood: "eth",
  arc: "usdc",
};

function clean(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") throw new Error("Bad fund request.");
  return data as Record<string, unknown>;
}

/** Signed MoonPay checkout into the site wallet. Card and Apple Pay live inside that window. */
export const moonpayUrl = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; address: string } => {
    const row = clean(data);
    const chain = typeof row.chain === "string" ? row.chain : "";
    const address = typeof row.address === "string" ? row.address.trim() : "";
    if (!CURRENCY[chain]) throw new Error("That chain cannot be funded here.");
    const evm = /^0x[a-fA-F0-9]{40}$/.test(address);
    const sol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    if (chain === "solana" ? !sol : !evm) throw new Error("Address looks wrong.");
    return { chain, address };
  })
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; reason: "key" }> => {
    const { env } = await import("@/lib/env.server");
    const { createHmac } = await import("node:crypto");
    const publishable = env("MOONPAY_PUBLISHABLE_KEY");
    if (!publishable) return { ok: false, reason: "key" };
    const params = new URLSearchParams({
      apiKey: publishable,
      currencyCode: CURRENCY[data.chain],
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
    return { ok: true, url: `https://buy.moonpay.com?${params.toString()}` };
  });
