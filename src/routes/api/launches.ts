import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/launches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Only trusted senders may list coins. Set FERZAN_INGEST_SECRET in the project's environment.
        const secret = process.env.FERZAN_INGEST_SECRET ?? "";
        const given = request.headers.get("x-ferzan-ingest") ?? "";
        if (secret.length < 24 || !safeEqual(given, secret)) {
          return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
        }
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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
