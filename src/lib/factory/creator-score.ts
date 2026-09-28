/**
 * Ferzan creator score for coins launched through the Ferzan Launch Bot (any chain):
 * the creator's other launches, same-day launch sprees and, on curves, what the dev bought and sold.
 * Read-only, from the public Launch Bot API.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";

export type CreatorScore = { score: number; label: "Good" | "Caution" | "Risky"; lines: string[] };

const ADDRESS = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46})$/;

export const getCreatorScore = createServerFn({ method: "GET" })
  .validator((data: unknown): { token: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const token = String(row.token ?? "").trim();
    if (!ADDRESS.test(token)) throw new Error("bad address");
    return { token };
  })
  .handler(async ({ data }): Promise<CreatorScore | null> => {
    const res = await fetch(`${API}/creator-score/${encodeURIComponent(data.token)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const it = (await res.json()) as Record<string, unknown>;
    if (it.found !== true) return null;
    const score = typeof it.score === "number" && Number.isFinite(it.score) ? Math.max(0, Math.min(100, Math.round(it.score))) : 0;
    const label = it.label === "Good" || it.label === "Caution" || it.label === "Risky" ? it.label : "Caution";
    const lines = Array.isArray(it.lines) ? it.lines.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 120)).slice(0, 5) : [];
    return { score, label, lines };
  });
