import { useEffect, useRef, useState } from "react";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { deskCall, deskLinked, deskSafety, type DeskOp } from "@/lib/factory/trade-desk";
import { setPollInterval } from "@/lib/factory/poll";
import { CHAINS } from "@/lib/factory/catalog";
import { tr } from "@/lib/i18n";
import { Button, TextInput } from "./ui";
import { TradingSetup, WalletChip, WalletsPanel } from "./wallets-panel";

type Rec = Record<string, unknown>;
type Gate = "wait" | "out" | "check" | "locked" | "open";
type Tab = "trade" | "book" | "wallets" | "watch" | "feed";

const LOCKED = "Link Telegram to unlock the terminal";

function rec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function list(value: unknown): Rec[] {
  return Array.isArray(value) ? value.map(rec) : [];
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? tr("Yes") : tr("No");
  return "";
}

function money(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs === 0) return "$0.00";
  if (abs >= 1) return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sign}$${abs.toFixed(abs >= 0.0001 ? 4 : 6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function cap(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return money(abs);
}

function feeText(me: Rec): string {
  if (me.fee_exempt === true) return tr("Exempt");
  const bps = typeof me.fee_bps === "number" ? me.fee_bps : Number(me.fee_bps);
  if (!Number.isFinite(bps)) return "";
  const pct = bps / 100;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${shown}%`;
}

/** Hard-coded step labels. The current step comes from fee_bps; the next step comes from next_tier. */
const FEE_LADDER = [
  { bps: 50, label: "0.50%" },
  { bps: 40, label: "0.40%", at: 5_000, atLabel: "$5k" },
  { bps: 35, label: "0.35%", at: 25_000, atLabel: "$25k" },
  { bps: 25, label: "0.25%", at: 100_000, atLabel: "$100k" },
] as const;

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function pctLabel(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(2) : pct.toFixed(2)}%`;
}

function FeeLadder({ me }: { me: Rec }) {
  if (me.fee_exempt === true) return null;
  const bps = num(me.fee_bps);
  if (bps === null) return null;
  const next = rec(me.next_tier);
  const nextAt = num(next.at);
  const nextBps = num(next.fee_bps) ?? num(next.bps);
  const volume = num(me.volume30) ?? 0;
  const current = FEE_LADDER.some((step) => step.bps === bps) ? bps : null;
  const gap = nextAt !== null && nextAt > volume ? nextAt - volume : null;
  const nextLabel = nextBps !== null ? pctLabel(nextBps) : (current !== null ? FEE_LADDER.find((step) => step.bps < current)?.label : "") ?? "";
  return (
    <div className="mt-3">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-[#93a4a7]">
        {FEE_LADDER.map((step, i) => (
          <li key={step.bps} className="flex items-center gap-1">
            {i ? <span aria-hidden>→</span> : null}
            <span className={step.bps === current ? "rounded-full bg-[#143f4a] px-2 py-0.5 font-semibold text-[#9fe9f2]" : ""}>
              {step.label}
              {"at" in step ? <span className="font-normal text-[#93a4a7]"> {tr("at {0}", step.atLabel)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {gap !== null && nextLabel ? (
        <p className="mt-2 text-xs text-[#93a4a7]">{tr("{0} more volume to reach {1}", money(gap), nextLabel)}</p>
      ) : null}
    </div>
  );
}

function pnlPct(row: Rec): number | null {
  if (typeof row.pnl_pct === "number" && Number.isFinite(row.pnl_pct)) return row.pnl_pct;
  if (typeof row.pnl === "number" && typeof row.value === "number" && row.value !== 0) return (row.pnl / row.value) * 100;
  return null;
}

function plain(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).slice(0, 6).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Rec)
      .map(([key, item]) => {
        const shown = plain(item);
        return shown ? `${key.replaceAll("_", " ")}: ${shown}` : "";
      })
      .filter(Boolean)
      .slice(0, 8)
      .join(" · ");
  }
  return "";
}

function https(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function Spark({ data }: { data: unknown }) {
  if (!Array.isArray(data)) return null;
  const nums = data.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const d = nums
    .map((n, i) => {
      const x = (i / (nums.length - 1)) * 80;
      const y = 24 - ((n - min) / span) * 22 - 1;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 80 24" className="inline-block h-6 w-20 text-cyan" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{tr(label)}</span>
      <span className="text-right">{value || tr("Not available")}</span>
    </li>
  );
}

const OFF_HOST =
  "Telegram sign-in works on ferzan-factory.com. If that address does not open for you, use the same terminal inside Telegram:";

export function TerminalPage() {
  const account = useAccountWallets();
  const accountRef = useRef(account);
  accountRef.current = account;
  const [offHost, setOffHost] = useState(false);
  const [gate, setGate] = useState<Gate>("wait");
  const [tab, setTab] = useState<Tab>("trade");
  const [err, setErr] = useState("");
  const [me, setMe] = useState<Rec | null>(null);
  const [book, setBook] = useState<Rec | null>(null);
  const [watch, setWatch] = useState<Rec | null>(null);
  const [feed, setFeed] = useState<Rec | null>(null);
  const [sort, setSort] = useState<"new" | "trending" | "koth" | "graduated" | "volume">("trending");
  const [history, setHistory] = useState<Rec[]>([]);
  const [stats, setStats] = useState<Rec | null>(null);
  const [trust, setTrust] = useState<Rec | null>(null);
  const [coin, setCoin] = useState<Rec | null>(null);
  const [rules, setRules] = useState<Rec | null>(null);
  const [safety, setSafety] = useState<string>("");
  const [mint, setMint] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"native" | "usd" | "pct">("usd");
  const [chain, setChain] = useState("");
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderText, setOrderText] = useState("");
  const [again, setAgain] = useState(false);
  const [lastOrder, setLastOrder] = useState<Rec | null>(null);
  const [alertTarget, setAlertTarget] = useState("2m");
  const [copyAddress, setCopyAddress] = useState("");
  const [openPos, setOpenPos] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    setOffHost(window.location.hostname !== "ferzan-factory.com");
  }, []);

  useEffect(() => {
    if (!account?.ready) return;
    if (!account.authenticated) {
      setGate("out");
      return;
    }
    let stop = false;
    setGate("check");
    void account.identityToken().then(async (token) => {
      if (stop) return;
      if (!token) {
        setGate("out");
        return;
      }
      try {
        const row = await deskLinked({ data: { token } });
        if (!stop) setGate(row.linked ? "open" : "locked");
      } catch (e) {
        if (!stop) {
          setErr(e instanceof Error ? e.message : "Sign in again");
          setGate("out");
        }
      }
    });
    return () => {
      stop = true;
    };
  }, [account]);

  async function call(op: DeskOp, body: Rec = {}): Promise<unknown> {
    const token = await account?.identityToken();
    if (!token) throw new Error("Sign in again");
    const raw = await deskCall({ data: { token, op, body } });
    return JSON.parse(raw) as unknown;
  }

  useEffect(() => {
    if (gate !== "open") return;
    let stop = false;
    void (async () => {
      const token = await accountRef.current?.identityToken();
      if (!token || stop) return;
      try {
        const [who, port] = await Promise.all([
          deskCall({ data: { token, op: "me", body: {} } }),
          deskCall({ data: { token, op: "portfolio", body: {} } }),
        ]);
        if (stop) return;
        setMe(rec(JSON.parse(who) as unknown));
        setBook(rec(JSON.parse(port) as unknown));
        setErr("");
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : LOCKED);
      }
    })();
    return () => {
      stop = true;
    };
  }, [gate, account?.userId]);

  useEffect(() => {
    if (!orderId || gate !== "open") return;
    const started = Date.now();
    let stop = false;
    const tick = () => {
      if (stop) return;
      if (Date.now() - started > 45_000) {
        setOrderText(tr("This order expired. Nothing was sent."));
        setOrderId("");
        return;
      }
      void accountRef.current?.identityToken().then(async (token) => {
        if (!token || stop) return;
        const row = rec(JSON.parse(await deskCall({ data: { token, op: "order/status", body: { id: orderId } } })) as unknown);
        if (stop) return;
        const status = text(row.status);
        const result = text(row.result);
        if (status === "pending") return;
        setOrderText(result || status || tr("Not available"));
        setAgain(/nothing was sent/i.test(result));
        setOrderId("");
      }).catch((e) => {
        if (!stop) setOrderText(e instanceof Error ? e.message : tr("The terminal did not answer. Try again."));
      });
    };
    tick();
    const halt = setPollInterval(tick, 2000);
    return () => {
      stop = true;
      halt();
    };
  }, [orderId, gate]);

  async function sendOrder(body: Rec) {
    setBusy(true);
    setAgain(false);
    setOrderText("");
    try {
      const row = rec(await call("order", body));
      setLastOrder(body);
      const id = text(row.id);
      setOrderText(text(row.status) || tr("pending"));
      if (id) setOrderId(id);
    } catch (e) {
      setOrderText(e instanceof Error ? e.message : tr("The terminal did not answer. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function lookup(mintAddr = mint) {
    const id = mintAddr.trim();
    setBusy(true);
    setCoin(null);
    setRules(null);
    setSafety("");
    try {
      const row = rec(await call("token", { mint: id }));
      setCoin(row);
      const rule = rec(await call("rules", { mint: id }));
      setRules(rule);
      const check = await deskSafety({ data: { mint: id, chain } });
      setSafety(check ? plain(JSON.parse(check) as unknown) : "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("That coin looks wrong."));
    } finally {
      setBusy(false);
    }
  }

  async function reloadDesk() {
    const token = await accountRef.current?.identityToken();
    if (!token) return;
    const [who, port] = await Promise.all([
      deskCall({ data: { token, op: "me", body: {} } }),
      deskCall({ data: { token, op: "portfolio", body: { refresh: true } } }),
    ]);
    setMe(rec(JSON.parse(who) as unknown));
    setBook(rec(JSON.parse(port) as unknown));
  }

  async function loadWatch() {
    try {
      setWatch(rec(await call("watch")));
    } catch (e) {
      setErr(e instanceof Error ? e.message : LOCKED);
    }
  }

  async function loadFeed(next = sort) {
    try {
      setFeed(rec(await call("feed", { sort: next })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : LOCKED);
    }
  }

  async function loadMore() {
    try {
      const [h, s, t] = await Promise.all([call("history", { limit: 30 }), call("stats"), call("trust")]);
      setHistory(list(rec(h).items));
      setStats(rec(s));
      setTrust(rec(t));
    } catch (e) {
      setErr(e instanceof Error ? e.message : LOCKED);
    }
  }

  if (gate === "wait" || gate === "check") {
    return (
      <div className="term-page mx-auto max-w-lg">
        <div className="term-skel h-8 w-40" />
        <div className="term-skel mt-4 h-28" />
      </div>
    );
  }

  if (gate !== "open") {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-4xl">{tr("Terminal")}</h1>
        {offHost ? (
          <>
            <p className="mt-4 text-lg">{tr(OFF_HOST)}</p>
            <a className="btn-cyan mt-6 inline-flex" href="https://t.me/Ferzan_Trade_Bot" target="_blank" rel="noopener noreferrer">
              {tr("Open @Ferzan_Trade_Bot")}
            </a>
          </>
        ) : (
          <>
            <p className="mt-4 text-lg">{tr(LOCKED)}</p>
            <p className="mt-2 text-sm text-muted">{tr("Buys and sells go through your Telegram bot. Keys and withdrawals stay in that chat.")}</p>
            {err ? <p className="term-card mt-3 text-sm">{err}</p> : null}
            <Button className="mt-6" onClick={() => account?.linkTelegram()}>
              {gate === "out" ? tr("Sign in") : tr("Link Telegram")}
            </Button>
          </>
        )}
      </div>
    );
  }

  const noWallet = book?.noWallet === true;
  const tradingOff = me?.wallet_ready === false || noWallet;
  const bot = https(book?.bot_link) || https(me?.bot_link);
  const presets = rec(book?.presets);
  const buyPresets = Array.isArray(presets.sol) ? presets.sol : [];
  const sellPresets = Array.isArray(presets.sell) ? presets.sell : [];
  const positions = list(book?.positions);
  const profit = book && typeof book.pnl_usd === "number" ? book.pnl_usd : book && typeof book.pnl === "number" ? book.pnl : null;
  const spendUnit = chain === "bsc" ? "BNB" : chain === "ton" ? "TON" : chain && chain !== "solana" ? "ETH" : "SOL";
  const deskAddresses = rec(me?.addresses);
  const tabs = [
    ["trade", "Trade"],
    ["book", "Portfolio"],
    ["wallets", "Wallets"],
    ["watch", "Watch"],
    ["feed", "Feed"],
  ] as const;

  function pickTab(id: Tab) {
    setTab(id);
    if (id === "watch") void loadWatch();
    if (id === "feed") {
      void loadFeed();
      void loadMore();
    }
  }

  function copied(message: string) {
    if (!message) return;
    setToast(message);
    window.setTimeout(() => setToast(""), 1600);
  }

  return (
    <div className="term-page mx-auto max-w-3xl">
      <div
        className="sticky z-30 -mx-4 mb-3 overflow-x-auto border-b border-[rgba(160,190,255,.12)] bg-[#070b18] px-2 py-2 sm:hidden"
        style={{ top: "var(--site-header, 4.5rem)" }}
      >
        <div className="flex w-max gap-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? "bg-[#143f4a] text-[#2fe3d8]" : "text-[#93a4a7]"}`}
              onClick={() => pickTab(id)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
      </div>
      <h1 className="text-4xl">{tr("Terminal")}</h1>
      <p className="mt-2 text-sm text-muted">{tr("The bot places the trade from your Trading Wallet. This page never sees your keys.")}</p>
      {err ? <p className="term-card mt-3 text-sm">{err}</p> : null}
      {me ? (
        <section className="term-hero mt-4">
          <p className="term-label">{tr("Total balance")}</p>
          <p className="term-grad mt-1">{book ? money(book.total_usd) : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {feeText(me) ? <span className="term-chip min-h-0 py-1">{tr("Fee")} {feeText(me)}</span> : null}
            {money(me.volume30) ? <span className="term-chip min-h-0 py-1">{tr("30 day volume")} {money(me.volume30)}</span> : null}
            {profit !== null ? <span className="term-chip min-h-0 py-1">{tr("Profit")} {money(profit)}</span> : null}
          </div>
          <FeeLadder me={me} />
          <div className="mt-3 flex flex-wrap gap-2">
            {text(deskAddresses.sol) ? <WalletChip chain="SOL" address={text(deskAddresses.sol)} onCopied={copied} /> : null}
            {text(deskAddresses.evm) ? <WalletChip chain="EVM" address={text(deskAddresses.evm)} onCopied={copied} /> : null}
            {text(deskAddresses.ton) ? <WalletChip chain="TON" address={text(deskAddresses.ton)} onCopied={copied} /> : null}
          </div>
          {https(rec(me.ref).link) ? (
            <a className="mt-3 inline-block text-sm text-cyan" href={https(rec(me.ref).link)}>
              {tr("Referral link")}
            </a>
          ) : null}
        </section>
      ) : err ? null : (
        <div className="term-skel mt-4 h-36" />
      )}

      <div className="mt-4 hidden gap-2 overflow-x-auto sm:flex">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "btn-cyan shrink-0" : "btn-line shrink-0"} onClick={() => pickTab(id)}>
            {tr(label)}
          </button>
        ))}
      </div>

      {tab === "trade" ? (
        <div className="mt-4 grid gap-4">
          {tradingOff ? (
            <TradingSetup bot={bot} />
          ) : (
          <form
            className="term-card grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(amount);
              void sendOrder({
                side,
                mint: mint.trim(),
                amount: n,
                unit: side === "sell" ? "pct" : unit === "pct" ? "usd" : unit,
                ...(chain ? { chain } : {}),
                ...(multi ? { multi: true } : {}),
              });
            }}
          >
            <p className="term-label">{tr("Trade")}</p>
            <div className="term-switch">
              <button type="button" className={side === "buy" ? "term-switch-buy" : ""} onClick={() => { setSide("buy"); setUnit("usd"); }}>
                {tr("Buy")}
              </button>
              <button type="button" className={side === "sell" ? "term-switch-sell" : ""} onClick={() => { setSide("sell"); setUnit("pct"); }}>
                {tr("Sell")}
              </button>
            </div>
            <TextInput value={mint} placeholder={tr("Coin address")} onChange={(e) => setMint(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {(side === "buy" ? buyPresets : sellPresets).map((n) => (
                <button key={String(n)} type="button" className={String(n) === amount ? "term-chip term-chip-on" : "term-chip"} onClick={() => setAmount(String(n))}>
                  {String(n)}
                </button>
              ))}
            </div>
            <TextInput value={amount} inputMode="decimal" placeholder={side === "sell" ? tr("Percent, 1 to 100") : tr("Amount")} onChange={(e) => setAmount(e.target.value)} />
            {side === "buy" ? (
              <div className="flex gap-2">
                <button type="button" className={unit === "usd" ? "term-chip term-chip-on" : "term-chip"} onClick={() => setUnit("usd")}>{tr("USD")}</button>
                <button type="button" className={unit === "native" ? "term-chip term-chip-on" : "term-chip"} onClick={() => setUnit("native")}>{tr("Native coin")}</button>
              </div>
            ) : (
              <p className="text-sm text-muted">{tr("Sells use a percent of the bag, from 1 to 100.")}</p>
            )}
            <label className="text-sm text-muted">
              <span className="term-label">{tr("Chain")}</span>
              <select className="term-sunk mt-1 min-h-12 w-full px-3" value={chain} onChange={(e) => setChain(e.target.value)} aria-label={tr("Chain")}>
                <option value="">{tr("Any")}</option>
                {Object.values(CHAINS).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            {book?.multi === true ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
                {tr("Use every Trading Wallet")}
              </label>
            ) : null}
            {side === "buy" && amount ? (
              <p className="text-sm text-muted">{tr("You'll spend ~{0} from your Trading Wallet ({1})", unit === "usd" ? money(Number(amount)) || amount : amount, spendUnit)}</p>
            ) : null}
            <button type="submit" className={side === "sell" ? "term-go-sell" : "term-go"} disabled={busy || Boolean(orderId) || tradingOff}>
              {orderId ? tr("Order working…") : side === "buy" ? tr("Buy") : tr("Sell")}
            </button>
            {orderText ? <p className="text-sm">{orderText}</p> : null}
            {again && lastOrder ? (
              <Button type="button" variant="ghost" onClick={() => void sendOrder(lastOrder)}>
                {tr("Send again")}
              </Button>
            ) : null}
            <button type="button" className="text-left text-sm text-cyan" onClick={() => void lookup()}>
              {tr("Look up this coin")}
            </button>
          </form>
          )}
          {coin ? (
            <ul className="term-card space-y-2 text-sm">
              <Row label="Coin" value={[text(coin.symbol), text(coin.name)].filter(Boolean).join(" · ")} />
              <Row label="Price" value={money(coin.price)} />
              <Row label="Market cap" value={cap(coin.mc)} />
              <Row label="Liquidity" value={money(coin.liq)} />
              <Row label="24h" value={text(coin.chg24)} />
              <li><Spark data={coin.chart} /></li>
              <Row label="Safety" value={text(coin.safety) || safety} />
              <Row label="Fee" value={feeText(coin) || text(coin.fee_bps)} />
            </ul>
          ) : null}
          {rules ? (
            <div className="term-card text-sm">
              <p className="term-label">{tr("Rules")}</p>
              <ul className="mt-2 space-y-2">
                <Row label="Exit" value={rules.exit ? text(rec(rules.exit).tp) || text(rec(rules.exit).sl) || text(rec(rules.exit).trail) : ""} />
                <Row label="DCA" value={rules.dca ? [text(rec(rules.dca).usd), text(rec(rules.dca).every)].filter(Boolean).join(" ") : ""} />
              </ul>
              {!rules.has_cost ? <p className="mt-2 text-muted">{tr("Exit rules need a bag bought through Ferzan.")}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                void call("funds").then((row) => {
                  const warning = text(rec(row).warning);
                  setOrderText(warning || tr("Add funds and cash out stay on the hosted page."));
                  const chains = rec(row).chains;
                  const link = https(chains) || (Array.isArray(chains) ? https(rec(chains[0]).add) || https(rec(chains[0]).url) : "");
                  if (link) window.open(link, "_blank", "noopener");
                }).catch((e) => setErr(e instanceof Error ? e.message : ""));
              }}
            >
              {tr("Add funds")}
            </Button>
            <Button
              variant="ghost"
              disabled={!mint.trim()}
              onClick={() => {
                void call("card", { mint: mint.trim() })
                  .then(() => setOrderText(tr("A card was sent to your Telegram chat.")))
                  .catch((e) => setErr(e instanceof Error ? e.message : ""));
              }}
            >
              {tr("Send P/L card")}
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "book" ? (
        <div className="mt-4 grid gap-3">
          <p className="term-label">{tr("Portfolio")}</p>
          <button type="button" className="btn-line w-fit" onClick={() => void call("portfolio", { refresh: true }).then((row) => setBook(rec(row))).catch((e) => setErr(e instanceof Error ? e.message : ""))}>
            {tr("Refresh")}
          </button>
          {positions.length === 0 ? (
            <div className="term-card">
              <p>{tr("No holdings yet — buy something from the Trade tab")}</p>
              <button type="button" className="term-go mt-3" onClick={() => pickTab("trade")}>{tr("Trade")}</button>
            </div>
          ) : null}
          {positions.map((p) => {
            const pct = pnlPct(p);
            const id = text(p.mint);
            const open = openPos === id;
            return (
              <div key={id || text(p.symbol)} className="term-card">
                <button type="button" className="flex w-full min-w-0 items-start justify-between gap-3 text-left" onClick={() => setOpenPos(open ? "" : id)}>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{text(p.symbol) || tr("Not available")}</span>
                    <span className="term-label mt-1 inline-block">{text(p.chain)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold tabular-nums">{money(p.value)}</span>
                    {pct !== null ? (
                      <span className="block text-sm tabular-nums" style={{ color: pct >= 0 ? "#34d399" : "#fb7185" }}>
                        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                      </span>
                    ) : null}
                  </span>
                </button>
                {open ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[25, 50, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="term-chip"
                        onClick={() => void sendOrder({ side: "sell", mint: id, amount: n, unit: "pct", ...(text(p.chain) ? { chain: text(p.chain) } : {}) })}
                      >
                        {tr("Sell {0}%", n)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="term-chip"
                      onClick={() => {
                        setMint(id);
                        pickTab("trade");
                        void lookup(id);
                      }}
                    >
                      {tr("View chart")}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {list(book?.wallets).length > 1 ? (
            <div className="term-card text-sm">
              <p className="term-label">{tr("Trading Wallet")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {list(book?.wallets).map((w) => (
                  <button
                    key={text(w.id)}
                    type="button"
                    className={w.active === true ? "term-chip term-chip-on" : "term-chip"}
                    onClick={() => {
                      void call("wallet", { id: text(w.id) }).then(() => call("portfolio", { refresh: true })).then((row) => setBook(rec(row))).catch((e) => setErr(e instanceof Error ? e.message : ""));
                    }}
                  >
                    {text(w.label) || text(w.id)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <Button variant="ghost" onClick={() => void loadMore()}>{tr("History")}</Button>
          {history.map((item, i) => (
            <p key={`${text(item.mint)}-${i}`} className="truncate text-sm text-muted">
              {tr("{0} {1} {2} · {3}", text(item.side), text(item.symbol), money(item.usd), text(item.source))}
            </p>
          ))}
        </div>
      ) : null}

      {tab === "wallets" ? (
        <div className="mt-4">
          <WalletsPanel me={me} onRefresh={() => void reloadDesk().catch((e) => setErr(e instanceof Error ? e.message : ""))} />
        </div>
      ) : null}

      {tab === "watch" ? (
        <div className="mt-4 grid gap-4">
          <form
            className="term-card grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call("alerts/add", { mint: mint.trim(), target: alertTarget }).then(() => loadWatch()).catch((e2) => setErr(e2 instanceof Error ? e2.message : ""));
            }}
          >
            <p className="term-label">{tr("Alerts")}</p>
            <TextInput value={mint} placeholder={tr("Coin address")} onChange={(e) => setMint(e.target.value)} />
            <TextInput value={alertTarget} placeholder={tr("2m, +50%, -30%, or price 0.001")} onChange={(e) => setAlertTarget(e.target.value)} />
            <Button type="submit" disabled={!mint.trim()}>{tr("Add alert")}</Button>
            {list(watch?.alerts).map((a) => (
              <div key={text(a.id)} className="flex items-center justify-between gap-2 text-sm">
                <span>{tr("{0} {1}", text(a.symbol), text(a.target))}</span>
                <button type="button" className="text-cyan" onClick={() => void call("alerts/del", { id: text(a.id) }).then(() => loadWatch())}>
                  {tr("Remove")}
                </button>
              </div>
            ))}
          </form>
          <form
            className="term-card grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call("wallets/add", { address: copyAddress.trim(), ...(chain ? { chain } : {}) }).then(() => {
                setCopyAddress("");
                return loadWatch();
              }).catch((e2) => setErr(e2 instanceof Error ? e2.message : ""));
            }}
          >
            <p className="term-label">{tr("Copy a wallet")}</p>
            <TextInput value={copyAddress} placeholder={tr("Wallet address")} onChange={(e) => setCopyAddress(e.target.value)} />
            <Button type="submit">{tr("Watch wallet")}</Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={watch?.copy_live === true}
                onChange={(e) => {
                  void call("copylive", { on: e.target.checked }).then(() => loadWatch()).catch((e2) => setErr(e2 instanceof Error ? e2.message : ""));
                }}
              />
              {tr("Copy trading on")}
            </label>
            {list(watch?.wallets).map((w) => (
              <div key={text(w.id)} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{text(w.label) || text(w.address)}</span>
                <span className="flex gap-2">
                  <button type="button" className="text-cyan" onClick={() => void call("wallets/copy", { id: text(w.id), copy_on: w.copy_on !== true }).then(() => loadWatch())}>
                    {w.copy_on === true ? tr("Copy on") : tr("Copy off")}
                  </button>
                  <button type="button" className="text-cyan" onClick={() => void call("wallets/del", { id: text(w.id) }).then(() => loadWatch())}>
                    {tr("Remove")}
                  </button>
                </span>
              </div>
            ))}
          </form>
        </div>
      ) : null}

      {tab === "feed" ? (
        <div className="mt-4 grid gap-3">
          <div className="flex gap-2 overflow-x-auto">
            {(["new", "trending", "koth", "graduated", "volume"] as const).map((id) => (
              <button key={id} type="button" className={sort === id ? "btn-cyan shrink-0" : "btn-line shrink-0"} onClick={() => { setSort(id); void loadFeed(id); }}>
                {tr(id === "koth" ? "King" : id === "new" ? "New" : id === "trending" ? "Trending" : id === "graduated" ? "Graduated" : "Volume")}
              </button>
            ))}
          </div>
          {list(feed?.items).map((item) => (
            <button
              key={text(item.mint) || text(item.symbol)}
              type="button"
              className="term-card w-full text-left text-sm"
              onClick={() => {
                if (text(item.mint)) {
                  setMint(text(item.mint));
                  setTab("trade");
                }
              }}
            >
              <span className="block truncate font-semibold">{text(item.symbol) || text(item.name) || tr("Not available")}</span>
              <span className="mt-1 block text-muted">{[text(item.chain), money(item.mc || item.mcap || item.volume)].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {stats ? (
            <div className="term-card text-sm">
              <p className="term-label">{tr("Badges")}</p>
              <ul className="mt-2 space-y-1">
                {list(stats.badges).map((b) => (
                  <li key={text(b.id)}>{tr("{0} {1} — {2}", text(b.emoji), text(b.name), b.earned === true ? tr("Earned") : tr("Not yet"))}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {trust ? (
            <ul className="term-card space-y-2 text-sm">
              <Row label="Rank" value={text(trust.rank)} />
              <Row label="Week" value={text(trust.week)} />
              <Row label="Tier" value={text(trust.tier)} />
            </ul>
          ) : null}
        </div>
      ) : null}
      {toast ? <p className="mt-3 text-sm text-cyan">{toast}</p> : null}
    </div>
  );
}
