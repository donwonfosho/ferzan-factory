import { publicPath } from "./analytics";

/** Drop wallet-shaped strings and anything that is not a public path. */
const ADDR = /0x[a-fA-F0-9]{40,64}|[EUk]Q[A-Za-z0-9_-]{46}|\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

type Loose = {
  user?: unknown;
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown };
  transaction?: string;
  breadcrumbs?: { data?: unknown }[];
};

/** Scrub a Sentry event. No wallet, no user id, no request body. URLs go through publicPath(). */
export function scrubSentry<T>(event: T): T {
  const copy = event as T & Loose;
  if (copy && typeof copy === "object") {
    delete copy.user;
    if (copy.request && typeof copy.request === "object") {
      if (typeof copy.request.url === "string") {
        try {
          const u = new URL(copy.request.url);
          u.pathname = publicPath(u.pathname);
          u.search = "";
          u.hash = "";
          copy.request.url = u.toString();
        } catch {
          /* the address regex below still runs */
        }
      }
      delete copy.request.data;
      delete copy.request.cookies;
      delete copy.request.headers;
      delete copy.request.query_string;
    }
    if (typeof copy.transaction === "string") copy.transaction = publicPath(copy.transaction.split("?")[0]);
    if (Array.isArray(copy.breadcrumbs)) {
      for (const crumb of copy.breadcrumbs) {
        if (crumb && typeof crumb === "object") delete crumb.data;
      }
    }
  }
  try {
    return JSON.parse(JSON.stringify(copy).replace(ADDR, ":id")) as T;
  } catch {
    return event;
  }
}
