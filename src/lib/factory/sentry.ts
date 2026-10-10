import { scrubSentry } from "./sentry-scrub";

/** Browser errors only. Loaded when VITE_SENTRY_DSN was set at build time. */
export async function startBrowserSentry(dsn: string): Promise<void> {
  if (!dsn) return;
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    sampleRate: 0.05,
    tracesSampleRate: 0,
    beforeSend(event) {
      return scrubSentry(event);
    },
  });
}
