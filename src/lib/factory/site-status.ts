/**
 * Public read of https://launch.ferzaneco.com/api/status.
 * Only status, updated, and component name/status leave this server. Cached 20 seconds.
 */
import { createServerFn } from "@tanstack/react-start";

const URL = "https://launch.ferzaneco.com/api/status";
const TTL_MS = 20_000;

export type Overall = "normal" | "degraded" | "down" | "unknown";
export type PartStatus = "normal" | "down" | "unknown";
export type StatusPart = { name: string; status: PartStatus };
export type SiteStatus = {
  reach: "ok" | "fail";
  status: Overall;
  updated: number;
  components: StatusPart[];
};

const FAIL: SiteStatus = { reach: "fail", status: "degraded", updated: 0, components: [] };

function partStatus(v: unknown): PartStatus | null {
  return v === "normal" || v === "down" || v === "unknown" ? v : null;
}

function parse(raw: unknown): SiteStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const status = row.status;
  if (status !== "normal" && status !== "degraded" && status !== "down" && status !== "unknown") return null;
  const updated = typeof row.updated === "number" && row.updated >= 1_000_000_000 && row.updated < 100_000_000_000 ? Math.floor(row.updated) : 0;
  const components: StatusPart[] = [];
  if (Array.isArray(row.components)) {
    for (const item of row.components) {
      if (components.length >= 12) break;
      if (!item || typeof item !== "object") continue;
      const part = item as Record<string, unknown>;
      const name = typeof part.name === "string" ? part.name.trim().slice(0, 80) : "";
      const st = partStatus(part.status);
      if (!name || !st) continue;
      components.push({ name, status: st });
    }
  }
  return { reach: "ok", status, updated, components };
}

async function pull(): Promise<SiteStatus> {
  try {
    const res = await fetch(URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
    if (!res.ok) return FAIL;
    return parse(await res.json()) ?? { reach: "ok", status: "unknown", updated: 0, components: [] };
  } catch {
    return FAIL;
  }
}

let cached: { at: number; value: SiteStatus } | null = null;
let inflight: Promise<SiteStatus> | null = null;

export const getSiteStatus = createServerFn({ method: "GET" }).handler(async (): Promise<SiteStatus> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!inflight) {
    inflight = pull()
      .then((value) => {
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
});
