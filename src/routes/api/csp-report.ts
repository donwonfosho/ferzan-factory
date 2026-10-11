import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY = 4_096;
const SEEN_MS = 10 * 60_000;
const seen = new Map<string, number>();

/**
 * Browser CSP reports for the report-only policy. Stores the blocked URL and the directive only.
 * Query strings are dropped. The page address and the policy text are not kept.
 */
export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await (await import("@/lib/factory/guard.server")).guardRelayBudget("read");
        } catch {
          return new Response(null, { status: 429 });
        }
        const declared = request.headers.get("content-length");
        if (declared !== null && Number(declared) > MAX_BODY) return new Response(null, { status: 413 });
        let raw = "";
        try {
          raw = await request.text();
        } catch {
          return new Response(null, { status: 204 });
        }
        if (raw.length > MAX_BODY) return new Response(null, { status: 413 });
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response(null, { status: 204 });
        }
        const report = readReport(body);
        if (report && firstReport(report.blocked, report.directive)) await sendReport(report.blocked, report.directive);
        return new Response(null, { status: 204 });
      },
    },
  },
});

function firstReport(blocked: string, directive: string): boolean {
  const now = Date.now();
  for (const [key, at] of seen) {
    if (now - at >= SEEN_MS) seen.delete(key);
  }
  const pair = `${blockedHost(blocked)}\n${directive}`;
  if (seen.has(pair)) return false;
  seen.set(pair, now);
  return true;
}

function blockedHost(blocked: string): string {
  try {
    return new URL(blocked).host || blocked;
  } catch {
    return blocked;
  }
}

function readReport(body: unknown): { blocked: string; directive: string } | null {
  const row = reportRow(body);
  if (!row) return null;
  const blocked = stripQuery(text(row, ["blocked-uri", "blockedURL", "blocked-url"]));
  const directive = text(row, ["effective-directive", "effectiveDirective", "violated-directive", "violatedDirective"])
    .split(" ")[0]
    .slice(0, 80);
  if (!blocked || !directive) return null;
  return { blocked: blocked.slice(0, 180), directive };
}

function reportRow(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) {
    const first = body[0];
    if (!first || typeof first !== "object") return null;
    const inner = (first as { body?: unknown }).body;
    return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : null;
  }
  const wrap = (body as { "csp-report"?: unknown })["csp-report"];
  if (wrap && typeof wrap === "object") return wrap as Record<string, unknown>;
  return body as Record<string, unknown>;
}

function text(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
}

function stripQuery(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}

async function sendReport(blocked: string, directive: string): Promise<void> {
  const dsn = (process.env.VITE_SENTRY_DSN ?? "").trim();
  if (!dsn) {
    console.info(`csp ${directive} ${blocked}`);
    return;
  }
  try {
    const Sentry = await import("@sentry/node");
    if (!Sentry.getClient()) Sentry.init({ dsn, tracesSampleRate: 0 });
    Sentry.captureMessage("csp", { level: "warning", extra: { blocked, directive } });
  } catch {
    console.info(`csp ${directive} ${blocked}`);
  }
}
