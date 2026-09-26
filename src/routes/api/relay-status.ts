import { createFileRoute } from "@tanstack/react-router";

/**
 * Which visitor-address headers reach the server function, as true/false only.
 * Never returns header values. Used to confirm the relay rate limit can see visitors.
 */
const HEADERS = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for", "x-vercel-forwarded-for", "x-envoy-external-address"];

export const Route = createFileRoute("/api/relay-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const seen: Record<string, boolean> = {};
        for (const name of HEADERS) seen[name] = Boolean(request.headers.get(name));
        const rateLimitActive = seen["cf-connecting-ip"];
        return Response.json({ rateLimitActive, headersPresent: seen }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
