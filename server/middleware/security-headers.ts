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
  // The strict policy we want, reported but NOT enforced yet. Watch the browser console on each page for
  // "[Report Only]" lines, add the hosts they name, then move this to content-security-policy.
  "content-security-policy-report-only":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://auth.privy.io https://grok.com https://challenges.cloudflare.com; " +
    "connect-src 'self' https: wss:; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; frame-src https://auth.privy.io https://verify.walletconnect.com https://buy.moonpay.com https://challenges.cloudflare.com; " +
    "form-action 'self'; frame-ancestors 'self' https://grok.com https://*.grok.com; object-src 'none'; base-uri 'self'",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-permitted-cross-domain-policies": "none",
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
