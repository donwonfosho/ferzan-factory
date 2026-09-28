import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CHAINS, PLACES } from "@/lib/factory/catalog";
import { listBoard, quoteBoard, type BoardCoin, type BoardMark } from "@/lib/factory/board";
import type { ChainId } from "@/lib/factory/types";
import { cn } from "@/lib/cn";
import { HotList } from "./hot-list";
import { LaunchBoard } from "./launch-board";
import { Mark } from "./ui";
import { ChainMark, type MarkChain } from "./chain-mark";
import { CapChange, Spark } from "./market-line";
import { FerzanHero, KingOfTheHill, OnlyOnFerzan } from "./floor-live";

import { tr } from "@/lib/i18n";
const OPEN_CHAINS = ["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"] as const;

export function Floor() {
  const [chain, setChain] = useState<"all" | MarkChain>("all");

  return (
    <div className="space-y-14">
      <section>
        <img
          src="/brand/lockup.jpg"
          alt={tr("Ferzan Factory. See it. Ape it. Send it.")}
          className="h-auto w-full max-w-sm"
        />
        <h1 className="mt-8 max-w-xl text-4xl leading-tight sm:text-5xl">
          {tr("Launch a coin. Trade it here.")}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          {tr("Solana, Base, BNB, Ethereum, Robinhood, Arc, Tron and TON. Sign in, launch, and trade with your own account wallet.")}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan w-full sm:w-auto">
            {tr("Launch a coin")}
          </Link>
          <a href="#launches" className="btn-line w-full sm:w-auto">
            {tr("See launches")}
          </a>
        </div>
      </section>

      <FerzanHero />

      <KingOfTheHill />

      <LaunchBoard chain={chain} onChain={setChain} />

      <OnlyOnFerzan />

      <OpenContract />

      <EarlierCoins />

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/ferzan" className="ticket block">
          <p className="text-sm font-medium text-cyan">{tr("Desk token")}</p>
          <p className="mt-2 text-2xl font-extrabold">{tr("FERZAN")}</p>
          <p className="mt-1 text-sm text-muted">{tr("Fee claim for the tools. Not another coin on the floor.")}</p>
        </Link>
        <Link to="/bots" className="ticket block">
          <p className="text-sm font-medium text-cyan">{tr("Telegram")}</p>
          <p className="mt-2 text-2xl font-extrabold">{tr("Bots")}</p>
          <p className="mt-1 text-sm text-muted">{PLACES.map((place) => place.name.replace("Ferzan ", "")).slice(0, 3).join(" · ")}</p>
        </Link>
      </section>
    </div>
  );
}

/** Coins on the site's first contracts (before launches moved to the bots' factories). Loaded only when opened. */
function EarlierCoins() {
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<BoardCoin[] | null>(null);
  const [marks, setMarks] = useState<Record<string, BoardMark>>({});

  useEffect(() => {
    if (!open) return;
    let stop = false;
    async function pull() {
      try {
        const rows = await listBoard({ data: { chain: "all", sort: "new", q: "" } });
        if (stop) return;
        setBoard(rows);
        const found: BoardMark[] = [];
        for (let i = 0; i < rows.length && i < 36; i += 12) {
          const slice = rows.slice(i, i + 12).map((coin) => ({ chain: coin.chain, contract: coin.contract, supply: coin.supply || "0" }));
          found.push(...(await quoteBoard({ data: { rows: slice } }).catch(() => [])));
        }
        if (!stop) {
          const next: Record<string, BoardMark> = {};
          for (const mark of found) next[mark.contract] = mark;
          setMarks(next);
        }
      } catch {
        if (!stop) setBoard([]);
      }
    }
    void pull();
    const poll = window.setInterval(() => void pull(), 30_000);
    return () => {
      stop = true;
      window.clearInterval(poll);
    };
  }, [open]);

  return (
    <section>
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <span className="block text-xl font-extrabold">{tr("Earlier coins")}</span>
          <span className="block text-sm text-muted">{tr("Launched on this site's first contracts. They still open and trade.")}</span>
        </span>
        <span className="btn-line shrink-0">{open ? tr("Hide") : tr("Show")}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-6">
          <HotList chain="all" />
          <div className="divide-y divide-line border-y border-line">
            {board === null ? <p className="py-6 text-sm text-muted">{tr("Loading…")}</p> : null}
            {board && board.length === 0 ? <p className="py-6 text-sm text-muted">{tr("None.")}</p> : null}
            {(board ?? []).map((coin) => (
              <BoardRow key={coin.id} coin={coin} mark={marks[coin.contract]} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const OPEN_LABEL: Record<(typeof OPEN_CHAINS)[number], string> = {
  solana: "SOL",
  base: "Base",
  bsc: "BNB",
  ethereum: "ETH",
  robinhood: "Hood",
  arc: "Arc",
  tron: "Tron",
  ton: "TON",
};

function OpenContract() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [chain, setChain] = useState<(typeof OPEN_CHAINS)[number]>("solana");
  const [error, setError] = useState("");

  function open(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    if (chain === "tron" || chain === "ton") {
      const ok = chain === "tron" ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) : /^[A-Za-z0-9_-]{48}$/.test(address);
      if (!ok) {
        setError(chain === "tron" ? tr("Paste the Tron token address. It starts with T and is 34 characters.") : tr("Paste the TON jetton address (48 characters, starts with EQ or UQ)."));
        return;
      }
      setError("");
      void navigate({ to: "/token/$chain/$address", params: { chain, address } });
      return;
    }
    const evm = chain !== "solana";
    if (evm && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError(tr("Paste the contract address. It starts with 0x and is 42 characters."));
      return;
    }
    if (!evm && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      setError(tr("Paste the Solana mint address."));
      return;
    }
    setError("");
    void navigate({ to: "/c/$chain/$address", params: { chain, address } });
  }

  return (
    <form id="open" onSubmit={open} className="ticket">
      <p className="text-sm font-medium text-cyan">{tr("Open a contract")}</p>
      <p className="mt-2 text-sm text-muted">{tr("Pick the chain, then paste the contract. Curves on Solana, Base, BNB, Ethereum, Robinhood and Arc trade right here; Tron and TON coins open their Ferzan page with a link to trade in the Trade Bot.")}</p>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {OPEN_CHAINS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setChain(id)}
            className={cn("min-h-16 px-2 py-2", chain === id ? "chip-on" : "bg-bg text-fg shadow-border hover:shadow-border-hover")}
          >
            <ChainMark id={id} className="mx-auto h-7 w-7" />
            <span className="mt-1 block text-xs font-semibold">
              {OPEN_LABEL[id]}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={chain === "solana" ? tr("Mint address") : chain === "tron" ? "T…" : chain === "ton" ? tr("EQ… or UQ…") : "0x…"}
          spellCheck={false}
          className="min-h-11 w-full bg-bg px-3 shadow-border outline-none"
          aria-label={tr("Contract address")}
        />
        <button type="submit" className="btn-cyan shrink-0">
          {tr("Open")}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-sell">{tr(error)}</p> : null}
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

