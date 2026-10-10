/** MoonPay hosted checkout links. Built in the browser. No API key, no signature, no server call. */

export type FundKind = "solana" | "evm" | "ton" | "tron";
export type FundMode = "card" | "base" | "off";

export type FundChain = {
  id: string;
  label: string;
  kind: FundKind;
  /** MoonPay currencyCode values a card can buy. Empty when this chain has no card checkout. */
  buy: readonly string[];
  /** MoonPay baseCurrencyCode values that can be sold. null means cash out is not on this chain. */
  sell: readonly string[] | null;
  mode: FundMode;
};

export const FUND_CHAINS: readonly FundChain[] = [
  { id: "solana", label: "Solana", kind: "solana", buy: ["sol", "usdc_sol"], sell: ["sol", "usdc_sol"], mode: "card" },
  { id: "ethereum", label: "Ethereum", kind: "evm", buy: ["eth", "usdc"], sell: ["eth", "usdc"], mode: "card" },
  { id: "base", label: "Base", kind: "evm", buy: ["eth_base", "usdc_base"], sell: ["eth_base", "usdc_base"], mode: "card" },
  { id: "bsc", label: "BNB Chain", kind: "evm", buy: ["bnb_bsc"], sell: ["bnb_bsc"], mode: "card" },
  { id: "arbitrum", label: "Arbitrum", kind: "evm", buy: ["eth_arbitrum", "usdc_arbitrum"], sell: ["eth_arbitrum", "usdc_arbitrum"], mode: "card" },
  { id: "optimism", label: "Optimism", kind: "evm", buy: ["eth_optimism"], sell: null, mode: "card" },
  { id: "polygon", label: "Polygon", kind: "evm", buy: ["pol_polygon", "usdc_polygon"], sell: null, mode: "card" },
  { id: "avalanche", label: "Avalanche", kind: "evm", buy: ["avax_cchain"], sell: ["avax_cchain"], mode: "card" },
  { id: "ton", label: "TON", kind: "ton", buy: ["ton"], sell: ["ton"], mode: "card" },
  { id: "tron", label: "Tron", kind: "tron", buy: ["trx"], sell: ["trx"], mode: "card" },
  { id: "arc", label: "Arc", kind: "evm", buy: ["usdc_arc"], sell: null, mode: "card" },
  { id: "robinhood", label: "Robinhood Chain", kind: "evm", buy: ["eth_robinhood"], sell: null, mode: "card" },
  { id: "linea", label: "Linea", kind: "evm", buy: ["eth_linea"], sell: null, mode: "card" },
  { id: "monad", label: "Monad", kind: "evm", buy: ["mon_mon"], sell: null, mode: "card" },
  { id: "hyperevm", label: "HyperEVM", kind: "evm", buy: ["hype_hyperevm", "usdc_hyperevm"], sell: null, mode: "card" },
  { id: "sonic", label: "Sonic", kind: "evm", buy: [], sell: null, mode: "base" },
  { id: "ink", label: "Ink", kind: "evm", buy: [], sell: null, mode: "base" },
  { id: "pulsechain", label: "PulseChain", kind: "evm", buy: [], sell: null, mode: "off" },
  { id: "stable", label: "Stable", kind: "evm", buy: [], sell: null, mode: "off" },
];

/** What the button says. The MoonPay code stays in the URL. */
const TICKER: Record<string, string> = {
  sol: "SOL",
  usdc_sol: "USDC",
  eth: "ETH",
  usdc: "USDC",
  eth_base: "ETH",
  usdc_base: "USDC",
  bnb_bsc: "BNB",
  eth_arbitrum: "ETH",
  usdc_arbitrum: "USDC",
  eth_optimism: "ETH",
  pol_polygon: "POL",
  usdc_polygon: "USDC",
  avax_cchain: "AVAX",
  ton: "TON",
  trx: "TRX",
  usdc_arc: "USDC",
  eth_robinhood: "ETH",
  eth_linea: "ETH",
  mon_mon: "MON",
  hype_hyperevm: "HYPE",
  usdc_hyperevm: "USDC",
};

export function fundTicker(code: string): string {
  return TICKER[code] ?? code;
}

export function fundChain(id: string): FundChain | undefined {
  return FUND_CHAINS.find((row) => row.id === id);
}

/** First card currency for a site chain, used by the small "Card or Apple Pay" button. */
const LIVE_CODE: Record<string, string> = {
  solana: "sol",
  ethereum: "eth",
  base: "eth_base",
  bsc: "bnb_bsc",
  robinhood: "eth_robinhood",
  arc: "usdc_arc",
};

export function liveBuyCode(chain: string): string | null {
  return LIVE_CODE[chain] ?? null;
}

export function addressFits(kind: FundKind, address: string): boolean {
  const s = address.trim();
  if (kind === "evm") return /^0x[a-fA-F0-9]{40}$/.test(s);
  if (kind === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  if (kind === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s);
  return /^UQ[A-Za-z0-9_-]{46}$/.test(s) || /^-?[01]:[0-9a-fA-F]{64}$/.test(s);
}

/** Hosted buy page. The address is encoded. MoonPay must show this same address, not its own wallet. */
export function moonpayBuyLink(code: string, address: string): string {
  const params = new URLSearchParams();
  params.set("currencyCode", code);
  params.set("walletAddress", address.trim());
  params.set("baseCurrencyCode", "usd");
  params.set("enabledPaymentMethods", "apple_pay,google_pay,credit_debit_card");
  params.set("showWalletAddressForm", "true");
  return `https://buy.moonpay.com/?${params.toString()}`;
}

/** Hosted sell page. The visitor sends from their own wallet to the address MoonPay shows. */
export function moonpaySellLink(code: string): string {
  const params = new URLSearchParams();
  params.set("baseCurrencyCode", code);
  params.set("quoteCurrencyCode", "usd");
  return `https://sell.moonpay.com/?${params.toString()}`;
}
