/**
 * Server error tracking. Off unless VITE_SENTRY_DSN is set at runtime.
 * The key is read dynamically so a build without the variable does not bake in an empty DSN.
 * No wallet addresses, user ids, or request bodies.
 */
import { scrubSentry } from "../../src/lib/factory/sentry-scrub";

function dsn(): string {
  const value = process.env["VITE_SENTRY_DSN"];
  return typeof value === "string" ? value.trim() : "";
}

let ready: Promise<void> | null = null;

function boot(): Promise<void> {
  const id = dsn();
  if (!id) return Promise.resolve();
  if (!ready) {
    ready = import("@sentry/node")
      .then((Sentry) => {
        Sentry.init({
          dsn: id,
          sampleRate: 0.05,
          tracesSampleRate: 0,
          beforeSend(event) {
            return scrubSentry(event);
          },
        });
      })
      .catch(() => {
        ready = null;
      });
  }
  return ready;
}

export default async function sentryMiddleware(
  _event: unknown,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if (!dsn()) return next();
  await boot();
  try {
    return await next();
  } catch (err) {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.captureException(err);
      await Sentry.flush(1500);
    } catch {
      /* a monitor failure must not change the response */
    }
    throw err;
  }
}
