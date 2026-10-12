import { createServerFn } from "@tanstack/react-start";

const OPS = [
  "me",
  "portfolio",
  "token",
  "order",
  "order/status",
  "rules",
  "rules/save",
  "funds",
  "wallet",
  "watch",
  "alerts/add",
  "alerts/del",
  "wallets/add",
  "wallets/del",
  "wallets/copy",
  "copylive",
  "history",
  "stats",
  "trust",
  "feed",
  "card",
] as const;

export type DeskOp = (typeof OPS)[number];

const SENDS = new Set<DeskOp>([
  "order",
  "rules/save",
  "wallet",
  "alerts/add",
  "alerts/del",
  "wallets/add",
  "wallets/del",
  "wallets/copy",
  "copylive",
  "card",
]);

const LOCKED = "Link Telegram to unlock the terminal";

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mintOf(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46}|T[1-9A-HJ-NP-Za-km-z]{33})$/.test(s)) {
    throw new Error("That coin looks wrong.");
  }
  return s;
}

function idOf(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : "";
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(s)) throw new Error("That looks wrong.");
  return s;
}

function addressOf(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length < 20 || s.length > 80 || !/^[0-9A-Za-z_-]+$/.test(s)) throw new Error("That address looks wrong.");
  return s;
}

function optChain(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9]{2,16}$/.test(s)) throw new Error("That looks wrong.");
  return s;
}

function optNum(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new Error("That looks wrong.");
  return n;
}

function optBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  throw new Error("That looks wrong.");
}

function labelOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const s = typeof value === "string" ? value.trim() : "";
  if (!/^[\w .'-]{1,32}$/.test(s)) throw new Error("That looks wrong.");
  return s;
}

function targetOf(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9.+%\- ]{1,40}$/.test(s)) throw new Error("That looks wrong.");
  return s;
}

function put(out: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) out[key] = value;
}

/** Keep only the fields the desk documents for this call. A client cannot pass a bridge token. */
export function cleanDesk(op: DeskOp, raw: unknown): Record<string, unknown> {
  const body = rec(raw);
  const out: Record<string, unknown> = {};
  switch (op) {
    case "me":
    case "funds":
    case "watch":
    case "stats":
    case "trust":
      return {};
    case "portfolio":
      put(out, "refresh", optBool(body.refresh));
      return out;
    case "token":
    case "rules":
    case "card":
      return { mint: mintOf(body.mint) };
    case "order/status":
    case "alerts/del":
    case "wallets/del":
    case "wallet":
      return { id: idOf(body.id) };
    case "history": {
      const limit = optNum(body.limit);
      if (limit !== undefined && (limit < 1 || limit > 60)) throw new Error("That looks wrong.");
      put(out, "limit", limit === undefined ? undefined : Math.floor(limit));
      return out;
    }
    case "feed": {
      if (body.sort !== "new" && body.sort !== "trending" && body.sort !== "koth" && body.sort !== "graduated" && body.sort !== "volume") {
        throw new Error("That looks wrong.");
      }
      out.sort = body.sort;
      if (typeof body.q === "string" && body.q.trim()) {
        const q = body.q.trim().slice(0, 40);
        if (!/^[\w .$+-]{1,40}$/.test(q)) throw new Error("That looks wrong.");
        out.q = q;
      }
      return out;
    }
    case "order": {
      if (body.side !== "buy" && body.side !== "sell") throw new Error("That looks wrong.");
      const amount = optNum(body.amount);
      if (amount === undefined || amount <= 0 || amount > 1e12) throw new Error("That looks wrong.");
      if (body.side === "buy" && body.unit !== "native" && body.unit !== "usd") throw new Error("That looks wrong.");
      if (body.side === "sell" && (body.unit !== "pct" || amount < 1 || amount > 100)) throw new Error("That looks wrong.");
      out.side = body.side;
      out.mint = mintOf(body.mint);
      out.amount = amount;
      out.unit = body.unit;
      put(out, "chain", optChain(body.chain));
      put(out, "multi", optBool(body.multi));
      return out;
    }
    case "rules/save": {
      if (body.kind !== "exit" && body.kind !== "dca" && body.kind !== "dca_off" && body.kind !== "limit" && body.kind !== "limit_cancel") {
        throw new Error("That looks wrong.");
      }
      out.mint = mintOf(body.mint);
      out.kind = body.kind;
      put(out, "tp", optNum(body.tp));
      put(out, "sl", optNum(body.sl));
      put(out, "trail", optNum(body.trail));
      put(out, "usd", optNum(body.usd));
      if (body.every !== undefined) {
        if (body.every !== "hourly" && body.every !== "daily" && body.every !== "weekly") throw new Error("That looks wrong.");
        out.every = body.every;
      }
      put(out, "target_px", optNum(body.target_px));
      if (body.id !== undefined && body.id !== "") out.id = idOf(body.id);
      return out;
    }
    case "alerts/add":
      return { mint: mintOf(body.mint), target: targetOf(body.target) };
    case "wallets/add":
      put(out, "address", addressOf(body.address));
      put(out, "chain", optChain(body.chain));
      put(out, "label", labelOf(body.label));
      return out;
    case "wallets/copy":
      out.id = idOf(body.id);
      put(out, "copy_on", optBool(body.copy_on));
      put(out, "copy_sells", optBool(body.copy_sells));
      put(out, "copy_usd", optNum(body.copy_usd));
      return out;
    case "copylive":
      if (typeof body.on !== "boolean") throw new Error("That looks wrong.");
      return { on: body.on };
    default:
      throw new Error("That looks wrong.");
  }
}

async function telegramOrLock(token: string): Promise<string> {
  const { telegramUserId } = await import("./trade-desk.server");
  const id = await telegramUserId(token);
  if (!id) throw new Error(LOCKED);
  return id;
}

/** Whether this account has Telegram linked. Does not call the desk. */
export const deskLinked = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string } => {
    const token = rec(data).token;
    if (typeof token !== "string" || token.length < 20 || token.length > 16_000) throw new Error("Sign in again.");
    return { token };
  })
  .handler(async ({ data }): Promise<{ linked: boolean }> => {
    await (await import("./guard.server")).guardRelay("read");
    const { telegramUserId } = await import("./trade-desk.server");
    const id = await telegramUserId(data.token);
    return { linked: Boolean(id) };
  });

/** One desk call. The identity token stays on the server. */
export const deskCall = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; op: DeskOp; body: Record<string, unknown> } => {
    const row = rec(data);
    const token = row.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 16_000) throw new Error("Sign in again.");
    const op = row.op;
    if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) throw new Error("That looks wrong.");
    return { token, op: op as DeskOp, body: cleanDesk(op as DeskOp, row.body) };
  })
  .handler(async ({ data }): Promise<string> => {
    await (await import("./guard.server")).guardRelay(SENDS.has(data.op) ? "send" : "read");
    await telegramOrLock(data.token);
    const { runDesk } = await import("./trade-desk.server");
    return JSON.stringify(await runDesk(data.op, data.token, data.body)) ?? "null";
  });

/** ".01" and "0,01" are the same amount. "max" is left alone. */
export function normalizeTypedAmount(value: string): string {
  let amount = value.trim().replace(/,/g, ".");
  if (amount.startsWith(".")) amount = `0${amount}`;
  return amount;
}

const CASHOUT = new Set(["sol", "base", "ethereum", "bsc"]);

/** Cash out the Trading Wallet to My Wallet. The destination is not sent; the desk reads it from the identity token. */
export const deskCashout = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; chain: string; amount: string } => {
    const row = rec(data);
    const token = row.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 16_000) throw new Error("Sign in again.");
    const chain = typeof row.chain === "string" ? row.chain : "";
    if (!CASHOUT.has(chain)) throw new Error("That looks wrong.");
    const raw = typeof row.amount === "number" && Number.isFinite(row.amount) ? String(row.amount) : typeof row.amount === "string" ? row.amount : "";
    const amount = normalizeTypedAmount(raw);
    if (amount !== "max" && !/^\d+(\.\d+)?$/.test(amount)) throw new Error("Type an amount like 0.01, or tap Max.");
    if (amount.length > 40) throw new Error("Type an amount like 0.01, or tap Max.");
    return { token, chain, amount };
  })
  .handler(async ({ data }): Promise<string> => {
    await (await import("./guard.server")).guardRelay("send");
    await telegramOrLock(data.token);
    const { cashoutSelf } = await import("./trade-desk.server");
    return JSON.stringify(await cashoutSelf(data.token, data.chain, data.amount)) ?? "null";
  });

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type TopupTx = {
  version?: number | "legacy";
  signatures: Uint8Array[];
  message: {
    addressTableLookups?: readonly unknown[];
    staticAccountKeys: { toBase58(): string }[];
    compiledInstructions: { programIdIndex: number; accountKeyIndexes: number[]; data: Uint8Array }[];
  };
};

/** A top-up may only be one System transfer into this user's Trading Wallet, plus one optional compute-budget instruction. */
export function assertSolTopup(tx: TopupTx, from: string, to: string): void {
  if (tx.version !== 0) throw new Error("Transaction looks wrong. Nothing was sent.");
  if (tx.message.addressTableLookups?.length) throw new Error("That transfer looks wrong. Nothing was sent.");
  const sig = tx.signatures[0];
  if (!sig || sig.length < 64 || sig.every((b) => b === 0)) throw new Error("Transaction looks wrong. Nothing was sent.");
  const keys = tx.message.staticAccountKeys.map((key) => key.toBase58());
  if (keys[0] !== from) throw new Error("That transfer looks wrong. Nothing was sent.");
  let transfers = 0;
  let budgets = 0;
  for (const ix of tx.message.compiledInstructions) {
    const program = keys[ix.programIdIndex] ?? "";
    if (program === COMPUTE_BUDGET) {
      budgets += 1;
      if (budgets > 1) throw new Error("That transfer looks wrong. Nothing was sent.");
      continue;
    }
    if (program !== SYSTEM_PROGRAM) throw new Error("That transfer looks wrong. Nothing was sent.");
    const data = Buffer.from(ix.data);
    const lamports = data.length === 12 ? data.readBigUInt64LE(4) : 0n;
    const src = keys[ix.accountKeyIndexes[0] ?? -1] ?? "";
    const dst = keys[ix.accountKeyIndexes[1] ?? -1] ?? "";
    if (data.length !== 12 || data.readUInt32LE(0) !== 2 || lamports <= 0n || ix.accountKeyIndexes.length !== 2 || src !== from || dst !== to) {
      throw new Error("That transfer looks wrong. Nothing was sent.");
    }
    transfers += 1;
  }
  if (transfers !== 1) throw new Error("That transfer looks wrong. Nothing was sent.");
}

function solanaAddressOf(linked: { type?: string; address?: string }[]): string {
  const rows = linked.flatMap((row) => {
    const extra = row as { chain_type?: string; chainType?: string; wallet_client_type?: string; walletClientType?: string };
    const address = typeof row.address === "string" ? row.address : "";
    if (!SOL_ADDR.test(address)) return [];
    const chain = extra.chain_type || extra.chainType || "";
    if (chain && chain !== "solana") return [];
    return [{ address, chain, client: extra.wallet_client_type || extra.walletClientType || "" }];
  });
  const pool = rows.some((row) => row.chain === "solana") ? rows.filter((row) => row.chain === "solana") : rows;
  const own = pool.find((row) => row.client === "privy") ?? pool[0];
  if (!own) throw new Error("This account has no Solana wallet yet.");
  return own.address;
}

/** Sign-and-send a SOL top-up from My Wallet to this user's Trading Wallet. The general relay stays Ferzan-only. */
export const deskTopupSol = createServerFn({ method: "POST" })
  .validator((data: unknown): { token: string; signedB64: string } => {
    const row = rec(data);
    const token = row.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 16_000) throw new Error("Sign in again.");
    const signedB64 = typeof row.signedB64 === "string" ? row.signedB64 : "";
    if (!/^[A-Za-z0-9+/=]{100,2000}$/.test(signedB64)) throw new Error("Transaction looks wrong. Nothing was sent.");
    return { token, signedB64 };
  })
  .handler(async ({ data }): Promise<{ signature: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    await telegramOrLock(data.token);
    const { verifyIdentity } = await import("./privy-identity.server");
    const from = solanaAddressOf((await verifyIdentity(data.token)).linked);
    const { runDesk } = await import("./trade-desk.server");
    const me = rec(await runDesk("me", data.token, {}));
    const sol = rec(me.addresses).sol;
    const to = typeof sol === "string" ? sol : "";
    if (!SOL_ADDR.test(to)) throw new Error("This chain has no Trading Wallet yet.");
    const { VersionedTransaction } = await import("@solana/web3.js");
    let tx: TopupTx;
    try {
      tx = VersionedTransaction.deserialize(Buffer.from(data.signedB64, "base64"));
    } catch {
      throw new Error("Transaction looks wrong. Nothing was sent.");
    }
    assertSolTopup(tx, from, to);
    const { topupSol } = await import("./trade-desk.server");
    let raw: unknown;
    try {
      raw = await topupSol(data.token, data.signedB64);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Nothing was sent.";
      throw new Error(message);
    }
    const out = rec(raw);
    const signature = String(out.signature);
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw new Error("Solana did not return a signature.");
    return { signature };
  });

/** Public contract check. No account and no bridge token. Null when it cannot be read. */
export const deskSafety = createServerFn({ method: "GET" })
  .validator((data: unknown): { mint: string; chain: string } => {
    const row = rec(data);
    return { mint: mintOf(row.mint), chain: optChain(row.chain) ?? "" };
  })
  .handler(async ({ data }): Promise<string | null> => {
    await (await import("./guard.server")).guardRelay("read");
    const { publicSafety } = await import("./trade-desk.server");
    const value = await publicSafety(data.mint, data.chain);
    return value == null ? null : JSON.stringify(value);
  });
