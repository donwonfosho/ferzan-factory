import { createFileRoute } from "@tanstack/react-router";

function json(body: string, status = 200, headers?: Headers) {
  return new Response(body, { status, headers });
}

export const Route = createFileRoute("/api/v1/coins")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: cors() }),
      GET: async ({ request }) => {
        const { publicHeaders, openChain, openSort, coinsBody } = await import("@/lib/factory/public-read.server");
        const headers = publicHeaders();
        try {
          await (await import("@/lib/factory/guard.server")).guardRelayBudget("read");
        } catch {
          return json(JSON.stringify({ error: "Too many requests." }), 429, publicHeaders(429));
        }
        try {
          const url = new URL(request.url);
          const chain = openChain(url.searchParams.get("chain"));
          const sort = openSort(url.searchParams.get("sort"));
          return json(await coinsBody(chain, sort), 200, headers);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Bad request.";
          return json(JSON.stringify({ error: message }), 400, publicHeaders(400));
        }
      },
    },
  },
});

function cors() {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "600",
  });
}
