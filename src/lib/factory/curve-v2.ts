/**
 * Ferzan Curve V2 on the coin page: state, quotes and unsigned transactions from the Launch Bot API
 * (the same routes the bots and mini apps use, so every surface shows the same numbers).
 *
 * The API builds each transaction; this file re-checks it before the visitor's wallet ever sees it:
 * it must go to this coin's own curve (or its token, for an approve), call the function the action
 * names, come from the visitor's wallet, carry the expected value, and be for the right chain.
 * A V2 coin is only treated as one when its chain has a V2 factory set in contracts.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { CURVE_V2_FACTORIES } from "./contracts";
import { BOT_CURVE_CHAINS, type BotCurveChain } from "./bot-curve";

const API = "https://launch.ferzaneco.com/api";

export const CURVE_V2_CHAIN_IDS: Record<BotCurveChain, number> = {
  bsc: 56,
  base: 8453,
  ethereum: 1,
  robinhood: 4663,
  arc: 5042,
};

/** Function selectors (first 4 bytes of keccak256 of the signature). */
export const V2_SEL = {
  openBuy: "0xd4a67930",
  buy: "0x7deb6025",
  buyLocked: "0x495c1468",
  approve: "0x095ea7b3",
  sell: "0xd04c6983",
  claimOpen: "0x38e68391",
  claimDiamond: "0x53659207",
  redeem: "0xdb006a75",
  queueDevSell: "0x1928205a",
  executeDevSell: "0x1d65571d",
  cancelDevSell: "0xef267227",
} as const;

export type CurveV2Action =
  | "open_buy"
  | "buy"
  | "buy_locked"
  | "approve"
  | "sell"
  | "claim_open"
  | "claim_diamond"
  | "redeem"
  | "queue_dev_sell"
  | "execute_dev_sell"
  | "cancel_dev_sell";

const ACTION_SEL: Record<CurveV2Action, string> = {
  open_buy: V2_SEL.openBuy,
  buy: V2_SEL.buy,
  buy_locked: V2_SEL.buyLocked,
  approve: V2_SEL.approve,
  sell: V2_SEL.sell,
  claim_open: V2_SEL.claimOpen,
  claim_diamond: V2_SEL.claimDiamond,
  redeem: V2_SEL.redeem,
  queue_dev_sell: V2_SEL.queueDevSell,
  execute_dev_sell: V2_SEL.executeDevSell,
  cancel_dev_sell: V2_SEL.cancelDevSell,
};
const PAYS: ReadonlySet<CurveV2Action> = new Set(["open_buy", "buy", "buy_locked"]);

/** 0 waiting, 1 Fair Open, 2 trading, 3 frozen before the Fair Exit, 4 graduated, 5 Fair Exit. */
export type CurveV2Phase = 0 | 1 | 2 | 3 | 4 | 5;

export type CurveV2You = {
  balanceOf: string;
  sellable: string;
  lockedOf: string;
  holdSpreadBps: string;
  holdSince: string;
  openDeposit: string;
  openShareOf: string;
  openRefundOf: string;
  canClaimOpen: boolean;
  convictionLocked: string;
  convictionUntil: string;
  convictionActive: boolean;
  diamondEligible: boolean;
  diamondOwed: string;
  moved: boolean;
  isCreator: boolean;
  vestingLocked: string;
};

export type CurveV2State = {
  version: 2;
  phase: CurveV2Phase;
  mode: 0 | 1 | 2;
  token: string;
  creator: string;
  chainTime: number;
  openEnd: number;
  exitDeadline: number;
  extended: boolean;
  progressBps: number;
  sniperBps: number;
  earlySellBps: number;
  floorVault: string;
  diamondPot: string;
  diamondPotAtGrad: string;
  creatorEscrow: string;
  openTotal: string;
  devTokens: string;
  devSellAmount: string;
  devSellReadyAt: number;
  exitPot: string;
  exitSupply: string;
  timers: { fairOpenEndsIn: number; fairExitIn: number; freezeIn: number; earlySellFeeEndsIn: number; devSellReadyIn?: number; devSellExpiresIn?: number };
  you: CurveV2You | null;
};

export type CurveV2Tx = { to: string; data: string; value: string; gas: string; what: string; action: CurveV2Action };

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : "0");
const wei = (v: unknown): string => {
  const out = s(v);
  return /^\d{1,78}$/.test(out) ? out : "0";
};
const n = (v: unknown): number => {
  const x = Number(s(v));
  return Number.isFinite(x) ? x : 0;
};
const addr = (v: unknown): string => {
  const a = typeof v === "string" ? v.toLowerCase() : "";
  return /^0x[0-9a-f]{40}$/.test(a) ? a : "";
};

function readBase(data: unknown): { chain: BotCurveChain; curve: string; wallet: string } {
  const row = rec(data);
  const chain = String(row.chain ?? "") as BotCurveChain;
  const curve = String(row.curve ?? "").toLowerCase();
  const wallet = String(row.wallet ?? "").toLowerCase();
  if (!BOT_CURVE_CHAINS.includes(chain)) throw new Error("That chain is not open here.");
  if (!/^0x[0-9a-f]{40}$/.test(curve)) throw new Error("That coin address looks wrong.");
  if (wallet && !/^0x[0-9a-f]{40}$/.test(wallet)) throw new Error("Wallet looks wrong.");
  return { chain, curve, wallet };
}

/** Whether the Ferzan Curve V2 is live on this chain (its factory is set in contracts.ts). */
export function curveV2Live(chain: BotCurveChain): boolean {
  return /^0x[0-9a-f]{40}$/.test((CURVE_V2_FACTORIES as Record<string, string>)[chain] ?? "");
}

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { accept: "application/json", "content-type": "application/json" }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("The curve service did not answer. Try again in a moment.");
  }
  const out = rec(await res.json().catch(() => ({})));
  if (res.status === 404) return null; // not a V2 coin (or V2 is not live on this chain)
  if (!res.ok) throw new Error((typeof out.detail === "string" ? out.detail : `The curve service answered ${res.status}.`).slice(0, 200));
  return out;
}

function readState(raw: Record<string, unknown>): CurveV2State {
  const t = rec(raw.timers);
  const y = raw.you ? rec(raw.you) : null;
  const phase = n(raw.phase);
  return {
    version: 2,
    phase: (phase >= 0 && phase <= 5 ? phase : 0) as CurveV2Phase,
    mode: ([0, 1, 2].includes(n(raw.mode)) ? n(raw.mode) : 1) as 0 | 1 | 2,
    token: addr(raw.token),
    creator: addr(raw.creator),
    chainTime: n(raw.chainTime),
    openEnd: n(raw.openEnd),
    exitDeadline: n(raw.exitDeadline),
    extended: raw.extended === true,
    progressBps: n(raw.progressBps),
    sniperBps: n(raw.sniperBps),
    earlySellBps: n(raw.earlySellBps),
    floorVault: wei(raw.floorVault),
    diamondPot: wei(raw.diamondPot),
    diamondPotAtGrad: wei(raw.diamondPotAtGrad),
    creatorEscrow: wei(raw.creatorEscrow),
    openTotal: wei(raw.openTotal),
    devTokens: wei(raw.devTokens),
    devSellAmount: wei(raw.devSellAmount),
    devSellReadyAt: n(raw.devSellReadyAt),
    exitPot: wei(raw.exitPot),
    exitSupply: wei(raw.exitSupply),
    timers: {
      fairOpenEndsIn: n(t.fairOpenEndsIn),
      fairExitIn: n(t.fairExitIn),
      freezeIn: n(t.freezeIn),
      earlySellFeeEndsIn: n(t.earlySellFeeEndsIn),
      ...(t.devSellReadyIn !== undefined ? { devSellReadyIn: n(t.devSellReadyIn), devSellExpiresIn: n(t.devSellExpiresIn) } : {}),
    },
    you: y
      ? {
          balanceOf: wei(y.balanceOf),
          sellable: wei(y.sellable),
          lockedOf: wei(y.lockedOf),
          holdSpreadBps: wei(y.holdSpreadBps),
          holdSince: wei(y.holdSince),
          openDeposit: wei(y.openDeposit),
          openShareOf: wei(y.openShareOf),
          openRefundOf: wei(y.openRefundOf),
          canClaimOpen: y.canClaimOpen === true,
          convictionLocked: wei(y.convictionLocked),
          convictionUntil: wei(y.convictionUntil),
          convictionActive: y.convictionActive === true,
          diamondEligible: y.diamondEligible === true,
          diamondOwed: wei(y.diamondOwed),
          moved: y.moved === true,
          isCreator: y.isCreator === true,
          vestingLocked: wei(y.vestingLocked),
        }
      : null,
  };
}

/** The coin's V2 state, or null when it is not a Ferzan Curve V2 (the page then shows the V1 trade box). */
export const getCurveV2 = createServerFn({ method: "POST" })
  .validator(readBase)
  .handler(async ({ data }): Promise<CurveV2State | null> => {
    if (!curveV2Live(data.chain)) return null;
    await (await import("./guard.server")).guardRelay("read");
    const q = data.wallet ? `?wallet=${data.wallet}` : "";
    const raw = await api(`/v2/curve/${data.chain}/${data.curve}${q}`);
    return raw ? readState(raw) : null;
  });

export type CurveV2Quote = { out: string; fee: string; sniperTax: string; earlySellFee: string; sellSpread: string; refund: string };

export const quoteCurveV2 = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: BotCurveChain; curve: string; wallet: string; side: "buy" | "sell"; amount: string } => {
    const base = readBase(data);
    const row = rec(data);
    const side = row.side === "sell" ? "sell" : "buy";
    const amount = String(row.amount ?? "");
    if (!/^\d{1,40}$/.test(amount) || amount === "0") throw new Error("Amount looks wrong.");
    if (side === "sell" && !base.wallet) throw new Error("Connect your wallet to quote a sell.");
    return { ...base, side, amount };
  })
  .handler(async ({ data }): Promise<CurveV2Quote> => {
    if (!curveV2Live(data.chain)) throw new Error("Ferzan Curve V2 is not live on this chain yet.");
    await (await import("./guard.server")).guardRelay("read");
    const w = data.wallet ? `&wallet=${data.wallet}` : "";
    const q = await api(`/v2/curve/${data.chain}/${data.curve}/quote?side=${data.side}&amount=${data.amount}${w}`);
    if (!q) throw new Error("That is not a Ferzan Curve V2 coin.");
    return data.side === "buy"
      ? { out: wei(q.tokensOut), fee: wei(q.fee), sniperTax: wei(q.sniperTax), earlySellFee: "0", sellSpread: "0", refund: wei(q.refund) }
      : { out: wei(q.nativeOut), fee: wei(q.fee), sniperTax: "0", earlySellFee: wei(q.earlySellFee), sellSpread: wei(q.sellSpread), refund: "0" };
  });

/** An unsigned transaction for the visitor's own wallet, checked here before it is handed to the wallet. */
export const txCurveV2 = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { chain: BotCurveChain; curve: string; wallet: string; token: string; action: CurveV2Action; amount: string; slippageBps: number; lockDays: number; referrer: string } => {
      const base = readBase(data);
      const row = rec(data);
      const action = String(row.action ?? "") as CurveV2Action;
      if (!(action in ACTION_SEL)) throw new Error("That looks wrong.");
      if (!base.wallet) throw new Error("Connect your wallet first.");
      const token = addr(row.token);
      if (action === "approve" && !token) throw new Error("That looks wrong.");
      const amount = String(row.amount ?? "0");
      if (!/^\d{1,40}$/.test(amount)) throw new Error("Amount looks wrong.");
      const slippageBps = Math.max(10, Math.min(4900, Math.trunc(Number(row.slippageBps ?? 300)) || 300));
      const lockDays = action === "buy_locked" ? (Number(row.lockDays) === 7 ? 7 : 1) : 0;
      const referrer = addr(row.referrer);
      return { ...base, token, action, amount, slippageBps, lockDays, referrer };
    },
  )
  .handler(async ({ data }): Promise<CurveV2Tx> => {
    if (!curveV2Live(data.chain)) throw new Error("Ferzan Curve V2 is not live on this chain yet.");
    await (await import("./guard.server")).guardRelay("send");
    const body = {
      action: data.action,
      wallet: data.wallet,
      amount: data.amount,
      slippage_bps: data.slippageBps,
      lock_days: data.lockDays,
      referrer: data.referrer && data.referrer !== data.wallet ? data.referrer : "",
    };
    const tx = await api(`/v2/curve/${data.chain}/${data.curve}/tx`, { method: "POST", body: JSON.stringify(body) });
    if (!tx) throw new Error("That is not a Ferzan Curve V2 coin.");
    const to = addr(tx.to);
    const dataHex = typeof tx.data === "string" ? tx.data.toLowerCase() : "";
    const value = (() => {
      const v = typeof tx.value === "string" ? tx.value : "0x0";
      return /^0x[0-9a-f]{1,64}$/i.test(v) ? BigInt(v) : -1n;
    })();
    const wantTo = data.action === "approve" ? data.token : data.curve;
    if (to !== wantTo) throw new Error("The transaction does not go to this coin. Nothing was sent.");
    if (addr(tx.from) !== data.wallet) throw new Error("The transaction was built for another wallet. Nothing was sent.");
    if (n(tx.chainId) !== CURVE_V2_CHAIN_IDS[data.chain]) throw new Error("The transaction was built for another network. Nothing was sent.");
    if (!/^0x[0-9a-f]{8}([0-9a-f]{64})*$/.test(dataHex) || dataHex.slice(0, 10) !== ACTION_SEL[data.action]) {
      throw new Error("The transaction does something other than what you asked. Nothing was sent.");
    }
    if (value < 0n || (PAYS.has(data.action) ? value !== BigInt(data.amount) : value !== 0n)) {
      throw new Error("The transaction amount looks wrong. Nothing was sent.");
    }
    if (data.action === "approve" && dataHex.slice(10, 74) !== data.curve.slice(2).padStart(64, "0")) {
      throw new Error("The approval is not for this coin's curve. Nothing was sent.");
    }
    const gas = wei(tx.gas);
    return { to, data: dataHex, value: value.toString(), gas, what: typeof tx.what === "string" ? tx.what.slice(0, 80) : "", action: data.action };
  });
