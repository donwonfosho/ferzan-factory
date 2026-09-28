import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { explorerAddress, isEvmChain } from "@/lib/factory/deploy";
import { solanaExplorerMint } from "@/lib/factory/solana";
import { ChainPanel } from "./chain-panel";
import { SolanaPanel } from "./solana-panel";
import { CoinTape, CoinThread } from "./coin-board";
import { creatorLabel, owns, previewTrade } from "@/lib/factory/engine";
import { useFactory } from "@/lib/factory/store";
import type { Launch } from "@/lib/factory/types";
import { bpsLabel, compactWhole, formatPrice, formatSmart, formatTokensPerNative, formatWhen } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { termsAccepted } from "@/lib/factory/terms";
import { TermsGate } from "./terms";
import { GraduationMeter } from "./graduation-meter";
import { Dollar } from "./dollar";
import { Holders } from "./holders";
import { Button, Mark } from "./ui";

import { tr } from "@/lib/i18n";
export function TokenView({ id }: { id: string }) {
  const launches = useFactory((s) => s.launches);
  const desk = useFactory((s) => s.desk);
  const item = launches.find((row) => row.id === id);
  if (!item) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">{tr("Not on the floor")}</h1>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-cyan">
          {tr("Back to the floor")}
        </Link>
      </div>
    );
  }
  const primary = item.kind === "attached" ? launches.find((row) => row.id === item.primaryId) : item;
  const chain = CHAINS[item.chain];
  const picture = item.kind === "primary" ? item : primary;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <p className="text-sm font-medium text-cyan">
          {item.kind === "primary" ? tr("Primary") : tr("Attached")} · {tr(chain.label)}
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Mark symbol={item.symbol} image={picture?.image} className="frame h-28 w-28 text-2xl" />
          <div>
            <h1 className="text-4xl tracking-tight">
              {item.kind === "attached" ? item.name : item.symbol}
            </h1>
            <p className="mt-1 text-muted">
              {item.kind === "attached" ? (
                <>
                  {tr("On")}{" "}
                  <Link to="/t/$id" params={{ id: item.primaryId ?? "" }} className="text-cyan">
                    {item.symbol}
                  </Link>
                </>
              ) : (
                item.name
              )}
              {" · "}
              <CreatorLink creator={item.creator} />
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-xl">{tr(item.blurb)}</p>
        <Social item={item.kind === "primary" ? item : (primary ?? item)} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <CopyLink />
        </div>
        {item.contract ? (
          <ContractLine chain={item.chain} address={item.contract} />
        ) : null}
        {item.kind === "primary" && item.mode === "curve" && primary && !item.contract ? (
          <CurveBlock launchId={primary.id} />
        ) : null}
        {item.kind === "primary" && item.mode === "plain" ? (
          <p className="mt-4 text-sm text-muted">
            {tr("Regular pool. Supply")}{" "}{compactWhole(item.supplyWhole)}
            {item.contract ? tr(" is on this contract.") : "."}{" "}{tr("No curve.")}
          </p>
        ) : null}

        {primary && item.kind === "primary" ? <Rules item={primary} /> : null}
        {item.contract ? <Holders chain={item.chain} address={item.contract} decimals={chain.tokenDecimals} /> : null}

        <h2 className="mt-8 text-lg font-extrabold">{tr("Tape")}</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {(primary ?? item).tape.length === 0 && item.tape.length === 0 ? <li className="text-muted">{tr("Quiet.")}</li> : null}
          {(item.kind === "attached" ? item.tape : (primary?.tape ?? [])).map((tick, index) => (
            <li key={`${tick.t}-${index}`} className="flex justify-between gap-4">
              <span>
                <span className="text-cyan">{tick.side}</span> {tick.who} — {tr(tick.detail)}
              </span>
              <span className="shrink-0 text-muted tabular-nums">{formatWhen(tick.t)}</span>
            </li>
          ))}
        </ul>
        {item.contract ? <CoinTape contract={item.contract} chain={item.chain} /> : null}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        {primary ? <Position primary={primary} /> : null}
        {item.contract && item.chain === "solana" && item.mode === "curve" ? (
          <SolanaPanel mint={item.contract} symbol={item.symbol} />
        ) : item.contract && item.mode === "curve" && isEvmChain(item.chain) ? (
          <ChainPanel chain={item.chain} address={item.contract} symbol={item.symbol} />
        ) : item.kind === "primary" && item.mode === "curve" ? (
          <TradeTicket id={item.id} />
        ) : item.kind === "attached" && primary?.mode === "curve" ? (
          <div className="ticket">
            <p className="text-lg font-extrabold">{tr("Trade the primary")}</p>
            <p className="mt-2 text-sm text-muted">{tr("Buys that pick")}{" "}{item.name}{" "}{tr("pay the referrer cut here.")}</p>
            <Link
              to="/t/$id"
              params={{ id: primary.id }}
              className="mt-4 inline-flex min-h-11 items-center bg-cyan px-4 font-semibold text-cyan-ink"
            >
              {tr("Open")}{" "}{primary.symbol}
            </Link>
          </div>
        ) : (
          <div className="ticket text-sm text-muted">{tr("This coin has no curve.")}</div>
        )}
        <p className="mt-4 text-xs text-muted">
          {tr("Desk")}{" "}{tr(chain.label)}: {formatSmart(BigInt(desk.balances[item.chain] ?? "0"), chain.nativeDecimals)} {chain.native}
        </p>
        {item.contract ? <CoinThread contract={item.contract} chain={item.chain} /> : null}
      </aside>
    </div>
  );
}

function CreatorLink({ creator }: { creator: string }) {
  const live = creator.startsWith("0x") || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(creator);
  if (!live) return creatorLabel(creator);
  return (
    <Link to="/p/$address" params={{ address: creator }} className="text-cyan">
      {creatorLabel(creator)}
    </Link>
  );
}

function Social({ item }: { item: { telegram: string; xHandle: string; creator: string } }) {
  if (!item.telegram && !item.xHandle) return null;
  const live = item.creator === "you" || item.creator.startsWith("0x") || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item.creator);
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {item.telegram ? (
        live ? (
          <a className="btn-line" href={`https://t.me/${item.telegram}`}>
            {tr("Telegram @")}{item.telegram}
          </a>
        ) : (
          <span className="btn-line">{tr("Telegram @")}{item.telegram}</span>
        )
      ) : null}
      {item.xHandle ? (
        live ? (
          <a className="btn-line" href={`https://x.com/${item.xHandle}`}>
            X @{item.xHandle}
          </a>
        ) : (
          <span className="btn-line">X @{item.xHandle}</span>
        )
      ) : null}
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-line"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? tr("Copied") : tr("Copy link")}
    </button>
  );
}

function Rules({ item }: { item: Launch }) {
  const chain = CHAINS[item.chain];
  const dev = item.devBuy && item.devBuy !== "0" ? `${item.devBuy} ${chain.native}` : "None";
  const cap = item.maxBuy && item.maxBuy !== "0" ? `${formatSmart(BigInt(item.maxBuy), chain.nativeDecimals)} ${chain.native}` : "No cap";
  const delay = item.startAt > item.createdAt ? `${Math.round((item.startAt - item.createdAt) / 60_000)} min` : "Opens immediately";
  return (
    <div className="mt-6">
      <h2 className="text-lg font-extrabold">{tr("Rules")}</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <Fee label={tr("Dev buy")} value={dev} />
        <Fee label={tr("Max buy")} value={cap} />
        <Fee label={tr("Opens")} value={delay} />
      </dl>
      {item.allocs.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {item.allocs.map((row) => (
            <li key={row.label} className="flex justify-between gap-4">
              <span>{tr(row.label)}</span>
              <span className="tabular-nums text-muted">{bpsLabel(row.bps)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{tr("No team allocation.")}</p>
      )}
    </div>
  );
}

function Position({ primary }: { primary: Launch }) {
  const desk = useFactory((s) => s.desk);
  const wallet = useFactory((s) => s.wallet);
  const chain = CHAINS[primary.chain];
  const held = BigInt(desk.tokens[primary.id] ?? "0");
  const bought = BigInt(desk.bought[primary.id] ?? "0");
  return (
    <div className="mb-4 bg-surface p-4 shadow-border">
      <p className="text-sm font-medium text-muted">{tr("Your position")}</p>
      <p className="mt-2 text-lg font-extrabold tabular-nums">
        {formatSmart(held, chain.tokenDecimals)} {primary.symbol}
      </p>
      <p className="text-sm text-muted tabular-nums">
        {tr("Bought")}{" "}{formatSmart(bought, chain.nativeDecimals)} {chain.native}
      </p>
      {owns(primary.creator, wallet) ? (
        <p className="mt-2 text-sm tabular-nums">
          {tr("Creator cut")}{" "}{formatSmart(BigInt(primary.feeCreator), chain.nativeDecimals)} {chain.native}
        </p>
      ) : null}
    </div>
  );
}

function CurveBlock({ launchId }: { launchId: string }) {
  const launch = useFactory((s) => s.launches.find((row) => row.id === launchId));
  if (!launch) return null;
  const chain = CHAINS[launch.chain];
  const goal = BigInt(launch.graduation);
  const prices = [...launch.tape].reverse().map((tick) => tick.price).filter((n) => n > 0);
  return (
    <div className="mt-6">
      <div>
        <p className="text-3xl font-extrabold tabular-nums">{formatTokensPerNative(launch.lastPrice)}</p>
        <p className="text-sm text-muted">
          {launch.symbol}{" "}{tr("per 1")}{" "}{chain.native}
          {launch.lastPrice > 0 ? tr(" · {0} {1} each", formatPrice(launch.lastPrice), chain.native) : ""}
          {launch.lastPrice > 0 ? <Dollar chain={launch.chain} nativePerToken={launch.lastPrice} /> : null}
        </p>
      </div>
      <Spark values={prices} />
      <GraduationMeter
        filled={BigInt(launch.realEth)}
        goal={goal}
        graduated={launch.graduated}
        native={chain.native}
        decimals={chain.nativeDecimals}
      />
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <Fee label={tr("Treasury 60%")} value={`${formatSmart(BigInt(launch.feePlatform), chain.nativeDecimals)} ${chain.native}`} />
        <Fee label={tr("Creator 30%")} value={`${formatSmart(BigInt(launch.feeCreator), chain.nativeDecimals)} ${chain.native}`} />
        <Fee label={tr("Referrer 10%")} value={`${formatSmart(BigInt(launch.feeReferrer), chain.nativeDecimals)} ${chain.native}`} />
      </dl>
    </div>
  );
}

function Fee({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-3 shadow-border">
      <dt className="text-sm text-muted">{tr(label)}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 640;
  const h = 160;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-40 w-full text-cyan" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function TradeTicket({ id }: { id: string }) {
  const launches = useFactory((s) => s.launches);
  const desk = useFactory((s) => s.desk);
  const send = useFactory((s) => s.trade);
  const launch = launches.find((row) => row.id === id)!;
  const chain = CHAINS[launch.chain];
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [needTerms, setNeedTerms] = useState(false);

  const preview = useMemo(() => {
    if (!amount.trim()) return null;
    return previewTrade({ launches, desk }, { launchId: id, side, amount, attachId: null });
  }, [launches, desk, id, side, amount]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!termsAccepted()) {
      setNeedTerms(true);
      return;
    }
    const res = send({ launchId: id, side, amount, attachId: null });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError("");
    setAmount("");
  }

  return (
    <form onSubmit={submit} className="ticket space-y-4">
      {needTerms ? <TermsGate onAccept={() => setNeedTerms(false)} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={cn("min-h-11 font-semibold", side === "buy" ? "bg-cyan text-cyan-ink" : "bg-bg text-muted shadow-border")}
          onClick={() => setSide("buy")}
        >
          {tr("Buy")}
        </button>
        <button
          type="button"
          className={cn("min-h-11 font-semibold", side === "sell" ? "bg-sell text-cyan-ink" : "bg-bg text-muted shadow-border")}
          onClick={() => setSide("sell")}
        >
          {tr("Sell")}
        </button>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-muted">
          {side === "buy" ? chain.native : launch.symbol}
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="min-h-11 w-full bg-bg px-3 tabular-nums shadow-border outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(side === "buy" ? ["0.1", "0.5", "1"] : ["25%", "50%", "100%"]).map((preset) => (
          <button
            key={preset}
            type="button"
            className="min-h-11 px-3 text-sm text-muted shadow-border"
            onClick={() => {
              if (side === "buy") {
                setAmount(preset);
                return;
              }
              const held = BigInt(desk.tokens[id] ?? "0");
              const pct = preset === "25%" ? 25n : preset === "50%" ? 50n : 100n;
              const cut = (held * pct) / 100n;
              setAmount(formatSmart(cut, chain.tokenDecimals));
            }}
          >
            {preset}
          </button>
        ))}
      </div>
      <p className="min-h-6 text-sm text-muted" aria-live="polite">
        {preview ? (preview.ok ? preview.line : preview.error) : side === "sell" ? tr("Sells pay no referrer.") : tr("Quote shows before you fill.")}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-sell">
          {tr(error)}
        </p>
      ) : null}
      <Button type="submit" variant={side === "sell" ? "sell" : "cyan"} disabled={launch.graduated}>
        {launch.graduated ? tr("Graduated") : side === "buy" ? tr("Buy the curve") : tr("Sell the curve")}
      </Button>
    </form>
  );
}

const SCAN: Record<string, string> = {
  base: "Basescan",
  ethereum: "Etherscan",
  bsc: "BscScan",
  solana: "Solscan",
  robinhood: "the explorer",
  arc: "the explorer",
};

export function ContractLine({ chain, address }: { chain: string; address: string }) {
  const [copied, setCopied] = useState("");
  const href =
    chain === "solana"
      ? solanaExplorerMint(address)
      : chain === "ethereum" || chain === "bsc" || chain === "base" || chain === "robinhood" || chain === "arc"
        ? explorerAddress(chain, address)
        : "";
  const scan = SCAN[chain] ?? "the explorer";

  return (
    <div className="mt-4 bg-surface px-3 py-3 shadow-border">
      <p className="text-sm font-medium text-cyan">{tr("Contract")}</p>
      <p className="mt-2 text-sm font-semibold break-all">{address}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-line"
          onClick={() => {
            void navigator.clipboard.writeText(address).then(
              () => setCopied("Contract copied."),
              () => setCopied("Copy was blocked. Select the address above."),
            );
          }}
        >
          {tr("Copy contract")}
        </button>
        {href ? (
          <a className="btn-line" href={href}>
            {tr("View on")}{" "}{scan}
          </a>
        ) : null}
      </div>
      {copied ? <p className="mt-2 text-sm text-muted">{copied}</p> : null}
    </div>
  );
}
