/**
 * Server-only bridge to the Ferzan trade desk.
 * The visitor's Privy access token is sent to the desk and never logged or returned.
 */
const DESK = "https://157-230-80-150.sslip.io";
const TIMEOUT_MS = 15_000;

class DeskStatus extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || "The terminal did not answer.");
    this.status = status;
    this.detail = detail;
  }
}

const BANNED = new Set(["bridge", "privy", "secret", "token", "access_token", "accessToken", "authorization", "telegram_user_id", "telegramUserId"]);

function clip(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 500);
  if (depth >= 5) return null;
  if (Array.isArray(value)) return value.slice(0, 60).map((item) => clip(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (BANNED.has(key)) continue;
      out[key] = clip(item, depth + 1);
    }
    return out;
  }
  return null;
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length > 200_000) throw new Error("The terminal did not answer. Try again.");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function detailOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const detail = (body as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail.slice(0, 300) : "";
}

function toUserError(err: DeskStatus): Error {
  if (err.status === 401) return new Error("Sign in again");
  if (err.status === 403) return new Error(err.detail || "The terminal is not open for this account.");
  if (err.status === 404) return new Error(err.detail || "Not found.");
  if (err.status === 429) return new Error(err.detail || "Too many requests. Wait a minute and try again.");
  return new Error(err.detail || "The terminal did not answer. Try again.");
}

async function post(endpoint: string, accessToken: string, fields: Record<string, unknown>): Promise<unknown> {
  const body: Record<string, unknown> = { privy: accessToken };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "privy" || key === "bridge" || value === undefined) continue;
    body[key] = value;
  }
  let res: Response;
  try {
    res = await fetch(`${DESK}/api/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("The terminal did not answer. Try again.");
  }
  const parsed = await readBody(res);
  if (!res.ok) throw new DeskStatus(res.status, detailOf(parsed));
  return clip(parsed) ?? {};
}

async function noWallet(accessToken: string): Promise<{ noWallet: true; bot_link: string; bot_username: string }> {
  const me = await post("me", accessToken, {}).catch(() => null);
  const row = me && typeof me === "object" ? (me as Record<string, unknown>) : {};
  return {
    noWallet: true,
    bot_link: httpsUrl(row.bot_link),
    bot_username: typeof row.bot_username === "string" ? row.bot_username.slice(0, 64) : "",
  };
}

/** POST /api/<endpoint> with the Privy access token. Portfolio 404 becomes a no-wallet result and does not throw. */
export async function runDesk(endpoint: string, accessToken: string, fields: Record<string, unknown>): Promise<unknown> {
  try {
    if (endpoint === "portfolio") {
      try {
        return await post(endpoint, accessToken, fields);
      } catch (err) {
        if (err instanceof DeskStatus && err.status === 404) return noWallet(accessToken);
        throw err;
      }
    }
    return await post(endpoint, accessToken, fields);
  } catch (err) {
    if (err instanceof DeskStatus) throw toUserError(err);
    throw err;
  }
}

/** GET /api/public/safety/:mint. No token. Null when the desk did not answer. */
export async function publicSafety(mint: string, chain: string): Promise<unknown | null> {
  const url = new URL(`${DESK}/api/public/safety/${encodeURIComponent(mint)}`);
  if (chain) url.searchParams.set("chain", chain);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return clip(await readBody(res));
  } catch {
    return null;
  }
}

/** Telegram user id from Privy's REST user, or null when Telegram is not linked. */
export async function telegramUserId(accessToken: string): Promise<string | null> {
  if (accessToken.length < 20 || accessToken.length > 4000) throw new Error("Sign in again.");
  const appId = process.env.VITE_PRIVY_APP_ID || "cmuitovv501qx0cl6wnj2qvvt";
  const res = await fetch("https://auth.privy.io/api/v1/users/me", {
    headers: { Authorization: `Bearer ${accessToken}`, "privy-app-id": appId },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error("Sign in again.");
  const body = (await res.json()) as { linked_accounts?: unknown; linkedAccounts?: unknown };
  const list = Array.isArray(body.linked_accounts) ? body.linked_accounts : Array.isArray(body.linkedAccounts) ? body.linkedAccounts : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: unknown; telegram_user_id?: unknown; telegramUserId?: unknown };
    if (row.type !== "telegram") continue;
    const raw = row.telegram_user_id ?? row.telegramUserId;
    const id = typeof raw === "number" ? String(Math.trunc(raw)) : typeof raw === "string" ? raw.trim() : "";
    if (/^[0-9]{1,20}$/.test(id)) return id;
  }
  return null;
}