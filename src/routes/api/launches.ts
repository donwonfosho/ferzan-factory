import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/launches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Only trusted senders may list coins. Set FERZAN_INGEST_SECRET in the project's environment.
        const secret = process.env.FERZAN_INGEST_SECRET ?? "";
        const given = request.headers.get("x-ferzan-ingest") ?? "";
        if (secret.length < 24 || !(await safeEqual(given, secret))) {
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

async function safeEqual(a: string, b: string): Promise<boolean> {
  // Compare fixed-length hashes in constant time, so neither the value nor its length leaks.
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
