import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/coin/$chain/$id/trades")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
            "access-control-max-age": "600",
          },
        }),
      GET: async ({ params }) => {
        const { publicHeaders, openChain, openId, tradesBody } = await import("@/lib/factory/public-read.server");
        try {
          await (await import("@/lib/factory/guard.server")).guardRelayBudget("read");
        } catch {
          return new Response(JSON.stringify({ error: "Too many requests." }), { status: 429, headers: publicHeaders(429) });
        }
        try {
          const chain = openChain(params.chain);
          if (!chain) return new Response(JSON.stringify({ error: "That chain is not open." }), { status: 400, headers: publicHeaders(400) });
          return new Response(await tradesBody(chain, openId(params.id)), { status: 200, headers: publicHeaders() });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Bad request.";
          return new Response(JSON.stringify({ error: message }), { status: 400, headers: publicHeaders(400) });
        }
      },
    },
  },
});
