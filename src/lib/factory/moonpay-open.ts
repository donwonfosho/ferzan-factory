import { moonpayUrl } from "./moonpay";

/** Opens MoonPay's SOL checkout for My Wallet. Throws if the browser blocks the page. */
export async function openSolCheckout(address: string, usd?: number): Promise<void> {
  const res = await moonpayUrl({
    data: {
      chain: "solana",
      address,
      code: "sol",
      ...(usd != null ? { baseCurrencyAmount: usd.toFixed(2) } : {}),
    },
  });
  const popup = window.open(res.url, "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Allow pop-ups, then press the button again.");
}
