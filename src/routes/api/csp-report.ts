import { createFileRoute } from "@tanstack/react-router";

/**
 * Browser CSP reports for the report-only policy. Stores the blocked URL and the directive only.
 * Query strings are dropped. The page address and the policy text are not kept.
 */
export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 204 });
        }
        const report = readReport(body);
        if (report) await sendReport(report.blocked, report.directive);
        return new Response(null, { status: 204 });
      },
    },
  },
});

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
    const client = Sentry.getClient();
    const opts = client?.getOptions();
    const previous = opts?.sampleRate;
    if (!client) Sentry.init({ dsn, sampleRate: 1, tracesSampleRate: 0 });
    else if (opts) opts.sampleRate = 1;
    Sentry.captureMessage("csp", { level: "warning", extra: { blocked, directive } });
    await Sentry.flush(1500);
    if (opts && previous !== undefined) opts.sampleRate = previous;
  } catch {
    console.info(`csp ${directive} ${blocked}`);
  }
}
