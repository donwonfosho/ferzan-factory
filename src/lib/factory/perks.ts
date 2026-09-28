/**
 * FERZAN holder perks for a Solana wallet, from the public Launch Bot API (read-only).
 * Before FERZAN is announced the API answers active = false and the site just explains the perks.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";

export type PerkTier = "none" | "holder" | "whale";
export type Perks = {
  active: boolean;
  tier: PerkTier;
  balance: number;
  badge: string;
  launchFeeOffPct: number;
  launchFeeSol: number;
  yourLaunchFeeSol: number;
  holderMin: number;
  whaleMin: number;
};

export const PERK_DEFAULTS: Perks = {
  active: false,
  tier: "none",
  balance: 0,
  badge: "",
  launchFeeOffPct: 0,
  launchFeeSol: 0.05,
  yourLaunchFeeSol: 0.05,
  holderMin: 1_000_000,
  whaleMin: 10_000_000,
};

const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);

export const getPerks = createServerFn({ method: "GET" })
  .validator((data: unknown): { wallet: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const wallet = String(row.wallet ?? "").trim();
    if (wallet && !SOL.test(wallet)) throw new Error("bad address");
    return { wallet };
  })
  .handler(async ({ data }): Promise<Perks> => {
    // Without a wallet, ask about a placeholder address so the thresholds and fee still come from the server.
    const who = data.wallet || "11111111111111111111111111111111";
    const res = await fetch(`${API}/ferzan-perks/${who}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!res || !res.ok) return PERK_DEFAULTS;
    const it = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const tier: PerkTier = it.tier === "holder" || it.tier === "whale" ? it.tier : "none";
    const mine = Boolean(data.wallet);
    return {
      active: it.active === true,
      tier: mine ? tier : "none",
      balance: mine ? num(it.balance, 0) : 0,
      badge: mine && typeof it.badge === "string" ? it.badge.slice(0, 40) : "",
      launchFeeOffPct: mine ? Math.min(100, num(it.launch_fee_off_pct, 0)) : 0,
      launchFeeSol: num(it.launch_fee_sol, PERK_DEFAULTS.launchFeeSol),
      yourLaunchFeeSol: mine ? num(it.your_launch_fee_sol, num(it.launch_fee_sol, 0.05)) : num(it.launch_fee_sol, 0.05),
      holderMin: num(it.holder_min, PERK_DEFAULTS.holderMin),
      whaleMin: num(it.whale_min, PERK_DEFAULTS.whaleMin),
    };
  });
