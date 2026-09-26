export const LIVE_CHAINS = ["ethereum", "bsc", "base", "robinhood", "solana", "arc"] as const;
export type LiveChainId = (typeof LIVE_CHAINS)[number];
export type ChainId = LiveChainId;
export type BotId = "trade" | "buy" | "guardian";
export type Mode = "plain" | "curve";
export type Kind = "primary" | "attached";

export type ChainMeta = {
  id: ChainId;
  label: string;
  native: string;
  nativeDecimals: number;
  tokenDecimals: number;
  status: "live" | "soon";
  reason?: string;
};

export type BotMeta = {
  id: BotId;
  name: string;
  handle?: string;
  href?: string;
  blurb: string;
};

export type TapeTick = {
  t: number;
  side: "buy" | "sell" | "stamp" | "arm" | "grad";
  who: string;
  detail: string;
  price: number;
};

export type Alloc = { label: string; bps: number };

export type Launch = {
  id: string;
  kind: Kind;
  chain: ChainId;
  mode: Mode;
  name: string;
  symbol: string;
  supplyRaw: string;
  supplyWhole: string;
  creator: string;
  blurb: string;
  telegram: string;
  xHandle: string;
  image: string;
  contract: string;
  devBuy: string;
  createdAt: number;
  virtualEth: string;
  virtualToken: string;
  graduation: string;
  realEth: string;
  raisedEth: string;
  tokensSold: string;
  graduated: boolean;
  startAt: number;
  maxBuy: string;
  allocs: Alloc[];
  feePlatform: string;
  feeCreator: string;
  feeReferrer: string;
  lastPrice: number;
  primaryId: string | null;
  bots: BotId[];
  group: string;
  tape: TapeTick[];
};

export type Desk = {
  balances: Record<ChainId, string>;
  tokens: Record<string, string>;
  bought: Record<string, string>;
};

export type Floor = { launches: Launch[]; desk: Desk };

export type PrimaryInput = {
  chain: LiveChainId;
  mode: Mode;
  name: string;
  symbol: string;
  supplyWhole: string;
  graduation: string;
  virtualNative: string;
  virtualTokenWhole: string;
  devBuy: string;
  delayMin: string;
  maxBuy: string;
  allocs: { label: string; percent: string }[];
  blurb: string;
  telegram: string;
  xHandle: string;
  image: string;
  creator: string;
  contract: string;
};

export type AttachInput = {
  primaryId: string;
  name: string;
  group: string;
  bots: BotId[];
  blurb: string;
  creator: string;
};

export type TradeInput = {
  launchId: string;
  side: "buy" | "sell";
  amount: string;
  attachId: string | null;
};
