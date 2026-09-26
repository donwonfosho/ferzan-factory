import type { BotId, BotMeta, ChainId, ChainMeta } from "./types";

export const CHAINS: Record<ChainId, ChainMeta> = {
  ethereum: {
    id: "ethereum",
    label: "Ethereum",
    native: "ETH",
    nativeDecimals: 18,
    tokenDecimals: 18,
    status: "live",
  },
  bsc: {
    id: "bsc",
    label: "BNB Chain",
    native: "BNB",
    nativeDecimals: 18,
    tokenDecimals: 18,
    status: "live",
  },
  base: {
    id: "base",
    label: "Base",
    native: "ETH",
    nativeDecimals: 18,
    tokenDecimals: 18,
    status: "live",
  },
  robinhood: {
    id: "robinhood",
    label: "Robinhood",
    native: "ETH",
    nativeDecimals: 18,
    tokenDecimals: 18,
    status: "live",
  },
  solana: {
    id: "solana",
    label: "Solana",
    native: "SOL",
    nativeDecimals: 9,
    tokenDecimals: 6,
    status: "live",
  },
  arc: {
    id: "arc",
    label: "Arc",
    native: "USDC",
    nativeDecimals: 18,
    tokenDecimals: 18,
    status: "live",
  },
};

export const BOTS: BotMeta[] = [
  {
    id: "trade",
    name: "Trade Desk",
    handle: "Ferzan_Trade_Bot",
    href: "https://t.me/Ferzan_Trade_Bot",
    blurb: "Buy, sell, snipe, copy, limits, and trailing stops. You sign. The bot never holds the key.",
  },
  {
    id: "buy",
    name: "Buy alerts",
    handle: "Ferzan_Buy_Bot",
    href: "https://t.me/Ferzan_Buy_Bot",
    blurb: "Prints buys into the group the moment they land.",
  },
  {
    id: "guardian",
    name: "Guardian",
    handle: "Ferzan_Guardian_Bot",
    href: "https://t.me/Ferzan_Guardian_Bot",
    blurb: "Chat moderator for the group. It is not a honeypot checker.",
  },
];

export const COMMUNITY_URL = "https://t.me/Ferzan_Chat";
export const X_URL = "https://x.com/ferzaneco";

export const PLACES = [
  {
    name: "Launch Bot",
    handle: "Ferzan_Launch_Bot",
    href: "https://t.me/Ferzan_Launch_Bot",
    blurb: "Launch a coin from Telegram. You sign. The bot does not hold the key.",
  },
  {
    name: "Trade Desk",
    handle: "Ferzan_Trade_Bot",
    href: "https://t.me/Ferzan_Trade_Bot",
    blurb: "Buy, sell, snipe, copy, limits, and trailing stops.",
  },
  {
    name: "Buy Bot",
    handle: "Ferzan_Buy_Bot",
    href: "https://t.me/Ferzan_Buy_Bot",
    blurb: "Posts every buy of your coin into your group.",
  },
  {
    name: "Launches",
    handle: "Ferzan_Launches",
    href: "https://t.me/Ferzan_Launches",
    blurb: "Every Telegram launch, milestone, and graduation.",
  },
  {
    name: "Guardian",
    handle: "Ferzan_Guardian_Bot",
    href: "https://t.me/Ferzan_Guardian_Bot",
    blurb: "Moderates the group. It is not a honeypot checker.",
  },
  {
    name: "Trending",
    handle: "Ferzan_Trending",
    href: "https://t.me/Ferzan_Trending",
    blurb: "What is moving.",
  },
  {
    name: "Raid leaderboard",
    handle: "Ferzan_Raid",
    href: "https://t.me/Ferzan_Raid",
    blurb: "The raid board.",
  },
  {
    name: "Ecosystem hub",
    handle: "Ferzan_Trade_Ecosystem",
    href: "https://t.me/Ferzan_Trade_Ecosystem",
    blurb: "The Ferzan hub.",
  },
  {
    name: "Ecosystem chat",
    handle: "Ferzan_Chat",
    href: "https://t.me/Ferzan_Chat",
    blurb: "The public chat.",
  },
  {
    name: "X",
    handle: "ferzaneco",
    href: "https://x.com/ferzaneco",
    blurb: "Ferzan Trade on X.",
  },
];

export const BOT_BY_ID: Record<BotId, BotMeta> = {
  trade: BOTS[0],
  buy: BOTS[1],
  guardian: BOTS[2],
};

export function botMeta(id: string): BotMeta | undefined {
  return BOTS.find((bot) => bot.id === id);
}

export const TREASURY = {
  evm: "0x4d5955afb9ABF5943729CB74A0196498483e4622",
  sol: "6yxsKcSeqAcoLXgyKDtVVW7Hb2d4uLYVT8X9zGa64HRp",
};
