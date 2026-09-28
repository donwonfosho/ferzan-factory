/**
 * Security headers on every response from the deployed app (auto-registered like grok-pwa.ts).
 *
 * Deliberately a light policy: scripts are not locked to a list, because the Privy sign-in,
 * TanStack's inline hydration data and the Grok branding script all need to run. What it does:
 * - frame-ancestors: only this site and Grok can frame the pages (stops click-jacking).
 * - object-src / base-uri: no plugins, and no <base> tag can redirect relative links.
 * - nosniff, a referrer policy, HSTS, and no camera / microphone / location for any page.
 */
const HEADERS: Record<string, string> = {
  "content-security-policy":
    "frame-ancestors 'self' https://grok.com https://*.grok.com; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export default async function securityHeadersMiddleware(
  event: { url?: URL },
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (!(result instanceof Response)) return result;
  const headers = new Headers(result.headers);
  for (const [key, value] of Object.entries(HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  // A missing script must not be cached. grok.me otherwise remembers the 404 for a year.
  const path = event.url?.pathname ?? "";
  const type = headers.get("content-type") ?? "";
  if (/\.(?:js|mjs|css)$/.test(path) && type.includes("text/html")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}
