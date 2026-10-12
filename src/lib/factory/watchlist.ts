import { createServerFn } from "@tanstack/react-start";

export type WatchedCoin = { chain: string; token: string; symbol: string; path: string };

const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;

function coin(data: unknown): WatchedCoin {
  if (!data || typeof data !== "object") throw new Error("That coin is missing.");
  const row = data as Record<string, unknown>;
  const chain = typeof row.chain === "string" ? row.chain.trim().toLowerCase() : "";
  const token = typeof row.token === "string" ? row.token.trim() : "";
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().slice(0, 12) : "";
  const path = typeof row.path === "string" ? row.path.trim() : "";
  if (!/^[a-z]{2,12}$/.test(chain) || !/^[0-9A-Za-z_-]{20,70}$/.test(token)) throw new Error("That coin looks wrong.");
  if (!/^[A-Za-z0-9]{1,12}$/.test(symbol) || !PATH.test(path)) throw new Error("That coin looks wrong.");
  return { chain, token, symbol, path };
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

export const listWatch = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const token = (data as { token?: unknown }).token;
    if (typeof token !== "string") throw new Error("Sign in again.");
    return { token };
  })
  .handler(async ({ data }): Promise<WatchedCoin[]> => {
    await (await import("./guard.server")).guardRelay("read");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    return sql<WatchedCoin>`
      select chain, token, symbol, path from watchlist where account = ${id} order by chain, token limit 100
    `;
  });

export const putWatch = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; coin: WatchedCoin } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const row = data as { token?: unknown; coin?: unknown };
    if (typeof row.token !== "string") throw new Error("Sign in again.");
    return { token: row.token, coin: coin(row.coin) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ n: number; have: number }>`
      select count(*)::int as n,
             count(*) filter (where chain = ${data.coin.chain} and token = ${data.coin.token})::int as have
      from watchlist
      where account = ${id}
    `;
    if (Number(rows[0]?.n ?? 0) >= 200 && Number(rows[0]?.have ?? 0) === 0) throw new Error("Your watchlist is full.");
    await sql`
      insert into watchlist (account, chain, token, symbol, path)
      values (${id}, ${data.coin.chain}, ${data.coin.token}, ${data.coin.symbol}, ${data.coin.path})
      on conflict (account, chain, token) do update set symbol = excluded.symbol, path = excluded.path
    `;
    const { syncCoinWatch } = await import("./trade-desk.server");
    await syncCoinWatch(data.token, [{ chain: data.coin.chain, token: data.coin.token, symbol: data.coin.symbol, on: true }]).catch(() => undefined);
    return { ok: true };
  });

export const dropWatch = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; chain: string; tokenId: string } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const row = data as { token?: unknown; chain?: unknown; tokenId?: unknown };
    if (typeof row.token !== "string") throw new Error("Sign in again.");
    const chain = typeof row.chain === "string" ? row.chain.trim().toLowerCase() : "";
    const tokenId = typeof row.tokenId === "string" ? row.tokenId.trim() : "";
    if (!/^[a-z]{2,12}$/.test(chain) || !/^[0-9A-Za-z_-]{20,70}$/.test(tokenId)) throw new Error("That coin looks wrong.");
    return { token: row.token, chain, tokenId };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const gone = await sql<{ symbol: string }>`
      delete from watchlist where account = ${id} and chain = ${data.chain} and token = ${data.tokenId}
      returning symbol
    `;
    if (gone[0]) {
      const { syncCoinWatch } = await import("./trade-desk.server");
      await syncCoinWatch(data.token, [{ chain: data.chain, token: data.tokenId, symbol: gone[0].symbol, on: false }]).catch(() => undefined);
    }
    return { ok: true };
  });

/** Sends the saved watchlist to the trade desk once. Does nothing visible if the desk is quiet. */
export const pushWatches = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string } => {
    if (!data || typeof data !== "object") throw new Error("Sign in again.");
    const token = (data as { token?: unknown }).token;
    if (typeof token !== "string") throw new Error("Sign in again.");
    return { token };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("read");
    const id = await accountId(data.token);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<WatchedCoin>`
      select chain, token, symbol, path from watchlist where account = ${id} order by chain, token limit 100
    `;
    const { syncCoinWatch } = await import("./trade-desk.server");
    await syncCoinWatch(
      data.token,
      rows.map((row) => ({ chain: row.chain, token: row.token, symbol: row.symbol, on: true })),
    ).catch(() => undefined);
    return { ok: true };
  });
