import { useEffect, useRef, useState } from "react";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { deskCall, deskLinked, deskSafety, type DeskOp } from "@/lib/factory/trade-desk";
import { setPollInterval } from "@/lib/factory/poll";
import { CHAINS } from "@/lib/factory/catalog";
import { tr } from "@/lib/i18n";
import { Button, TextInput } from "./ui";

type Rec = Record<string, unknown>;
type Gate = "wait" | "out" | "check" | "locked" | "open";
type Tab = "trade" | "book" | "watch" | "feed";

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
  if (typeof value !== "number" || !Number.isFinite(value)) return tr("Not available");
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 4 });
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

export function TerminalPage() {
  const account = useAccountWallets();
  const accountRef = useRef(account);
  accountRef.current = account;
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

  useEffect(() => {
    if (!account?.ready) return;
    if (!account.authenticated) {
      setGate("out");
      return;
    }
    let stop = false;
    setGate("check");
    void account.accessToken().then(async (token) => {
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
    const token = await account?.accessToken();
    if (!token) throw new Error("Sign in again");
    const raw = await deskCall({ data: { token, op, body } });
    return JSON.parse(raw) as unknown;
  }

  useEffect(() => {
    if (gate !== "open") return;
    let stop = false;
    void (async () => {
      const token = await accountRef.current?.accessToken();
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
      void accountRef.current?.accessToken().then(async (token) => {
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

  async function lookup() {
    setBusy(true);
    setCoin(null);
    setRules(null);
    setSafety("");
    try {
      const row = rec(await call("token", { mint: mint.trim() }));
      setCoin(row);
      const rule = rec(await call("rules", { mint: mint.trim() }));
      setRules(rule);
      const check = await deskSafety({ data: { mint: mint.trim(), chain } });
      setSafety(check ? plain(JSON.parse(check) as unknown) : "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("That coin looks wrong."));
    } finally {
      setBusy(false);
    }
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
      <div className="mx-auto max-w-lg">
        <h1 className="text-4xl">{tr("Terminal")}</h1>
        <p className="mt-4 text-muted">{tr("Loading…")}</p>
      </div>
    );
  }

  if (gate !== "open") {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-4xl">{tr("Terminal")}</h1>
        <p className="mt-4 text-lg">{tr(LOCKED)}</p>
        <p className="mt-2 text-sm text-muted">{tr("Buys and sells go through your Telegram bot. Keys and withdrawals stay in that chat.")}</p>
        {err ? <p className="mt-3 text-sm text-muted">{err}</p> : null}
        <Button className="mt-6" onClick={() => account?.linkTelegram()}>
          {gate === "out" ? tr("Sign in") : tr("Link Telegram")}
        </Button>
      </div>
    );
  }

  const noWallet = book?.noWallet === true;
  const bot = https(book?.bot_link) || https(me?.bot_link);
  const presets = rec(book?.presets);
  const buyPresets = Array.isArray(presets.sol) ? presets.sol : [];
  const sellPresets = Array.isArray(presets.sell) ? presets.sell : [];
  const positions = list(book?.positions);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl">{tr("Terminal")}</h1>
      <p className="mt-2 text-sm text-muted">{tr("The bot places the trade. This page never sees your keys.")}</p>
      {err ? <p className="mt-3 text-sm text-muted">{err}</p> : null}
      {me ? (
        <ul className="ticket mt-4 space-y-2 text-sm">
          <Row label="Fee" value={me.fee_exempt === true ? tr("Exempt") : text(me.fee_bps) ? tr("{0} bps", text(me.fee_bps)) : ""} />
          <Row label="30 day volume" value={text(me.volume30) ? money(me.volume30) : ""} />
          <Row label="Next fee" value={me.next_tier ? tr("{0} bps at {1}", text(rec(me.next_tier).bps), money(rec(me.next_tier).at)) : ""} />
          <Row label="Wallets" value={[text(rec(me.addresses).sol), text(rec(me.addresses).evm), text(rec(me.addresses).ton)].filter(Boolean).join(" · ")} />
          {https(rec(me.ref).link) ? (
            <li>
              <a className="text-cyan" href={https(rec(me.ref).link)}>
                {tr("Referral link")}
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}

      {noWallet ? (
        <div className="ticket mt-4">
          <p className="font-semibold">{tr("No wallet yet")}</p>
          <p className="mt-2">{tr("Open the bot and tap Start once")}</p>
          {bot ? (
            <a className="btn-cyan mt-4" href={bot}>
              {tr("Open the bot")}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {(
          [
            ["trade", "Trade"],
            ["book", "Portfolio"],
            ["watch", "Watch"],
            ["feed", "Feed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "btn-cyan shrink-0" : "btn-line shrink-0"}
            onClick={() => {
              setTab(id);
              if (id === "watch") void loadWatch();
              if (id === "feed") {
                void loadFeed();
                void loadMore();
              }
            }}
          >
            {tr(label)}
          </button>
        ))}
      </div>

      {tab === "trade" ? (
        <div className="mt-4 grid gap-4">
          <form
            className="ticket grid gap-3"
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
            <div className="flex gap-2">
              <button type="button" className={side === "buy" ? "btn-cyan" : "btn-line"} onClick={() => { setSide("buy"); setUnit("usd"); }}>
                {tr("Buy")}
              </button>
              <button type="button" className={side === "sell" ? "btn-sell" : "btn-line"} onClick={() => { setSide("sell"); setUnit("pct"); }}>
                {tr("Sell")}
              </button>
            </div>
            <TextInput value={mint} placeholder={tr("Coin address")} onChange={(e) => setMint(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {(side === "buy" ? buyPresets : sellPresets).map((n) => (
                <button key={String(n)} type="button" className="btn-line" onClick={() => setAmount(String(n))}>
                  {String(n)}
                </button>
              ))}
            </div>
            <TextInput value={amount} inputMode="decimal" placeholder={side === "sell" ? tr("Percent, 1 to 100") : tr("Amount")} onChange={(e) => setAmount(e.target.value)} />
            {side === "buy" ? (
              <div className="flex gap-2">
                <button type="button" className={unit === "usd" ? "btn-cyan" : "btn-line"} onClick={() => setUnit("usd")}>{tr("USD")}</button>
                <button type="button" className={unit === "native" ? "btn-cyan" : "btn-line"} onClick={() => setUnit("native")}>{tr("Native coin")}</button>
              </div>
            ) : (
              <p className="text-sm text-muted">{tr("Sells use a percent of the bag, from 1 to 100.")}</p>
            )}
            <label className="text-sm text-muted">
              {tr("Chain")}
              <select className="mt-1 min-h-12 w-full rounded-lg bg-bg px-3" value={chain} onChange={(e) => setChain(e.target.value)} aria-label={tr("Chain")}>
                <option value="">{tr("Any")}</option>
                {Object.values(CHAINS).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            {book?.multi === true ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
                {tr("Use every wallet")}
              </label>
            ) : null}
            <Button type="submit" variant={side === "sell" ? "sell" : "cyan"} disabled={busy || Boolean(orderId) || noWallet}>
              {orderId ? tr("Order working…") : side === "buy" ? tr("Buy") : tr("Sell")}
            </Button>
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
          {coin ? (
            <ul className="ticket space-y-2 text-sm">
              <Row label="Coin" value={[text(coin.symbol), text(coin.name)].filter(Boolean).join(" · ")} />
              <Row label="Price" value={money(coin.price)} />
              <Row label="Market cap" value={money(coin.mc)} />
              <Row label="Liquidity" value={money(coin.liq)} />
              <Row label="24h" value={text(coin.chg24)} />
              <li><Spark data={coin.chart} /></li>
              <Row label="Safety" value={text(coin.safety) || safety} />
              <Row label="Fee" value={text(coin.fee_bps)} />
            </ul>
          ) : null}
          {rules ? (
            <div className="ticket text-sm">
              <p className="font-semibold">{tr("Rules")}</p>
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
          <ul className="ticket space-y-2 text-sm">
            <Row label="Total" value={book ? money(book.total_usd) : ""} />
            <Row label="Profit" value={book ? money(book.pnl_usd) : ""} />
          </ul>
          <Button variant="ghost" onClick={() => void call("portfolio", { refresh: true }).then((row) => setBook(rec(row))).catch((e) => setErr(e instanceof Error ? e.message : ""))}>
            {tr("Refresh")}
          </Button>
          {positions.map((p) => (
            <button
              key={text(p.mint)}
              type="button"
              className="ticket w-full text-left text-sm"
              onClick={() => {
                setMint(text(p.mint));
                setTab("trade");
              }}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{text(p.symbol) || tr("Not available")}</span>
                <Spark data={p.chart} />
              </span>
              <span className="mt-1 block text-muted">
                {tr("{0} · value {1} · profit {2}", text(p.chain), money(p.value), money(p.pnl))}
              </span>
            </button>
          ))}
          {list(book?.wallets).length > 1 ? (
            <div className="ticket text-sm">
              <p className="font-semibold">{tr("Wallet slot")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {list(book?.wallets).map((w) => (
                  <button
                    key={text(w.id)}
                    type="button"
                    className={w.active === true ? "btn-cyan" : "btn-line"}
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
            <p key={`${text(item.mint)}-${i}`} className="text-sm text-muted">
              {tr("{0} {1} {2} · {3}", text(item.side), text(item.symbol), money(item.usd), text(item.source))}
            </p>
          ))}
        </div>
      ) : null}

      {tab === "watch" ? (
        <div className="mt-4 grid gap-4">
          <form
            className="ticket grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call("alerts/add", { mint: mint.trim(), target: alertTarget }).then(() => loadWatch()).catch((e2) => setErr(e2 instanceof Error ? e2.message : ""));
            }}
          >
            <p className="font-semibold">{tr("Alerts")}</p>
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
            className="ticket grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call("wallets/add", { address: copyAddress.trim(), ...(chain ? { chain } : {}) }).then(() => {
                setCopyAddress("");
                return loadWatch();
              }).catch((e2) => setErr(e2 instanceof Error ? e2.message : ""));
            }}
          >
            <p className="font-semibold">{tr("Copy a wallet")}</p>
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
              className="ticket w-full text-left text-sm"
              onClick={() => {
                if (text(item.mint)) {
                  setMint(text(item.mint));
                  setTab("trade");
                }
              }}
            >
              <span className="font-semibold">{text(item.symbol) || text(item.name) || tr("Not available")}</span>
              <span className="mt-1 block text-muted">{[text(item.chain), money(item.mc || item.mcap || item.volume)].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {stats ? (
            <div className="ticket text-sm">
              <p className="font-semibold">{tr("Badges")}</p>
              <ul className="mt-2 space-y-1">
                {list(stats.badges).map((b) => (
                  <li key={text(b.id)}>{tr("{0} {1} — {2}", text(b.emoji), text(b.name), b.earned === true ? tr("Earned") : tr("Not yet"))}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {trust ? (
            <ul className="ticket space-y-2 text-sm">
              <Row label="Rank" value={text(trust.rank)} />
              <Row label="Week" value={text(trust.week)} />
              <Row label="Tier" value={text(trust.tier)} />
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
