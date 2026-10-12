/**
 * Server-only bridge to the Ferzan trade desk.
 * The visitor's Privy identity token is sent to the desk and never logged or returned.
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

const BANNED = new Set(["bridge", "privy", "privy_id", "secret", "token", "access_token", "accessToken", "authorization", "telegram_user_id", "telegramUserId"]);

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
  if (err.status === 409) return new Error(err.detail || "You already have a cash out waiting.");
  if (err.status === 429) return new Error(err.detail || "Too many requests. Wait a minute and try again.");
  return new Error(err.detail || "The terminal did not answer. Try again.");
}

async function post(endpoint: string, idToken: string, fields: Record<string, unknown>): Promise<unknown> {
  const body: Record<string, unknown> = { privy_id: idToken };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "privy" || key === "privy_id" || key === "bridge" || value === undefined) continue;
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

/** POST /api/<endpoint> with the Privy identity token. Portfolio 404 becomes a no-wallet result and does not throw. */
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

/** Cash out from the Trading Wallet to the account's own wallet. The desk reads the destination from the identity token. Never pass an address. */
export async function cashoutSelf(idToken: string, chain: string, amount: string): Promise<unknown> {
  return post("cashout_self", idToken, { chain, amount });
}

/** Broadcast a signed SOL top-up. The desk checks the transaction and returns its own error text. */
export async function topupSol(idToken: string, signedB64: string): Promise<unknown> {
  return post("topup_sol", idToken, { signed_tx_b64: signedB64 });
}

const BLOCKHASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Recent blockhash from the same Solana RPC the desk uses to broadcast a top-up. No sign-in. */
export async function deskSolBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  let res: Response;
  try {
    res = await fetch(`${DESK}/api/sol_blockhash`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("The terminal did not answer. Try again.");
  }
  const parsed = await readBody(res);
  if (!res.ok) throw new DeskStatus(res.status, detailOf(parsed));
  const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const blockhash = typeof row.blockhash === "string" ? row.blockhash : "";
  const height = row.lastValidBlockHeight;
  if (!BLOCKHASH.test(blockhash) || typeof height !== "number" || !Number.isInteger(height) || height < 0) {
    throw new Error("The terminal did not answer. Try again.");
  }
  return { blockhash, lastValidBlockHeight: height };
}

/** Tell the desk about a site watchlist change. Silent when Telegram is not linked or the desk does not answer. */
export async function syncCoinWatch(
  accessToken: string,
  rows: { chain: string; token: string; symbol: string; on: boolean }[],
): Promise<void> {
  let linked = false;
  try {
    linked = Boolean(await telegramUserId(accessToken));
  } catch {
    return;
  }
  if (!linked) return;
  for (const row of rows.slice(0, 100)) {
    try {
      await post("coinwatch", accessToken, { chain: row.chain, token: row.token, symbol: row.symbol, on: row.on });
    } catch {
      return;
    }
  }
}
export async function telegramUserId(token: string): Promise<string | null> {
  const { telegramIdOf, verifyIdentity } = await import("./privy-identity.server");
  const identity = await verifyIdentity(token);
  return telegramIdOf(identity.linked);
}