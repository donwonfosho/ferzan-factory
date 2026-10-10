/**
 * Launch fee for each chain, read from the factory that charges it.
 * The browser only gets the amount. It never talks to the chains itself.
 */
import { createServerFn } from "@tanstack/react-start";
import { BOT_LAUNCH_CHAINS, type BotLaunchChain } from "./bot-launch";

export type FeeQuote = { ok: true; raw: string; decimals: number; symbol: string } | { ok: false };
export type LaunchFeeTable = Record<BotLaunchChain, { curve: FeeQuote; plain: FeeQuote }>;

const miss = (): FeeQuote => ({ ok: false });

/** Every chain unread. Used when the fee read itself fails. */
export function emptyLaunchFees(): LaunchFeeTable {
  return Object.fromEntries(BOT_LAUNCH_CHAINS.map((id) => [id, { curve: miss(), plain: miss() }])) as LaunchFeeTable;
}

export const getLaunchFees = createServerFn({ method: "GET" }).handler(async (): Promise<LaunchFeeTable> => {
  return (await import("./launch-fees.server")).readLaunchFees();
});
