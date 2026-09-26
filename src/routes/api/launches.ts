import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/launches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Send JSON." }, { status: 400 });
        }
        const { ingestLaunch } = await import("@/lib/factory/ingest.server");
        const result = await ingestLaunch(body);
        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
    },
  },
});
