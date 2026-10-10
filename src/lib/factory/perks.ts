/**
 * FERZAN holder perks for a Solana wallet, from the public Launch Bot API (read-only).
 * Before FERZAN is announced the API answers active = false and the site just explains the perks.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";

export type PerkTier = "none" | "holder" | "whale";
export type PerkRow = { tier: string; min: number; badge: string; launchFeeOffPct: number };
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
  tiers: PerkRow[];
  nextTier: string;
  nextMin: number;
  tierName: string;
};

export const PERK_DEFAULTS: Perks = {
  active: false,
  tier: "none",
  balance: 0,
  badge: "",
  launchFeeOffPct: 0,
  launchFeeSol: 0,
  yourLaunchFeeSol: 0,
  holderMin: 1_000_000,
  whaleMin: 10_000_000,
  tiers: [
    { tier: "holder", min: 1_000_000, badge: "🔷 FERZAN holder", launchFeeOffPct: 50 },
    { tier: "whale", min: 10_000_000, badge: "🐋 FERZAN whale", launchFeeOffPct: 100 },
  ],
  nextTier: "",
  nextMin: 0,
  tierName: "none",
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
    const holderMin = num(it.holder_min, PERK_DEFAULTS.holderMin);
    const whaleMin = num(it.whale_min, PERK_DEFAULTS.whaleMin);
    const tiers = Array.isArray(it.tiers)
      ? it.tiers
          .map((raw) => {
            const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
            const name = typeof row.tier === "string" ? row.tier.slice(0, 20) : "";
            const min = num(row.min, 0);
            const badge = typeof row.badge === "string" ? row.badge.slice(0, 40) : "";
            if (!name || min <= 0 || !badge) return null;
            return { tier: name, min, badge, launchFeeOffPct: Math.min(100, num(row.launch_fee_off_pct, 0)) };
          })
          .filter((row): row is PerkRow => row !== null)
      : [];
    return {
      active: it.active === true,
      tier: mine ? tier : "none",
      balance: mine ? num(it.balance, 0) : 0,
      badge: mine && typeof it.badge === "string" ? it.badge.slice(0, 40) : "",
      launchFeeOffPct: mine ? Math.min(100, num(it.launch_fee_off_pct, 0)) : 0,
      launchFeeSol: num(it.launch_fee_sol, 0),
      yourLaunchFeeSol: mine ? num(it.your_launch_fee_sol, num(it.launch_fee_sol, 0)) : num(it.launch_fee_sol, 0),
      holderMin,
      whaleMin,
      tiers: tiers.length ? tiers : PERK_DEFAULTS.tiers,
      nextTier: mine && typeof it.next_tier === "string" ? it.next_tier.slice(0, 20) : "",
      nextMin: mine ? num(it.next_min, 0) : 0,
      tierName: mine && typeof it.tier === "string" ? it.tier.slice(0, 20) : "none",
    };
  });
