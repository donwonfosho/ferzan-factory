/**
 * Verifies a Privy identity token. Server only. The token is never logged.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const APP_ID = process.env.VITE_PRIVY_APP_ID || "cmuitovv501qx0cl6wnj2qvvt";
export const IDENTITY_MAX = 16_000;

type Jwks = JWTVerifyGetKey;
let jwks: Jwks | null = null;

function keys(): Jwks {
  jwks ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`), {
    cooldownDuration: 60_000,
    cacheMaxAge: 600_000,
  });
  return jwks;
}

export type LinkedAccount = {
  type?: string;
  telegram_user_id?: string | number;
  username?: string;
  address?: string;
};

export type PrivyIdentity = { sub: string; linked: LinkedAccount[] };

function linkedOf(value: unknown): LinkedAccount[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is LinkedAccount => Boolean(item) && typeof item === "object");
}

/** Checks signature, issuer, audience, expiry and algorithm. Account id is `sub`. */
export async function verifyIdentity(token: string): Promise<PrivyIdentity> {
  if (typeof token !== "string" || token.length < 20 || token.length > IDENTITY_MAX) throw new Error("Sign in again.");
  const { payload } = await jwtVerify(token, keys(), {
    issuer: "privy.io",
    audience: APP_ID,
    algorithms: ["ES256"],
  }).catch(() => {
    throw new Error("Sign in again.");
  });
  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length < 4 || sub.length > 120) throw new Error("Sign in again.");
  return { sub, linked: linkedOf(payload.linked_accounts) };
}

export async function accountIdOf(token: string): Promise<string> {
  return (await verifyIdentity(token)).sub;
}

export function telegramIdOf(linked: LinkedAccount[]): string | null {
  for (const row of linked) {
    if (row.type !== "telegram") continue;
    const raw = row.telegram_user_id;
    const id = typeof raw === "number" ? String(Math.trunc(raw)) : typeof raw === "string" ? raw.trim() : "";
    if (/^[0-9]{1,20}$/.test(id)) return id;
  }
  return null;
}
