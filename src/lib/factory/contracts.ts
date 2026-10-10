/**
 * Public Ferzan contracts the site already uses. Addresses only — no trading logic.
 * Curve factories and the Solana program create one curve per coin; those curve addresses
 * are not listed here because each one is created at launch and shown on that coin's page.
 * There is no Ferzan bridge contract: the bridge uses Relay and deBridge.
 * There is no TON factory address in this repo.
 */
import type { CurveLaunchChain } from "./bot-launch";

/** Current (v3) bonding-curve factories. Same addresses the Launch API uses. */
export const FACTORIES: Record<CurveLaunchChain, string> = {
  bsc: "0xe8ca8382ab3ab55ffb310fb55da988fb83c922bd",
  base: "0x10b1c446ff600dfc4dd9218a364bdbaf93a0fea2",
  ethereum: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
  robinhood: "0xb56b4184dbb5bc5c67168ae3a4960e69392118de",
  arc: "0xe8ca8382ab3ab55ffb310fb55da988fb83c922bd",
};

/** Current (v3) standard-coin factories. A standard launch goes here, never to a curve factory. */
export const PLAIN_FACTORIES: Record<CurveLaunchChain, string> = {
  bsc: "0x10b1c446ff600dfc4dd9218a364bdbaf93a0fea2",
  base: "0xe8ca8382ab3ab55ffb310fb55da988fb83c922bd",
  ethereum: "0x05a1290f6cabb1681f2599b2935f8b3ee5981cba",
  robinhood: "0x05a1290f6cabb1681f2599b2935f8b3ee5981cba",
  arc: "0x7a7ef0415ac2f118cdf0ce9090b0207d43da1d3c",
};

/** Ferzan's Tron plain-launch factory. */
export const TRON_PLAIN_FACTORY = "TBcPG1XKutsns1dJtgJeWQDuGRxeESeMXn";

/** Ferzan's Tron curve factory. A launch built for any other contract is refused. */
export const TRON_CURVE_FACTORY = "TPS1aM5TwfmJHjzuA1XMy6wWme2LYqZ1BN";

/** Ferzan's Solana curve program. */
export const SOLANA_CURVE_PROGRAM = "G7n5XBB7pjvKS7JfC6esgQGGAyPku5cposdiHfVAUxnJ";
