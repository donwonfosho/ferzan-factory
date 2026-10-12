import { createServerFn } from "@tanstack/react-start";

const CHAINS = new Set(["ethereum", "bsc", "base", "robinhood", "solana", "arc", "tron", "ton"]);
const ID = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|T[1-9A-HJ-NP-Za-km-z]{33}|EQ[A-Za-z0-9_-]{46})$/;
const HANDLE = /^[A-Za-z0-9_]{1,32}$/;

export type SocialRow = { platform: "x" | "telegram"; handle: string; verifiedAt: string };
export type LinkedSocials = { x: string | null; telegram: string | null };

function chainOf(value: unknown): string {
  const chain = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!CHAINS.has(chain)) throw new Error("That chain is not open.");
  return chain;
}

function coinOf(value: unknown): string {
  const coin = typeof value === "string" ? value.trim() : "";
  if (!ID.test(coin)) throw new Error("That coin looks wrong.");
  return coin;
}

function platformOf(value: unknown): "x" | "telegram" {
  if (value === "x" || value === "telegram") return value;
  throw new Error("Pick X or Telegram.");
}

function tokenOf(value: unknown): string {
  if (typeof value !== "string" || value.length < 20 || value.length > 4000) throw new Error("Sign in again.");
  return value;
}

type Account = { wallets: string[]; x: string | null; telegram: string | null };

async function privyAccount(token: string): Promise<Account> {
  const appId = process.env.VITE_PRIVY_APP_ID || "cmuitovv501qx0cl6wnj2qvvt";
  const res = await fetch("https://auth.privy.io/api/v1/users/me", {
    headers: { Authorization: `Bearer ${token}`, "privy-app-id": appId },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error("Sign in again.");
  const body = (await res.json()) as { linked_accounts?: unknown; linkedAccounts?: unknown };
  const list = Array.isArray(body.linked_accounts) ? body.linked_accounts : Array.isArray(body.linkedAccounts) ? body.linkedAccounts : [];
  const wallets: string[] = [];
  let x: string | null = null;
  let telegram: string | null = null;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: unknown; address?: unknown; username?: unknown };
    const type = typeof row.type === "string" ? row.type : "";
    if ((type === "wallet" || type === "smart_wallet") && typeof row.address === "string") wallets.push(row.address);
    const handle = typeof row.username === "string" ? row.username.replace(/^@/, "").trim() : "";
    if (!HANDLE.test(handle)) continue;
    if ((type === "twitter" || type === "twitter_oauth") && !x) x = handle;
    if (type === "telegram" && !telegram) telegram = handle;
  }
  return { wallets, x, telegram };
}

function owns(wallets: string[], creator: string): boolean {
  return wallets.some((wallet) =>
    wallet.startsWith("0x") || wallet.startsWith("0X") || creator.startsWith("0x") || creator.startsWith("0X")
      ? wallet.toLowerCase() === creator.toLowerCase()
      : wallet === creator,
  );
}

async function listedCoin(chain: string, coin: string): Promise<{ contract: string; creator: string }> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ contract: string; creator: string }>`
    select contract, creator from coins
    where chain = ${chain} and lower(contract) = ${coin.toLowerCase()}
    limit 1
  `;
  if (!rows[0]) throw new Error("That coin is not listed.");
  return rows[0];
}

export const listSocials = createServerFn({ method: "GET" })
  .validator((data: unknown): { chain: string; coin: string } => {
    const row = data && typeof data === "object" ? (data as { chain?: unknown; coin?: unknown }) : {};
    return { chain: chainOf(row.chain), coin: coinOf(row.coin) };
  })
  .handler(async ({ data }): Promise<SocialRow[]> => {
    await (await import("./guard.server")).guardRelay("read");
    const coin = await listedCoin(data.chain, data.coin).catch(() => null);
    if (!coin) return [];
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ platform: string; handle: string; verified_at: string }>`
      select platform, handle, verified_at::text as verified_at
      from creator_socials
      where chain = ${data.chain} and coin = ${coin.contract}
      order by platform
    `;
    return rows
      .filter((row): row is { platform: "x" | "telegram"; handle: string; verified_at: string } => row.platform === "x" || row.platform === "telegram")
      .map((row) => ({ platform: row.platform, handle: row.handle, verifiedAt: row.verified_at }));
  });

export const mySocials = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string } => {
    const row = data && typeof data === "object" ? (data as { token?: unknown }) : {};
    return { token: tokenOf(row.token) };
  })
  .handler(async ({ data }): Promise<LinkedSocials> => {
    await (await import("./guard.server")).guardRelay("read");
    const account = await privyAccount(data.token);
    return { x: account.x, telegram: account.telegram };
  });

export const putSocial = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; chain: string; coin: string; platform: "x" | "telegram" } => {
    const row = data && typeof data === "object" ? (data as { token?: unknown; chain?: unknown; coin?: unknown; platform?: unknown }) : {};
    return { token: tokenOf(row.token), chain: chainOf(row.chain), coin: coinOf(row.coin), platform: platformOf(row.platform) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const account = await privyAccount(data.token);
    const handle = data.platform === "x" ? account.x : account.telegram;
    if (!handle) throw new Error(data.platform === "x" ? "Link X on your account first." : "Link Telegram on your account first.");
    const coin = await listedCoin(data.chain, data.coin);
    if (!owns(account.wallets, coin.creator)) throw new Error("That coin was created by another wallet.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into creator_socials (chain, coin, platform, handle)
      values (${data.chain}, ${coin.contract}, ${data.platform}, ${handle})
      on conflict (chain, coin, platform) do update
      set handle = excluded.handle, verified_at = now()
    `;
    return { ok: true };
  });

export const dropSocial = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; chain: string; coin: string; platform: "x" | "telegram" } => {
    const row = data && typeof data === "object" ? (data as { token?: unknown; chain?: unknown; coin?: unknown; platform?: unknown }) : {};
    return { token: tokenOf(row.token), chain: chainOf(row.chain), coin: coinOf(row.coin), platform: platformOf(row.platform) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await import("./guard.server")).guardRelay("send");
    const account = await privyAccount(data.token);
    const coin = await listedCoin(data.chain, data.coin);
    if (!owns(account.wallets, coin.creator)) throw new Error("That coin was created by another wallet.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      delete from creator_socials
      where chain = ${data.chain} and coin = ${coin.contract} and platform = ${data.platform}
    `;
    return { ok: true };
  });
