/**
 * Admin view of beta reports.
 * The password is checked only on the server. It is never sent back to the browser.
 * A correct password creates a random cookie. The cookie is not the password.
 */
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

const COOKIE = "fz_fb_admin";
const MIN = 16;
const SALT = "5d21364d0e7f203c0edc499a50906a3f";
const HASH = "b6bbe4f6535dac1249332b9fe21812f4b595acd2464798cc328bd5e9fa7e94a4";

export type FeedbackReport = {
  time: string;
  kind: string;
  category: string;
  message: string;
  contact: string;
  path: string;
  coin: string;
};

function envSecret(): string | null {
  const value = process.env.FEEDBACK_ADMIN_SECRET?.trim() ?? "";
  return value.length >= MIN ? value : null;
}

async function same(a: string, b: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

async function passwordOk(password: string): Promise<boolean> {
  const env = envSecret();
  if (env) return same(password, env);
  const { scrypt, timingSafeEqual } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const run = promisify(scrypt);
  const got = (await run(password, Buffer.from(SALT, "hex"), 32, { N: 16384, r: 8, p: 1 })) as Buffer;
  return timingSafeEqual(got, Buffer.from(HASH, "hex"));
}

function secureCookie(): boolean {
  const host = (getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host") || "").toLowerCase();
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host.split(",")[0].trim());
}

async function signedIn(): Promise<boolean> {
  const token = getCookie(COOKIE) ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ token: string }>`
    select token from feedback_sessions where token = ${token} and expires_at > now()
  `;
  return rows.length > 0;
}

export async function load(kind: "all" | "feedback" | "coin"): Promise<
  { status: "missing" } | { status: "locked" } | { status: "ok"; rows: FeedbackReport[] }
> {
  if (!(await signedIn())) return { status: "locked" };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows =
    kind === "all"
      ? await sql<{ kind: string; category: string; message: string; contact: string; path: string; coin: string; created_at: string | Date }>`
          select kind, category, message, contact, path, coin, created_at
          from feedback
          order by created_at desc
          limit 200
        `
      : await sql<{ kind: string; category: string; message: string; contact: string; path: string; coin: string; created_at: string | Date }>`
          select kind, category, message, contact, path, coin, created_at
          from feedback
          where kind = ${kind}
          order by created_at desc
          limit 200
        `;
  return {
    status: "ok",
    rows: rows.map((row) => ({
      time: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      kind: String(row.kind ?? ""),
      category: String(row.category ?? ""),
      message: String(row.message ?? ""),
      contact: String(row.contact ?? ""),
      path: String(row.path ?? ""),
      coin: String(row.coin ?? ""),
    })),
  };
}

export async function unlock(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { visitor } = await import("./guard.server");
  const { createHash, randomBytes } = await import("node:crypto");
  const ip = visitor();
  const key = "fba:" + createHash("sha256").update("ferzan-feedback-admin|" + (ip ?? "unknown")).digest("hex").slice(0, 32);
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const hour = Math.floor(Date.now() / 3_600_000);
  const hits = await sql<{ hits: number }>`
    insert into feedback_hits (key, hour, hits) values (${key}, ${hour}, 1)
    on conflict (key, hour) do update set hits = feedback_hits.hits + 1
    returning hits
  `;
  if ((hits[0]?.hits ?? 0) > 8) return { ok: false, error: "Too many tries. Wait and try again." };
  if (!(await passwordOk(password))) return { ok: false, error: "Wrong password." };
  const token = randomBytes(32).toString("hex");
  const until = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await sql`delete from feedback_sessions where expires_at <= now()`;
  await sql`
    insert into feedback_sessions (token, expires_at)
    values (${token}, ${until})
  `;
  setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
  return { ok: true };
}
