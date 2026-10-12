import { createServerFn } from "@tanstack/react-start";

const CREATOR = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|T[1-9A-HJ-NP-Za-km-z]{33}|EQ[A-Za-z0-9_-]{46})$/;

function creatorOf(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!CREATOR.test(raw)) throw new Error("That creator looks wrong.");
  return raw.startsWith("0x") || raw.startsWith("0X") ? raw.toLowerCase() : raw;
}

async function accountId(token: string): Promise<string> {
  if (token.length < 20 || token.length > 4000) throw new Error("Sign in again.");
  const appId = process.env.VITE_PRIVY_APP_ID || "cmuitovv501qx0cl6wnj2qvvt";
  const res = await fetch("https://auth.privy.io/api/v1/users/me", {
    headers: { Authorization: `Bearer ${token}`, "privy-app-id": appId },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error("Sign in again.");
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length < 4 || body.id.length > 120) throw new Error("Sign in again.");
  return body.id;
}

export const listFollows = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const token = (data as { token?: unknown }).token;
    if (typeof token !== "string") throw new Error("Sign in again.");
    return { token };
  })
  .handler(async ({ data }): Promise<string[]> => {
    await (await import("./guard.server")).guardRelay("read");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ creator: string }>`
      select creator from follows where account = ${id} order by creator limit 200
    `;
    return rows.map((row) => row.creator);
  });

export const putFollow = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; creator: string } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const row = data as { token?: unknown; creator?: unknown };
    if (typeof row.token !== "string") throw new Error("Sign in again.");
    return { token: row.token, creator: creatorOf(row.creator) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ n: number; have: number }>`
      select count(*)::int as n,
             count(*) filter (where creator = ${data.creator})::int as have
      from follows
      where account = ${id}
    `;
    if (Number(rows[0]?.n ?? 0) >= 200 && Number(rows[0]?.have ?? 0) === 0) throw new Error("Your follow list is full.");
    await sql`
      insert into follows (account, creator)
      values (${id}, ${data.creator})
      on conflict (account, creator) do nothing
    `;
    return { ok: true };
  });

export const dropFollow = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; creator: string } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const row = data as { token?: unknown; creator?: unknown };
    if (typeof row.token !== "string") throw new Error("Sign in again.");
    return { token: row.token, creator: creatorOf(row.creator) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from follows where account = ${id} and creator = ${data.creator}`;
    return { ok: true };
  });
