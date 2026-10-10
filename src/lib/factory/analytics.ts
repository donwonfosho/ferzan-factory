/** Cookieless counts via Plausible. Off until VITE_PLAUSIBLE_DOMAIN is set. Never sends a wallet or a user id. */

export const ANALYTICS_EVENTS = [
  "wallet_connected",
  "add_funds_clicked",
  "cash_out_clicked",
  "bridge_started",
  "launch_started",
  "launch_completed",
  "share_clicked",
  "feedback_sent",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type Plausible = ((event: string, options?: { u?: string }) => void) & { q?: unknown[] };

function client(): Plausible | null {
  if (typeof window === "undefined") return null;
  if (!import.meta.env.VITE_PLAUSIBLE_DOMAIN) return null;
  const w = window as Window & { plausible?: Plausible };
  if (!w.plausible) {
    const queued = ((...args: unknown[]) => {
      (queued.q = queued.q || []).push(args);
    }) as Plausible;
    queued.q = [];
    w.plausible = queued;
  }
  return w.plausible;
}

/** Path with address-shaped segments removed, so a creator page is not a wallet in the logs. */
export function publicPath(path: string): string {
  return path
    .split("?")[0]
    .replace(/0x[a-fA-F0-9]{40,64}/gi, ":id")
    .replace(/[EUk]Q[A-Za-z0-9_-]{46}/g, ":id")
    .replace(/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g, ":id")
    .replace(/\/[1-9A-HJ-NP-Za-km-z]{32,48}(?=\/|$)/g, "/:id");
}

export function track(event: AnalyticsEvent | "pageview"): void {
  const plausible = client();
  if (!plausible || typeof window === "undefined") return;
  const url = `${window.location.origin}${publicPath(window.location.pathname)}`;
  plausible(event, { u: url });
}
