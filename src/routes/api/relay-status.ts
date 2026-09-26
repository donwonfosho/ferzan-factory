import { createFileRoute } from "@tanstack/react-router";

/**
 * Which visitor-address headers reach the server function, as true/false only.
 * Never returns address values: only true/false per header, which host the request came in on,
 * and a short salted hash of the visitor so two devices can be compared.
 */
const HEADERS = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for", "x-vercel-forwarded-for", "x-envoy-external-address"];

export const Route = createFileRoute("/api/relay-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const seen: Record<string, boolean> = {};
        for (const name of HEADERS) seen[name] = Boolean(request.headers.get(name));
        const { visitorTag } = await import("@/lib/factory/guard.server");
        const tag = await visitorTag();
        const door = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
        return Response.json(
          { rateLimitActive: Boolean(tag), door, visitorTag: tag, headersPresent: seen },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
