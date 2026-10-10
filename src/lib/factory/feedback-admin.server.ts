/**
 * Admin view of beta reports. The password is FEEDBACK_ADMIN_SECRET.
 * Read only on the server. Never returned, logged, or sent to the browser.
 */
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

const COOKIE = "fz_fb_admin";
const MIN = 16;

export type FeedbackReport = {
  time: string;
  kind: string;
  category: string;
  message: string;
  contact: string;
  path: string;
  coin: string;
};

function secret(): string | null {
  const value = process.env.FEEDBACK_ADMIN_SECRET?.trim() ?? "";
  return value.length >= MIN ? value : null;
}

async function same(a: string, b: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

async function pass(value: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", value).update("ferzan-feedback-admin").digest("hex");
}

async function allowed(): Promise<boolean> {
  const value = secret();
  if (!value) return false;
  const given = getCookie(COOKIE) ?? "";
  return same(given, await pass(value));
}

function secureCookie(): boolean {
  const host = (getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host") || "").toLowerCase();
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host.split(",")[0].trim());
}

export async function load(kind: "all" | "feedback" | "coin"): Promise<
  { status: "missing" } | { status: "locked" } | { status: "ok"; rows: FeedbackReport[] }
> {
  if (!secret()) return { status: "missing" };
  if (!(await allowed())) return { status: "locked" };
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
  const value = secret();
  if (!value) return { ok: false, error: "Wrong password." };
  const { visitor } = await import("./guard.server");
  const { createHash } = await import("node:crypto");
  const salt = value;
  const ip = visitor();
  const key = "fba:" + createHash("sha256").update(salt + "|" + (ip ?? "unknown")).digest("hex").slice(0, 32);
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const hour = Math.floor(Date.now() / 3_600_000);
  const hits = await sql<{ hits: number }>`
    insert into feedback_hits (key, hour, hits) values (${key}, ${hour}, 1)
    on conflict (key, hour) do update set hits = feedback_hits.hits + 1
    returning hits
  `;
  if ((hits[0]?.hits ?? 0) > 8) return { ok: false, error: "Too many tries. Wait and try again." };
  if (!(await same(password, value))) return { ok: false, error: "Wrong password." };
  setCookie(COOKIE, await pass(value), {
    path: "/",
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
  return { ok: true };
}
