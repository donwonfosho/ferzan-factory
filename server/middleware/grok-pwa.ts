/**
 * Deployed-app (Nitro) half of the platform PWA chrome. Auto-registered as
 * global h3 middleware because vite.config.ts sets `serverDir: "./server"` —
 * without that option Nitro v3 never scans this directory.
 *
 * - `?install=1&platform=ios` on a document path → the Home Screen tutorial,
 *   bundled into the server build via `?raw` (the public/ directory is CDN
 *   static output on Vercel and not readable from the function).
 * - `/__grok/manifest.webmanifest` → per-app-named manifest (kept out of
 *   public/ so this dynamic response is the only one).
 * - Other HTML documents → stream-inject PWA + OG head tags at `</head>`.
 *   OG identity is baked via `virtual:grok-og-identity` at `vite build`
 *   (this function cannot read `src/lib/og/site.json` or `public/og.jpg`).
 *   This must be a middleware transforming `next()`: h3 discards the `response`
 *   runtime hook's return value, and `render:html` does not exist in Nitro v3.
 */
import installPageTemplate from "../../scripts/install-page.html?raw";
import { grokOgIdentity } from "virtual:grok-og-identity";
import {
  acceptsHtml,
  createHeadInjector,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
} from "../../scripts/grok-pwa-shared.mjs";

interface GrokPwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function requestHost(event: GrokPwaEvent): string {
  return (
    event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host
  );
}

function rewriteShareHost(html: string): string {
  let next = html.replace(
    /(<meta\b[^>]*\bcontent=["'])https:\/\/ferzan-factory\.grok\.me\//gi,
    "$1https://ferzan-factory.com/",
  );
  if (!/name=["']twitter:image["']/i.test(next)) {
    const og = next.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (og) next = next.replace(/<\/head>/i, `<meta name="twitter:image" content="${og[1]}"></head>`);
  }
  if (!/name=["']twitter:creator["']/i.test(next)) {
    next = next.replace(/<\/head>/i, `<meta name="twitter:creator" content="@ferzanfactory"></head>`);
  }
  return next;
}

/** The platform writes og:image with the grok.me host. Point the share tags at the real site after that. */
function rewriteShareStream(response: Response): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let passed = false;
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (passed) {
          controller.enqueue(chunk);
          return;
        }
        pending += decoder.decode(chunk, { stream: true });
        const close = pending.match(/<\/head>/i);
        if (!close || close.index === undefined) return;
        const end = close.index + close[0].length;
        controller.enqueue(encoder.encode(rewriteShareHost(pending.slice(0, end)) + pending.slice(end)));
        pending = "";
        passed = true;
      },
      flush(controller) {
        const tail = pending + decoder.decode();
        if (!tail) return;
        controller.enqueue(encoder.encode(passed ? tail : rewriteShareHost(tail)));
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function injectHeadStreaming(response: Response, host: string): Response {
  const injector = createHeadInjector({
    host,
    site: grokOgIdentity.site,
  });
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const out of injector.push(chunk)) controller.enqueue(out);
      },
      flush(controller) {
        for (const out of injector.flush()) controller.enqueue(out);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function grokPwaMiddleware(
  event: GrokPwaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET") return next();

  const path = event.url.pathname;
  const urlWithQuery = path + event.url.search;

  if (path === "/__grok/manifest.webmanifest" || path === "/__grok/manifest.json") {
    return new Response(renderWebManifest(requestHost(event)), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (
    isInstallQuery(urlWithQuery) &&
    isDocumentPath(path) &&
    acceptsHtml(event.req.headers.get("accept"))
  ) {
    const html = renderInstallPageHtml(installPageTemplate, {
      host: requestHost(event),
      url: urlWithQuery,
    });
    return new Response(rewriteShareHost(html), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (!isDocumentPath(path)) return next();

  const result = await next();
  if (
    result instanceof Response &&
    result.body &&
    String(result.headers.get("content-type") ?? "").includes("text/html") &&
    !result.headers.get("content-encoding")
  ) {
    return rewriteShareStream(injectHeadStreaming(result, requestHost(event)));
  }
  return result;
}
