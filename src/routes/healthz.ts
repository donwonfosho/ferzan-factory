import { createFileRoute } from "@tanstack/react-router";

/** Uptime probe. Does not touch the database. */
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
