import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { botMeta, CHAINS, COMMUNITY_URL, PLACES } from "@/lib/factory/catalog";
import { listBoard, listLaunched, quoteBoard, type BoardCoin, type BoardMark } from "@/lib/factory/board";
import { solanaAddress } from "@/lib/factory/solana";
import { creatorLabel, owns } from "@/lib/factory/engine";
import { useFactory } from "@/lib/factory/store";
import type { ChainId, Kind, Launch } from "@/lib/factory/types";
import { compactWhole, formatPrice, formatSmart } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { HotList } from "./hot-list";
import { GraduationMeter } from "./graduation-meter";
import { Mark } from "./ui";
import { ChainMark, type MarkChain } from "./chain-mark";
import { CapChange, Spark } from "./market-line";

const OPEN_CHAINS = ["base", "bsc", "ethereum", "robinhood", "arc", "solana"] as const;
const PICKS: { id: "all" | MarkChain; label: string }[] = [
  { id: "all", label: "All chains" },
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "bsc", label: "BNB" },
  { id: "ethereum", label: "Ethereum" },
  { id: "robinhood", label: "Robinhood" },
  { id: "arc", label: "Arc" },
];
const SORTS = [
  { id: "new", label: "Newest" },
  { id: "buys", label: "Buys" },
  { id: "volume", label: "Volume" },
] as const;

export function Floor() {
  const wallet = useFactory((s) => s.wallet);
  const [chain, setChain] = useState<"all" | MarkChain>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");
  const [board, setBoard] = useState<BoardCoin[]>([]);
  const [marks, setMarks] = useState<Record<string, BoardMark>>({});
  const [lane, setLane] = useState<"new" | "filling" | "done">("new");
  const [chainsOpen, setChainsOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  useEffect(() => setSearchOn(true), []);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const rows = await listBoard({ data: { chain, sort, q: q.trim() } });
        if (!stop) setBoard(rows);
        const marks: BoardMark[] = [];
        for (let i = 0; i < rows.length; i += 12) {
          const slice = rows.slice(i, i + 12).map((coin) => ({ chain: coin.chain, contract: coin.contract, supply: coin.supply || "0" }));
          const quoted = await quoteBoard({ data: { rows: slice } }).catch(() => []);
          marks.push(...quoted);
        }
        if (!stop) {
          const next: Record<string, BoardMark> = {};
          for (const mark of marks) next[mark.contract] = mark;
          setMarks(next);
        }
      } catch {
        if (!stop) setBoard([]);
      }
    }
    const timer = window.setTimeout(() => void pull(), 200);
    const poll = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [chain, sort, q]);

  const openCurves = board.filter((coin) => {
    const mark = marks[coin.contract];
    return mark ? !mark.graduated : true;
  }).length;
  const graduated = board.filter((coin) => marks[coin.contract]?.graduated).length;
  const visible = board.filter((coin) => {
    const mark = marks[coin.contract];
    if (lane === "done") return Boolean(mark?.graduated);
    if (lane === "filling") return Boolean(mark && !mark.graduated && mark.progress >= 50);
    return !mark?.graduated;
  });
  const emptyLane =
    lane === "done" ? "No coin on this board has graduated yet." : lane === "filling" ? "Nothing is close to graduating." : "No coins on this chain yet. A launch shows here for everyone.";

  return (
    <div className="space-y-14">
      <section>
        <img
          src="/brand/lockup.jpg"
          alt="Ferzan Factory. See it. Ape it. Send it."
          className="h-auto w-full max-w-sm"
        />
        <h1 className="mt-8 max-w-xl text-4xl leading-tight sm:text-5xl">
          Launch a coin. Trade it here.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Base, Ethereum, BNB, Solana, Robinhood, and Arc. The curve trades when the chain confirms.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan w-full sm:w-auto">
            Launch a coin
          </Link>
          <a href="#open" className="btn-line w-full sm:w-auto">
            Open a contract
          </a>
        </div>
        <dl className="mt-8 grid max-w-lg grid-cols-3 gap-6">
          <Stat label="On the board" value={String(board.length)} />
          <Stat label="Open" value={String(openCurves)} />
          <Stat label="Graduated" value={String(graduated)} />
        </dl>
      </section>

      <OpenContract />

      <HotList chain={chain} />

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl">Floor</h2>
            <p className="mt-1 text-sm text-muted">Every launch from this site. Market cap is in dollars.</p>
          </div>
          {searchOn ? (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ticker, name, or contract"
              className="min-h-11 w-full bg-surface px-3 text-sm shadow-border outline-none placeholder:text-muted sm:max-w-xs"
              aria-label="Search the floor"
            />
          ) : (
            <div className="min-h-11 w-full bg-surface sm:max-w-xs" />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" className="btn-line gap-2" onClick={() => setChainsOpen((open) => !open)} aria-expanded={chainsOpen}>
              {chain === "all" ? null : <ChainMark id={chain} className="h-5 w-5" />}
              {PICKS.find((pick) => pick.id === chain)?.label}
            </button>
            {chainsOpen ? (
              <div className="absolute z-20 mt-2 w-56 rounded-xl bg-surface p-2 shadow-border">
                {PICKS.map((pick) => (
                  <button
                    key={pick.id}
                    type="button"
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm",
                      chain === pick.id ? "bg-cyan/15 text-cyan" : "text-fg hover:bg-bg",
                    )}
                    onClick={() => {
                      setChain(pick.id);
                      setChainsOpen(false);
                    }}
                  >
                    {pick.id === "all" ? <span className="grid h-5 w-5 place-items-center text-xs">All</span> : <ChainMark id={pick.id} className="h-5 w-5" />}
                    {pick.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSort(item.id)}
              className={cn("min-h-11 px-3 text-sm font-semibold", sort === item.id ? "chip-on" : "bg-surface text-muted shadow-border")}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {(
            [
              ["new", "New"],
              ["filling", "Graduating"],
              ["done", "Graduated"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLane(id)}
              className={cn("min-h-11 shrink-0 px-3 text-sm font-semibold", lane === id ? "chip-on" : "bg-surface text-muted shadow-border")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {visible.length === 0 ? <p className="py-8 text-muted">{emptyLane}</p> : null}
          {visible.map((coin) => (
            <BoardRow key={coin.id} coin={coin} mark={marks[coin.contract]} />
          ))}
        </div>
      </section>

      <YourCoins wallet={wallet} />

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/ferzan" className="ticket block">
          <p className="text-sm font-medium text-cyan">Desk token</p>
          <p className="mt-2 text-2xl font-extrabold">FERZAN</p>
          <p className="mt-1 text-sm text-muted">Fee claim for the tools. Not another coin on the floor.</p>
        </Link>
        <Link to="/bots" className="ticket block">
          <p className="text-sm font-medium text-cyan">Telegram</p>
          <p className="mt-2 text-2xl font-extrabold">Bots</p>
          <p className="mt-1 text-sm text-muted">{PLACES.map((place) => place.name.replace("Ferzan ", "")).slice(0, 3).join(" · ")}</p>
        </Link>
      </section>
    </div>
  );
}

function OpenContract() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [chain, setChain] = useState<(typeof OPEN_CHAINS)[number]>("base");
  const [error, setError] = useState("");

  function open(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    const evm = chain !== "solana";
    if (evm && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Paste the contract address. It starts with 0x and is 42 characters.");
      return;
    }
    if (!evm && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      setError("Paste the Solana mint address.");
      return;
    }
    setError("");
    void navigate({ to: "/c/$chain/$address", params: { chain, address } });
  }

  return (
    <form id="open" onSubmit={open} className="ticket">
      <p className="text-sm font-medium text-cyan">Open a contract</p>
      <p className="mt-2 text-sm text-muted">Pick the chain, then paste the contract. A curve on that chain can be traded here.</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {OPEN_CHAINS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setChain(id)}
            className={cn("min-h-16 px-2 py-2", chain === id ? "chip-on" : "bg-bg text-fg shadow-border hover:shadow-border-hover")}
          >
            <ChainMark id={id} className="mx-auto h-7 w-7" />
            <span className="mt-1 block text-xs font-semibold">
              {id === "ethereum" ? "ETH" : id === "bsc" ? "BNB" : id === "robinhood" ? "Hood" : id === "solana" ? "SOL" : CHAINS[id].label}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={chain === "solana" ? "Mint address" : "0x…"}
          spellCheck={false}
          className="min-h-11 w-full bg-bg px-3 shadow-border outline-none"
          aria-label="Contract address"
        />
        <button type="submit" className="btn-cyan shrink-0">
          Open
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-sell">{error}</p> : null}
    </form>
  );
}

function BoardRow({ coin, mark }: { coin: BoardCoin; mark?: BoardMark }) {
  const meta = CHAINS[coin.chain as ChainId];
  const up = (mark?.change ?? 0) >= 0;
  return (
    <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="flex items-center gap-3 py-3">
      <Mark symbol={coin.symbol} image={coin.image} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold">{coin.symbol}</span>
          {meta ? <ChainMark id={coin.chain as MarkChain} className="h-4 w-4" /> : null}
        </span>
        <span className="block truncate text-sm text-muted">
          {coin.name} · {age(coin.createdAt)}
        </span>
      </span>
      <Spark values={mark?.spark ?? []} up={up} />
      <CapChange mark={mark} chain={coin.chain as ChainId} />
    </Link>
  );
}

function age(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function Row({ item, launches }: { item: Launch; launches: Launch[] }) {
  const chain = CHAINS[item.chain];
  const primary = item.kind === "attached" ? launches.find((row) => row.id === item.primaryId) : item;
  const progress = bar(primary);
  return (
    <Link
      to="/t/$id"
      params={{ id: item.id }}
      className="grid gap-2 py-4 hover:bg-surface sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Mark symbol={item.symbol} image={item.image} />
        <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl">
            {item.kind === "attached" ? item.name : item.symbol}
          </span>
          <span className="text-muted">{item.kind === "attached" ? `on ${item.symbol}` : item.name}</span>
          <Kind kind={item.kind} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {chain.label}
          {item.kind === "primary"
            ? ` · ${item.mode === "curve" ? "Curve" : "Pool"}`
            : ` · ${item.bots.flatMap((id) => botMeta(id)?.name ?? []).join(", ")}`}
        </p>
        {item.kind === "primary" && item.mode === "curve" && primary ? (
          <div className="mt-2 max-w-xs">
            <GraduationMeter
              filled={BigInt(primary.realEth)}
              goal={BigInt(primary.graduation)}
              graduated={primary.graduated}
              native={chain.native}
              decimals={chain.nativeDecimals}
            />
          </div>
        ) : null}
        </div>
      </div>
      <div className="flex items-center justify-end gap-4 text-left tabular-nums sm:text-right">
        <div>
          <div className="font-semibold">
            {item.kind === "attached"
              ? "Referrer"
              : item.mode === "curve"
                ? formatPrice(item.lastPrice)
                : compactWhole(item.supplyWhole)}
          </div>
          <div className="text-sm text-muted">
            {item.kind === "attached"
              ? `${money(item.feeReferrer, item.chain)} earned`
              : item.graduated
                ? "Graduated"
                : item.mode === "curve"
                  ? `${Math.round(progress * 100)}% to graduate`
                  : "No curve"}
          </div>
        </div>
        <span className="btn-line hidden sm:inline-flex">{item.mode === "curve" && item.kind === "primary" ? "Trade" : "Open"}</span>
      </div>
    </Link>
  );
}

function Steps() {
  const steps = [
    ["Wallet is ready", "Created in this browser. Send gas once. An extension is optional."],
    ["Sign here", "Launch and trades sign with the wallet on your profile."],
    ["Trade it", "Buy and sell on the coin page as soon as the transaction confirms."],
  ];
  return (
    <section>
      <h2 className="text-xl font-extrabold">How a launch works</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map(([title, detail], index) => (
          <li key={title} className="bg-surface p-4 shadow-border">
            <p className="text-sm font-medium text-cyan">0{index + 1}</p>
            <p className="mt-2 font-extrabold">{title}</p>
            <p className="mt-1 text-sm text-muted">{detail}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">
        A curve is tradable when it confirms. The meter fills on buys and drops on sells. A new curve opens Uniswap on Ethereum, Robinhood, and Arc, Aerodrome on Base, and PancakeSwap on BNB Chain. 30% of that LP stays with the creator. The rest is burned. Coins from before this update burn the whole LP.
      </p>
    </section>
  );
}

function YourCoins({ wallet }: { wallet: string }) {
  const [rows, setRows] = useState<BoardCoin[]>([]);
  useEffect(() => {
    if (!wallet) {
      setRows([]);
      return;
    }
    let stop = false;
    const sol = wallet.startsWith("0x") ? solanaAddress() : null;
    void Promise.all([
      listLaunched({ data: { creator: wallet } }).catch(() => [] as BoardCoin[]),
      sol ? listLaunched({ data: { creator: sol } }).catch(() => [] as BoardCoin[]) : Promise.resolve([] as BoardCoin[]),
    ]).then(([evmRows, solRows]) => {
      if (!stop) setRows([...evmRows, ...solRows]);
    });
    return () => {
      stop = true;
    };
  }, [wallet]);
  if (!wallet || rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-2xl">Your coins</h2>
      <p className="mt-1 text-sm text-muted">Launched by this wallet. Paste the key on another phone and they come back here.</p>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {rows.map((coin) => (
          <BoardRow key={coin.id} coin={coin} />
        ))}
      </div>
    </section>
  );
}

function Lanes({ launches }: { launches: Launch[] }) {
  const primaries = launches.filter((item) => item.kind === "primary");
  const fresh = [...primaries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  const graduating = primaries
    .filter((item) => item.mode === "curve" && !item.graduated)
    .sort((a, b) => bar(b) - bar(a))
    .slice(0, 3);
  const done = primaries.filter((item) => item.graduated).slice(0, 3);
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Lane title="Just stamped" rows={fresh} empty="No primaries yet." />
      <Lane title="Graduating" rows={graduating} empty="No open curves." />
      <Lane title="Graduated" rows={done} empty="None yet." />
    </section>
  );
}

function Lane({ title, rows, empty }: { title: string; rows: Launch[]; empty: string }) {
  return (
    <div className="bg-surface p-4 shadow-border">
      <p className="text-sm font-medium text-cyan">{title}</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">{empty}</p> : null}
      <ul className="mt-3 space-y-3">
        {rows.map((item) => (
          <li key={item.id}>
            <Link to="/t/$id" params={{ id: item.id }} className="flex items-center gap-3">
              <Mark symbol={item.symbol} image={item.image} />
              <span className="min-w-0">
                <span className="block font-extrabold">{item.symbol}</span>
                <span className="block truncate text-sm text-muted">
                  {CHAINS[item.chain].label}
                  {item.mode === "curve" ? ` · ${Math.round(bar(item) * 100)}%` : " · Fixed"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Yours({ launches }: { launches: Launch[] }) {
  const wallet = useFactory((s) => s.wallet);
  const rows = launches.filter((item) => item.kind === "primary" && owns(item.creator, wallet));
  if (!wallet || rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-2xl">Your coins</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {rows.map((item) => (
          <li key={item.id}>
            <Link to="/t/$id" params={{ id: item.id }} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Mark symbol={item.symbol} image={item.image} />
                <span className="min-w-0">
                  <span className="block font-semibold">{item.kind === "attached" ? item.name : item.symbol}</span>
                  <span className="block text-sm text-muted">{item.kind === "primary" ? "Creator 30%" : "Referrer 10%"}</span>
                </span>
              </span>
              <span className="text-sm tabular-nums">
                {money(item.kind === "primary" ? item.feeCreator : item.feeReferrer, item.chain)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Board({ launches }: { launches: Launch[] }) {
  const primaries = launches.filter((item) => item.kind === "primary");
  const top = [...primaries].sort((a, b) => buys(b) - buys(a) || b.createdAt - a.createdAt).slice(0, 4);
  const social = primaries
    .map((item) => {
      const groups = launches.filter((row) => row.kind === "attached" && row.primaryId === item.id && row.group).length;
      const score = (item.telegram ? 2 : 0) + (item.xHandle ? 2 : 0) + groups * 3 + buyers(item);
      return { item, groups, score };
    })
    .filter((row) => row.item.telegram || row.item.xHandle || row.groups > 0)
    .sort((a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt)
    .slice(0, 4);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold">Board</h2>
        <p className="max-w-md text-sm text-muted">Ranked by buys and attaches on this floor. Not follower counts.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-surface p-4 shadow-border">
          <p className="text-sm font-medium text-cyan">Top projects</p>
          <ol className="mt-3 space-y-2">
            {top.map((item, index) => (
              <li key={item.id}>
                <Link to="/t/$id" params={{ id: item.id }} className="grid grid-cols-[2rem_2.75rem_1fr_auto] items-center gap-3 py-2">
                  <span className="text-2xl font-extrabold text-cyan tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <Mark symbol={item.symbol} image={item.image} />
                  <span className="min-w-0">
                    <span className="block font-extrabold">{item.symbol}</span>
                    <span className="block truncate text-sm text-muted">
                      {item.name} · {CHAINS[item.chain].label}
                    </span>
                    {item.mode === "curve" ? (
                      <span className="mt-1 block h-1.5 max-w-40 bg-surface-2">
                        <span className="block h-full bg-cyan" style={{ width: `${Math.round(bar(item) * 100)}%` }} />
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="block font-semibold">
                      {item.mode === "curve" ? money(item.raisedEth, item.chain) : "Fixed"}
                    </span>
                    <span className="text-muted">{buys(item)} buys</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-surface p-4 shadow-border">
          <p className="text-sm font-medium text-cyan">Top social</p>
          <ol className="mt-3 space-y-3">
            {social.length === 0 ? <li className="text-sm text-muted">No coin has published a channel yet.</li> : null}
            {social.map((row) => (
              <li key={row.item.id}>
                <Link to="/t/$id" params={{ id: row.item.id }} className="block min-h-11 py-1">
                  <span className="font-extrabold">{row.item.symbol}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {row.item.telegram ? `Telegram @${row.item.telegram}` : "No Telegram"}
                    {" · "}
                    {row.item.xHandle ? `X @${row.item.xHandle}` : "No X"}
                    {row.groups ? ` · ${row.groups} group${row.groups === 1 ? "" : "s"}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">
            House coins print the handle on the ticket. They are not live accounts. A coin you stamp links out.
          </p>
          <p className="mt-4 text-sm font-medium text-muted">Factory</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="btn-line" href={COMMUNITY_URL}>
              Ferzan Chat
            </a>
            {PLACES.map((place) => (
              <a key={place.handle} className="btn-line" href={place.href}>
                {place.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function buys(item: Launch) {
  return item.tape.filter((tick) => tick.side === "buy").length;
}

function buyers(item: Launch) {
  return new Set(item.tape.filter((tick) => tick.side === "buy").map((tick) => tick.who)).size;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

function Kind({ kind }: { kind: Kind }) {
  return (
    <span className="text-sm font-medium text-cyan">
      {kind === "primary" ? "Primary" : "Attached"}
    </span>
  );
}

function bar(item: Launch | undefined) {
  if (!item || item.mode !== "curve") return 0;
  if (item.graduated) return 1;
  const goal = BigInt(item.graduation);
  if (goal <= 0n) return 0;
  return Math.min(1, Number((BigInt(item.realEth) * 10_000n) / goal) / 10_000);
}

function money(raw: string, chain: ChainId) {
  const meta = CHAINS[chain];
  return `${formatSmart(BigInt(raw), meta.nativeDecimals)} ${meta.native}`;
}
