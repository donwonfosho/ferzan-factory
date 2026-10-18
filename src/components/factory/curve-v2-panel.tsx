/**
 * The trade column for a Ferzan Curve V2 coin: phase and clocks, buy (Fair Open / normal / Conviction
 * Lock), sell (with this wallet's own sell spread), your position (Hold Clock, locks, Diamond Hands),
 * claims, the Fair Exit redemption, and the creator's Dev Sell Alarm. Every transaction is built by the
 * Launch Bot API, re-checked in curve-v2.ts, and signed by the visitor's own wallet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { formatSmart, parseDecimal } from "@/lib/factory/units";
import { explorerTx } from "@/lib/factory/deploy";
import { setPollInterval } from "@/lib/factory/poll";
import type { BotCurveChain } from "@/lib/factory/bot-curve";
import { getCurveV2, quoteCurveV2, txCurveV2, type CurveV2Action, type CurveV2Quote, type CurveV2State } from "@/lib/factory/curve-v2";
import { Button, TextInput } from "./ui";
import { beginTx } from "./trade-confidence";

type SendFn = (from: string, to: string, data: string, value?: bigint, onHash?: (hash: string) => void) => Promise<string>;

const SLIPPAGES = [100, 300, 500];
const MODES = ["Protected", "Balanced", "Aggressive"];

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function pct(bps: number | string): string {
  const v = Number(bps) / 100;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}%`;
}

function plain(v: bigint): string {
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** What the Hold Clock charges when this wallet sells now, and when that drops next. */
function holdLine(you: CurveV2State["you"], now: number): string {
  if (!you || BigInt(you.balanceOf) === 0n) return "";
  const bps = Number(you.holdSpreadBps);
  if (bps === 0) return tr("Held over 7 days: selling leaves nothing behind.");
  const since = Number(you.holdSince);
  const held = since > 0 ? now - since : 0;
  const next = held < 3600 ? 3600 - held : held < 86_400 ? 86_400 - held : 604_800 - held;
  const nextBps = held < 3600 ? 100 : held < 86_400 ? 50 : 0;
  return tr("Selling now leaves {0} in the curve (Soft Landing). In {1} it drops to {2}.", pct(bps), clock(next), pct(nextBps));
}

export function CurveV2Panel({
  chain,
  curve,
  symbol,
  native,
  account,
  teamLocked,
  connect,
  send,
  referrer,
  onTraded,
}: {
  chain: BotCurveChain;
  curve: string;
  symbol: string;
  native: string;
  account: string;
  /** Team-allocation tokens of this wallet, still locked until graduation (from the page's own read). */
  teamLocked: bigint;
  connect: () => Promise<string>;
  send: SendFn;
  referrer: (from: string) => string;
  onTraded: () => void;
}) {
  const [v2, setV2] = useState<CurveV2State | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(300);
  const [lock, setLock] = useState<0 | 1 | 7>(0);
  const [quote, setQuote] = useState<CurveV2Quote | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [devAmount, setDevAmount] = useState("");
  const [, setTick] = useState(0); // re-render once a second so the clocks count down
  const loadedAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const next = await getCurveV2({ data: { chain, curve, wallet: account } });
      setV2(next);
      loadedAt.current = Date.now();
    } catch {
      /* keep the last state; the poll tries again */
    }
  }, [chain, curve, account]);

  useEffect(() => {
    void load();
    return setPollInterval(() => void load(), 10_000);
  }, [load]);

  // the clocks count down between reloads
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.floor((Date.now() - loadedAt.current) / 1000);
  const left = (sec: number) => Math.max(0, sec - elapsed);

  const raw = parseDecimal(amount, 18);
  useEffect(() => {
    setQuote(null);
    if (!v2 || !raw || raw <= 0n || v2.phase !== 2 || (side === "sell" && !account)) return;
    const id = window.setTimeout(() => {
      void quoteCurveV2({ data: { chain, curve, wallet: account, side, amount: raw.toString() } }).then(setQuote, () => setQuote(null));
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, side, account, v2?.phase]);

  if (!v2) return null;
  const you = v2.you;
  const now = v2.chainTime + elapsed;
  const sellable = (() => {
    if (!you) return 0n;
    const free = BigInt(you.sellable);
    const cap = BigInt(you.balanceOf) - teamLocked;
    return free < cap ? (free > 0n ? free : 0n) : cap > 0n ? cap : 0n;
  })();

  async function run(action: CurveV2Action, amt: bigint, label: string, extra: { lockDays?: number } = {}): Promise<void> {
    const from = account || (await connect());
    const token = v2?.token ?? "";
    const tx = await txCurveV2({
      data: { chain, curve, wallet: from, token, action, amount: amt.toString(), slippageBps: slip, lockDays: extra.lockDays ?? 0, referrer: referrer(from) },
    });
    const item = beginTx(label);
    try {
      const hash = await send(from, tx.to, tx.data, BigInt(tx.value), (h) => item.hash(explorerTx(chain, h)));
      item.confirmed(explorerTx(chain, hash));
    } catch (err) {
      item.failed();
      throw err;
    }
  }

  async function guarded(step: () => Promise<void>) {
    setError("");
    try {
      await step();
      setAmount("");
      await load();
      onTraded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "That did not go through.";
      setError(/user (rejected|denied)|rejected the request|4001/i.test(msg) ? tr("You cancelled in the wallet.") : msg.split("\n")[0]);
    } finally {
      setBusy("");
    }
  }

  async function approveIfNeeded(amt: bigint) {
    setBusy(tr("Step 1 of 2: let the curve take the tokens."));
    await run("approve", amt, tr("Approve"));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void guarded(async () => {
      if (!v2) return;
      if (!raw || raw <= 0n) throw new Error(side === "buy" ? tr("Type how much {0} to spend.", native) : tr("Type how many {0} to sell.", symbol));
      if (side === "buy") {
        if (v2.phase === 1) {
          setBusy(tr("Approve joining the Fair Open in your wallet."));
          await run("open_buy", raw, tr("Fair Open buy"));
        } else if (lock) {
          setBusy(tr("Approve the locked buy in your wallet."));
          await run("buy_locked", raw, tr("Conviction Lock buy"), { lockDays: lock });
        } else {
          setBusy(tr("Approve the buy in your wallet."));
          await run("buy", raw, tr("Buy"));
        }
      } else {
        if (raw > sellable) throw new Error(tr("You can sell up to {0} {1} right now.", formatSmart(sellable, 18), symbol));
        if (v2.phase === 5) {
          await approveIfNeeded(raw);
          setBusy(tr("Step 2 of 2: redeem at the Fair Exit price."));
          await run("redeem", raw, tr("Redeem"));
        } else if (you?.isCreator) {
          throw new Error(tr("As the creator, you sell through the Dev Sell Alarm below."));
        } else {
          await approveIfNeeded(raw);
          setBusy(tr("Step 2 of 2: approve the sell."));
          await run("sell", raw, tr("Sell"));
        }
      }
    });
  }

  const phaseBox = (() => {
    switch (v2.phase) {
      case 0:
        return <p className="text-sm">{tr("Trading opens soon. The first 60 seconds are a Fair Open: every buy in it gets the same price.")}</p>;
      case 1:
        return (
          <p className="text-sm">
            <span className="font-semibold text-cyan">{tr("Fair Open")}</span> · {tr("ends in")} <span className="fz-num">{clock(left(v2.timers.fairOpenEndsIn))}</span>
            <br />
            <span className="text-muted">{tr("Every buy in the opening batch fills at one price, the creator's too. Being first wins nothing.")}</span>
          </p>
        );
      case 3:
        return <p className="text-sm text-sell">{tr("Trading is paused for the last hour before this coin's Fair Exit deadline.")}</p>;
      case 5:
        return (
          <p className="text-sm">
            <span className="font-semibold text-cyan">{tr("Fair Exit")}</span> · {tr("This coin did not graduate in time. Every holder redeems at one price, so nobody is left holding the bag.")}
          </p>
        );
      default:
        return (
          <p className="text-xs text-muted">
            {tr("{0} mode", tr(MODES[v2.mode]))} · {tr("Fair Exit deadline in")} <span className="fz-num">{clock(left(v2.timers.fairExitIn))}</span>
            {v2.extended ? tr(" (extended once)") : ""}
            {v2.sniperBps > 0 ? (
              <>
                {" "}· <span className="text-sell">{tr("Sniper Tax right now: {0}", pct(v2.sniperBps))}</span>
              </>
            ) : null}
            {v2.earlySellBps > 0 ? <> · {tr("Early-sell fee: {0}", pct(v2.earlySellBps))}</> : null}
          </p>
        );
    }
  })();

  const canTrade = v2.phase === 1 || v2.phase === 2 || v2.phase === 5;
  const devPending = BigInt(v2.devSellAmount);
  const devReadyIn = v2.timers.devSellReadyIn !== undefined ? left(v2.timers.devSellReadyIn) : 0;
  const devExpiresIn = v2.timers.devSellExpiresIn !== undefined ? left(v2.timers.devSellExpiresIn) : 0;

  return (
    <div className="space-y-4">
      <div className="ticket fz-panel space-y-2">
        <p className="fz-eyebrow">{tr("The Ferzan Curve")}</p>
        {phaseBox}
      </div>

      {canTrade ? (
        <form onSubmit={submit} className="ticket fz-panel space-y-3">
          {v2.phase === 5 ? null : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={cn("w-full", side === "buy" ? "btn-cyan" : "btn-line")} onClick={() => { setSide("buy"); setAmount(""); }}>
                {tr("Buy")}
              </button>
              <button type="button" className={cn("w-full", side === "sell" ? "btn-cyan" : "btn-line")} disabled={v2.phase === 1} onClick={() => { setSide("sell"); setAmount(""); }}>
                {tr("Sell")}
              </button>
            </div>
          )}
          {side === "sell" && v2.phase !== 5 ? (
            account && you ? (
              <p className="text-sm text-muted">{tr("You have {0} {1} · sellable now {2}", formatSmart(BigInt(you.balanceOf), 18), symbol, formatSmart(sellable, 18))}</p>
            ) : !account ? (
              <p className="text-sm text-muted">{tr("Connect your wallet to see your {0} and sell.", symbol)}</p>
            ) : null
          ) : null}
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={side === "buy" && v2.phase !== 5 ? tr("{0} to spend", native) : tr("{0} to sell", symbol)}
          />
          {(side === "sell" || v2.phase === 5) && you ? (
            <div className="flex flex-wrap gap-2">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} type="button" className="btn-line min-h-9 px-3 text-sm" onClick={() => { setSide("sell"); setAmount(plain((sellable * BigInt(p)) / 100n)); }}>
                  {p === 100 ? tr("Max") : `${p}%`}
                </button>
              ))}
            </div>
          ) : null}
          {side === "buy" && v2.phase === 2 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted">{tr("Conviction Lock")}</p>
              <div className="grid grid-cols-3 gap-2">
                {([0, 1, 7] as const).map((d) => (
                  <button key={d} type="button" className={cn("min-h-9 px-2 text-sm", lock === d ? "btn-cyan" : "btn-line")} onClick={() => setLock(d)}>
                    {d === 0 ? tr("No lock") : d === 1 ? tr("24h · up to 2% back") : tr("7 days · up to 5% back")}
                  </button>
                ))}
              </div>
              {lock ? <p className="text-xs text-muted">{tr("These tokens can't be sold or moved until the lock ends, even after graduation. The money back comes from the Rising Floor, up to what it holds.")}{" "}{tr("If the Rising Floor can't pay most of it yet, the lock is refused and you can buy without it.")}</p> : null}
            </div>
          ) : null}
          {quote && v2.phase === 2 ? (
            <p className="text-sm text-muted">
              ≈ {formatSmart(BigInt(quote.out), 18)} {side === "buy" ? symbol : native}
              {BigInt(quote.sniperTax) > 0n ? tr(" · Sniper Tax {0} {1}", formatSmart(BigInt(quote.sniperTax), 18), native) : ""}
              {BigInt(quote.sellSpread) > 0n ? tr(" · {0} {1} stays in the curve (Soft Landing)", formatSmart(BigInt(quote.sellSpread), 18), native) : ""}
              {BigInt(quote.earlySellFee) > 0n ? tr(" · early-sell fee {0} {1}", formatSmart(BigInt(quote.earlySellFee), 18), native) : ""}
              {BigInt(quote.refund) > 0n ? tr(" · fills the curve, {0} {1} comes back", formatSmart(BigInt(quote.refund), 18), native) : ""}
            </p>
          ) : null}
          {v2.phase === 2 ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              {tr("Slippage")}
              {SLIPPAGES.map((s) => (
                <button key={s} type="button" onClick={() => setSlip(s)} className={cn("min-h-9 px-3", slip === s ? "btn-cyan" : "btn-line")}>
                  {s / 100}%
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="text-sm text-sell">{tr(error)}</p> : null}
          {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
          <Button
            type={account ? "submit" : "button"}
            className="w-full"
            disabled={Boolean(busy)}
            onClick={
              account
                ? undefined
                : () =>
                    void guarded(async () => {
                      setBusy(tr("Connect your wallet."));
                      await connect();
                    })
            }
          >
            {!account
              ? tr("Connect wallet")
              : v2.phase === 5
                ? tr("Redeem {0}", symbol)
                : side === "buy"
                  ? v2.phase === 1
                    ? tr("Join the Fair Open")
                    : tr("Buy {0}", symbol)
                  : tr("Sell {0}", symbol)}
          </Button>
          <p className="text-xs text-muted">
            {tr("1% fee on every trade: 0.40% creator (half held until graduation), 0.35% Ferzan, and 0.25% back into the coin: Diamond Hands 0.10%, Rising Floor 0.05%, Auto-Trending 0.05%, FERZAN Flywheel 0.05%.")}
          </p>
        </form>
      ) : null}

      {you ? (
        <div className="ticket fz-panel space-y-2 text-sm">
          <p className="font-semibold">{tr("Your position")}</p>
          <p>
            {formatSmart(BigInt(you.balanceOf), 18)} {symbol} · {tr("sellable now")} {formatSmart(sellable, 18)}
          </p>
          {holdLine(you, now) ? <p className="text-muted">{holdLine(you, now)}</p> : null}
          {you.convictionActive ? (
            <p className="text-muted">
              {tr("Conviction Lock: {0} {1} until {2}.", formatSmart(BigInt(you.convictionLocked), 18), symbol, new Date(Number(you.convictionUntil) * 1000).toLocaleString())}
            </p>
          ) : null}
          {BigInt(you.balanceOf) > 0n || BigInt(you.openShareOf) > 0n ? (
            <p className={you.diamondEligible ? "text-cyan" : "text-muted"}>
              {you.isCreator
                ? tr("Creators aren't part of Diamond Hands.")
                : you.diamondEligible
                  ? tr("Diamond Hands: you qualify. Hold to graduation without selling or moving a token to share the bonus pot.")
                  : tr("Diamond Hands: this wallet sold or moved tokens, so it is out for this coin.")}
            </p>
          ) : null}
          {you.canClaimOpen ? (
            <Button type="button" className="w-full" disabled={Boolean(busy)} onClick={() => void guarded(async () => { setBusy(tr("Claiming your Fair Open tokens…")); await run("claim_open", 0n, tr("Claim")); })}>
              {BigInt(you.openRefundOf) > 0n
                ? tr("Claim {0} {1} and {2} {3} back from the Fair Open", formatSmart(BigInt(you.openShareOf), 18), symbol, formatSmart(BigInt(you.openRefundOf), 18), native)
                : tr("Claim {0} {1} from the Fair Open", formatSmart(BigInt(you.openShareOf), 18), symbol)}
            </Button>
          ) : null}
          {BigInt(you.diamondOwed) > 0n ? (
            <Button type="button" className="w-full" disabled={Boolean(busy)} onClick={() => void guarded(async () => { setBusy(tr("Claiming your Diamond Hands share…")); await run("claim_diamond", 0n, tr("Claim")); })}>
              {tr("Claim {0} {1} Diamond Hands bonus", formatSmart(BigInt(you.diamondOwed), 18), native)}
            </Button>
          ) : null}
          {you.canClaimOpen || BigInt(you.diamondOwed) > 0n ? <p className="text-xs text-muted">{tr("Ferzan sends these automatically too; the button is here if you'd rather not wait.")}</p> : null}
        </div>
      ) : null}

      {you?.isCreator && v2.phase === 2 ? (
        <div className="ticket fz-panel space-y-2 text-sm">
          <p className="font-semibold">{tr("Dev Sell Alarm")}</p>
          <p className="text-muted">
            {tr("Your tokens unlock 25% at each quarter of progress, once progress has stayed above it for an hour. A sale is public for 10 minutes before it can run, and you can queue up to 25% of your unlocked tokens a day. After graduation the rest unlocks gradually over 7 days.")}
          </p>
          <p>
            {tr("Locked")}: {formatSmart(BigInt(you.lockedOf), 18)} {symbol} · {tr("free")}: {formatSmart(sellable, 18)} {symbol}
          </p>
          {devPending > 0n ? (
            <>
              <p className="text-cyan">
                {tr("Queued")}: {formatSmart(devPending, 18)} {symbol} ·{" "}
                {devReadyIn > 0 ? tr("can run in {0}", clock(devReadyIn)) : devExpiresIn > 0 ? tr("ready, runs until {0} from now", clock(devExpiresIn)) : tr("expired")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  disabled={Boolean(busy) || devReadyIn > 0 || devExpiresIn === 0}
                  onClick={() => void guarded(async () => { await approveIfNeeded(devPending); setBusy(tr("Step 2 of 2: run the sale.")); await run("execute_dev_sell", 0n, tr("Dev sale")); })}
                >
                  {tr("Run the sale")}
                </Button>
                <button type="button" className="btn-line" disabled={Boolean(busy)} onClick={() => void guarded(async () => { setBusy(tr("Cancelling…")); await run("cancel_dev_sell", 0n, tr("Cancel")); })}>
                  {tr("Cancel it")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <TextInput value={devAmount} onChange={(e) => setDevAmount(e.target.value)} inputMode="decimal" placeholder={tr("{0} to sell", symbol)} />
              <Button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void guarded(async () => {
                    const amt = parseDecimal(devAmount, 18);
                    if (!amt || amt <= 0n) throw new Error(tr("Type how many {0} to sell.", symbol));
                    setBusy(tr("Queueing the sale (it is public from now)…"));
                    await run("queue_dev_sell", amt, tr("Queue dev sale"));
                    setDevAmount("");
                  })
                }
              >
                {tr("Queue sale")}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div className="ticket fz-panel space-y-1 text-xs text-muted">
        <p className="text-sm font-semibold">{tr("In this coin's pots")}</p>
        <p>{tr("Rising Floor")}: {formatSmart(BigInt(v2.floorVault), 18)} {native} · {tr("Diamond Hands")}: {formatSmart(BigInt(v2.phase === 4 ? v2.diamondPotAtGrad : v2.diamondPot), 18)} {native}</p>
        <p>{tr("Creator escrow (paid at graduation, or to holders in a Fair Exit)")}: {formatSmart(BigInt(v2.creatorEscrow), 18)} {native}</p>
        {v2.phase === 5 ? <p>{tr("Fair Exit pot")}: {formatSmart(BigInt(v2.exitPot), 18)} {native}</p> : null}
        <p>
          <a className="text-cyan" href="/terminal">{tr("Trade with your Trade Bot balance instead")}</a>
        </p>
      </div>
    </div>
  );
}
