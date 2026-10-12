import { useEffect, useRef, useState } from "react";
import { nativeUsdNow } from "@/lib/factory/usd";
import { solBalance } from "@/lib/factory/solana";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tr } from "@/lib/i18n";
import { openSolCheckout } from "@/lib/factory/moonpay-open";

const KEY = "ferzan-pending-buy";
const MIN_USD = 20;
const WINDOW_MS = 30 * 60 * 1000;
const CHIPS = [25, 50, 100];

type Pending = {
  coin: string;
  symbol: string;
  amount: number;
  start: string;
  time: number;
  expected: string;
};

function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as Partial<Pending>;
    if (!row || typeof row.coin !== "string" || typeof row.symbol !== "string") return null;
    if (typeof row.amount !== "number" || typeof row.start !== "string" || typeof row.time !== "number" || typeof row.expected !== "string") return null;
    if (!/^\d+$/.test(row.start) || !/^\d+$/.test(row.expected)) return null;
    return { coin: row.coin, symbol: row.symbol, amount: row.amount, start: row.start, time: row.time, expected: row.expected };
  } catch {
    return null;
  }
}

function writePending(row: Pending) {
  try {
    localStorage.setItem(KEY, JSON.stringify(row));
  } catch {
    /* the wait still runs for this visit */
  }
}

function clearPending() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* already gone */
  }
}

function solText(lamports: bigint): string {
  const v = lamports < 0n ? -lamports : lamports;
  const whole = v / 1_000_000_000n;
  const frac = (v % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4).replace(/0+$/, "");
  return `${lamports < 0n ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

function applePayHere(): boolean {
  const session = (window as unknown as { ApplePaySession?: { canMakePayments?: () => boolean } }).ApplePaySession;
  if (!session) return false;
  try {
    return typeof session.canMakePayments === "function" ? session.canMakePayments() : true;
  } catch {
    return true;
  }
}

/**
 * Secondary buy on a Solana coin page. MoonPay sends SOL to My Wallet.
 * The coin is bought only after the user taps the button on the arrival card.
 */
export function SolAppleBuy({
  mint,
  symbol,
  onBuy,
}: {
  mint: string;
  symbol: string;
  onBuy: (sol: string) => void;
}) {
  const account = useAccountWallets();
  const [apple, setApple] = useState(false);
  const [open, setOpen] = useState(false);
  const [usd, setUsd] = useState(25);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phase, setPhase] = useState<"idle" | "wait" | "arrived" | "expired">("idle");
  const [gained, setGained] = useState(0n);
  const [now, setNow] = useState(() => Date.now());
  const want = useRef<number | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    setApple(applePayHere());
  }, []);

  useEffect(() => {
    const row = readPending();
    if (!row || row.coin !== mint) return;
    if (Date.now() - row.time > WINDOW_MS) {
      clearPending();
      setPhase("expired");
      return;
    }
    setPending(row);
    setPhase("wait");
  }, [mint]);

  useEffect(() => {
    if (phase !== "wait" || !pending) return;
    const address = account?.solAddress;
    if (!address) return;
    let stop = false;
    async function tick() {
      if (!pending) return;
      if (Date.now() - pending.time > WINDOW_MS) {
        clearPending();
        if (!stop) {
          setPending(null);
          setPhase("expired");
        }
        return;
      }
      if (!stop) setNow(Date.now());
      try {
        const bal = await solBalance(address!);
        const start = BigInt(pending.start);
        const expected = BigInt(pending.expected);
        const need = (expected * 9n) / 10n;
        if (need > 0n && bal >= start + need) {
          if (!stop) {
            setGained(bal - start);
            setPhase("arrived");
          }
        }
      } catch {
        /* keep the wait; the next poll tries again */
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 5_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [phase, pending, account?.solAddress]);

  async function begin(amount: number, address: string) {
    if (amount < MIN_USD) {
      setNote(tr("MoonPay's minimum is $20."));
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const price = await nativeUsdNow("solana");
      if (!price) throw new Error("Could not read the SOL price. Try again.");
      const start = await solBalance(address);
      const usdMicro = BigInt(Math.round(amount * 1_000_000));
      const priceMicro = BigInt(Math.round(price * 1_000_000));
      const expected = priceMicro > 0n ? (usdMicro * 1_000_000_000n) / priceMicro : 0n;
      if (expected <= 0n) throw new Error("Could not read the SOL price. Try again.");
      const row: Pending = {
        coin: mint,
        symbol,
        amount,
        start: start.toString(),
        time: Date.now(),
        expected: expected.toString(),
      };
      writePending(row);
      setPending(row);
      setPhase("wait");
      setOpen(false);
      await openSolCheckout(address, amount);
    } catch (err) {
      setNote(err instanceof Error ? err.message : tr("Could not open card checkout."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (want.current == null || !account?.ready) return;
    if (account.authenticated && account.solAddress) {
      const amount = want.current;
      want.current = null;
      void begin(amount, account.solAddress);
      return;
    }
    if (!asked.current) {
      asked.current = true;
      account.login();
    }
    // begin is stable enough for this sign-in handoff
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  function choose(amount: number) {
    setNote("");
    if (amount < MIN_USD) {
      setNote(tr("MoonPay's minimum is $20."));
      return;
    }
    want.current = amount;
    asked.current = false;
    if (!account?.ready) return;
    if (!account.authenticated || !account.solAddress) {
      asked.current = true;
      account.login();
      return;
    }
    want.current = null;
    void begin(amount, account.solAddress);
  }

  function cancel() {
    clearPending();
    setPending(null);
    setPhase("idle");
    setGained(0n);
  }

  const label = apple ? tr("Buy with Apple Pay") : tr("Buy with card");
  const picked = custom.trim() ? Number(custom) : usd;

  if (phase === "expired") {
    return (
      <p className="text-sm text-[#93a4a7]">
        {tr("No SOL arrived from MoonPay yet. Your SOL lands in My Wallet whenever it arrives.")}
      </p>
    );
  }

  if (phase === "arrived" && pending) {
    const shown = solText(gained);
    return (
      <div className="term-card grid gap-3">
        <p className="font-bold">{tr("Your SOL arrived — buy ${0} now?", pending.symbol)}</p>
        <p className="tabular-nums">{shown} SOL</p>
        <button
          type="button"
          className="term-go"
          onClick={() => {
            clearPending();
            setPhase("idle");
            onBuy(shown);
          }}
        >
          {tr("Buy ${0}", pending.symbol)}
        </button>
      </div>
    );
  }

  if (phase === "wait" && pending) {
    const pct = Math.max(4, Math.min(100, ((now - pending.time) / WINDOW_MS) * 100));
    return (
      <div className="term-card grid gap-3">
        <p className="font-bold">{tr("Waiting for your SOL…")}</p>
        <p className="text-sm text-[#93a4a7]">{tr("${0} through MoonPay. This page checks My Wallet every few seconds.", pending.amount)}</p>
        <div className="h-2 overflow-hidden rounded-full bg-[#111c40]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="h-2 rounded-full bg-[#2fe3d8]" style={{ width: `${pct}%` }} />
        </div>
        <button type="button" className="text-left text-sm text-[#93a4a7] underline" onClick={cancel}>
          {tr("Cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <button type="button" className="btn-line w-full" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open ? (
        <div className="term-card grid gap-3">
          <p className="text-sm text-[#93a4a7]">{tr("MoonPay's minimum is $20.")}</p>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((n) => (
              <button key={n} type="button" className={usd === n && !custom.trim() ? "term-chip term-chip-on" : "term-chip"} onClick={() => { setUsd(n); setCustom(""); }}>
                ${n}
              </button>
            ))}
          </div>
          <input
            className="min-h-11 w-full bg-[#111c40] px-3 tabular-nums"
            inputMode="decimal"
            placeholder={tr("Custom USD")}
            aria-label={tr("Custom USD")}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button type="button" className="term-go" disabled={busy || !Number.isFinite(picked)} onClick={() => choose(picked)}>
            {busy ? tr("Opening") : label}
          </button>
          {note ? <p className="text-sm text-[#fb7185]">{tr(note)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
