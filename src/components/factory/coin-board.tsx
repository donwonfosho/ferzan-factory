import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { addPost, listCoinTrades, listPosts, type BoardPost, type BoardTrade } from "@/lib/factory/board";
import { listFills, type Fill } from "@/lib/factory/market";
import { creatorLabel } from "@/lib/factory/engine";
import { useFactory } from "@/lib/factory/store";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart, formatWhen, formatPrice, parsePrice } from "@/lib/factory/units";
import { Button } from "./ui";
import { PriceChart } from "./price-chart";

export function CoinTape({ contract, chain, createdAt, supply }: { contract: string; chain: string; createdAt?: string; supply?: string }) {
  const [rows, setRows] = useState<BoardTrade[]>([]);
  const [chainRows, setChainRows] = useState<Fill[]>([]);
  const meta = CHAINS[chain as ChainId];

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const next = await listCoinTrades({ data: { contract: contract.toLowerCase() } });
        if (!stop) setRows([...next].reverse());
      } catch {
        /* keep the last tape */
      }
      if (chain === "ethereum" || chain === "bsc" || chain === "base" || chain === "robinhood" || chain === "arc") {
        try {
          const fills = await listFills({ data: { chain, contract } });
          if (!stop) setChainRows([...fills].reverse());
        } catch {
          /* the board list still shows */
        }
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [contract, chain]);

  const history = chainRows.length > 0;

  return (
    <section className="mt-8">
      <PriceChart contract={contract} chain={chain} createdAt={createdAt} native={meta?.native ?? ""} supply={supply} />
      <h2 className="mt-8 text-lg font-extrabold">Trades</h2>
      <p className="mt-1 text-sm text-muted">Buys and sells on this contract, newest first.</p>
      {!history && rows.length === 0 ? <p className="mt-3 text-sm text-muted">No trades on this contract yet.</p> : null}
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {history
          ? chainRows.map((row, index) => (
              <li key={`${row.t}-${index}`} className="flex items-start justify-between gap-3 py-3 text-sm">
                <span>
                  <span className={row.side === "sell" ? "font-semibold text-sell" : "font-semibold text-cyan"}>
                    {row.side === "sell" ? "Sell" : "Buy"}
                  </span>{" "}
                  {row.who ? creatorLabel(row.who) : row.venue === "market" ? "Market" : "Wallet"}
                  <span className="mt-0.5 block text-muted tabular-nums">
                    {formatSmart(BigInt(row.native || "0"), meta?.nativeDecimals ?? 18)} {meta?.native ?? "ETH"}
                    {row.price ? ` · ${formatPrice(row.price)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-muted tabular-nums">{formatWhen(row.t)}</span>
              </li>
            ))
          : rows.map((row, index) => (
              <li key={`${row.createdAt}-${index}`} className="flex items-start justify-between gap-3 py-3 text-sm">
                <span>
                  <span className={row.side === "sell" ? "font-semibold text-sell" : "font-semibold text-cyan"}>
                    {row.side === "sell" ? "Sell" : "Buy"}
                  </span>{" "}
                  {row.who ? creatorLabel(row.who) : "Wallet"}
                  <span className="mt-0.5 block text-muted tabular-nums">
                    {amountLabel(row, meta?.native ?? "", meta?.nativeDecimals ?? 18)}
                    {row.price ? ` · ${shownPrice(row.price)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-muted tabular-nums">{when(row.createdAt)}</span>
              </li>
            ))}
      </ul>
    </section>
  );
}

export function CoinThread({ contract, chain }: { contract: string; chain: string }) {
  const wallet = useFactory((s) => s.wallet);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const next = await listPosts({ data: { contract: contract.toLowerCase() } });
        if (!stop) setPosts(next);
      } catch {
        /* keep the last thread */
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [contract]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let author = wallet;
    if (!author || !author.startsWith("0x")) {
      setError("Create a wallet on Account before you post. Opening the site does not create one.");
      return;
    }
    setBusy(true);
    try {
      await addPost({ data: { contract, chain, author, body } });
      setBody("");
      const next = await listPosts({ data: { contract: contract.toLowerCase() } });
      setPosts(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4">
      <h2 className="text-lg font-extrabold">Thread</h2>
      <p className="mt-1 text-sm text-muted">Replies stay on this coin. Newest first. Each one shows the wallet that posted.</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 280))}
          placeholder="Say something about this coin"
          rows={3}
          className="w-full bg-bg px-3 py-3 text-sm shadow-border outline-none"
        />
        {error ? <p className="text-sm text-sell">{error}</p> : null}
        <Button type="submit" disabled={busy || body.trim().length === 0}>
          {busy ? "Posting" : "Reply"}
        </Button>
      </form>
      {posts.length === 0 ? <p className="mt-4 text-sm text-muted">No replies yet.</p> : null}
      <ul className="mt-3 space-y-3">
        {posts.map((post) => (
          <li key={post.id} className="bg-surface px-3 py-3 shadow-border">
            <p className="text-xs font-semibold text-cyan">{creatorLabel(post.author)}</p>
            <p className="mt-1 text-sm">{post.body}</p>
            <p className="mt-1 text-xs text-muted tabular-nums">{when(post.createdAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function shownPrice(raw: string): string {
  const n = parsePrice(raw);
  if (n == null) return raw;
  const shown = formatPrice(n);
  return shown === "—" ? raw : shown;
}

function amountLabel(row: BoardTrade, native: string, decimals: number) {
  let wei = 0n;
  try {
    wei = BigInt(row.amountWei || "0");
  } catch {
    return row.amountWei;
  }
  if (row.side === "sell") return `${formatSmart(wei, 18)} tokens`;
  return `${formatSmart(wei, decimals)} ${native}`;
}

function when(value: string) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return formatWhen(ms);
}
