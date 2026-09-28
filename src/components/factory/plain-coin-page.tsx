import { useEffect, useState } from "react";
import { getPlainCoin, type PlainChain, type PlainCoin } from "@/lib/factory/plain-coin";
import { ChainMark } from "./chain-mark";
import { CreatorScoreBox } from "./creator-score";
import { ShareCoin } from "./perks";
import { WatchButton } from "./watch";
import { CoinComments } from "./coin-comments";

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

function whole(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A standard Ferzan coin on Tron, TON or Arc: fixed supply, no curve. Trading happens in the Trade Bot once a pool exists. */
export function PlainCoinPage({ chain, token }: { chain: PlainChain; token: string }) {
  const [coin, setCoin] = useState<PlainCoin | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    setCoin(undefined);
    getPlainCoin({ data: { chain, token } })
      .then((c) => !stop && setCoin(c))
      .catch((e: unknown) => !stop && setError(e instanceof Error ? e.message : "Could not load this coin."));
    return () => {
      stop = true;
    };
  }, [chain, token]);

  if (error) return <p className="ticket mx-auto max-w-3xl text-sm text-sell">{error}</p>;
  if (coin === undefined) return <p className="ticket mx-auto max-w-3xl text-sm text-muted">Loading the coin…</p>;
  if (coin === null) {
    return <p className="ticket mx-auto max-w-3xl text-sm text-muted">This is not a Ferzan launch, or it has not been confirmed yet.</p>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(coin?.token ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const launched = coin.launchedTs ? new Date(coin.launchedTs * 1000).toLocaleDateString() : "";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="ticket flex items-start gap-4">
        {coin.image ? <img src={coin.image} alt="" className="h-16 w-16 shrink-0 object-cover" /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl">
            {coin.name} <span className="text-muted">${coin.symbol}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted">
            <ChainMark id={coin.chain} className="h-4 w-4" /> {coin.chainName} ·{" "}
            {coin.explorer ? (
              <a className="text-cyan" href={coin.explorer} target="_blank" rel="noopener noreferrer">
                {short(coin.token)}
              </a>
            ) : (
              short(coin.token)
            )}
            {coin.creator ? <> · by {short(coin.creator)}</> : null}
            {launched ? <> · {launched}</> : null}
          </p>
          {coin.description ? <p className="mt-2 text-sm">{coin.description}</p> : null}
          <p className="mt-2 flex flex-wrap gap-3 text-sm">
            {coin.links.website ? <a className="text-cyan" href={coin.links.website} target="_blank" rel="noopener noreferrer">Website</a> : null}
            {coin.links.x ? <a className="text-cyan" href={coin.links.x} target="_blank" rel="noopener noreferrer">X</a> : null}
            {coin.links.telegram ? <a className="text-cyan" href={coin.links.telegram} target="_blank" rel="noopener noreferrer">Telegram</a> : null}
          </p>
        </div>
      </div>

      <ShareCoin chain={coin.chain} token={coin.token} symbol={coin.symbol} />
      <div className="flex flex-wrap gap-2">
        <WatchButton chain={coin.chain} token={coin.token} symbol={coin.symbol} path={`/token/${coin.chain}/${coin.token}`} />
      </div>
      <CoinComments chain={coin.chain} token={coin.token} creator={coin.creator} />
      <CreatorScoreBox token={coin.token} />

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="ticket">
          <p className="text-xs text-muted">Total supply</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{whole(coin.supply)}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">Type</p>
          <p className="text-base font-extrabold sm:text-lg">Fixed supply</p>
        </div>
      </div>

      <div className="ticket space-y-3">
        <p className="text-sm">
          Standard token: the whole supply was minted once to the creator, there is no owner and nothing can mint more. It trades once
          the creator opens a pool; then you can buy it in the Ferzan Trade Bot with your own wallet.
        </p>
        <div className="flex flex-wrap gap-2">
          {coin.tradeBot ? (
            <a className="btn-cyan inline-flex" href={coin.tradeBot} target="_blank" rel="noopener noreferrer">
              Buy in Ferzan Trade Bot
            </a>
          ) : null}
          <button type="button" className="btn-line min-h-10 px-3 text-sm" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy contract"}
          </button>
          {coin.explorer ? (
            <a className="btn-line inline-flex min-h-10 items-center px-3 text-sm" href={coin.explorer} target="_blank" rel="noopener noreferrer">
              View on explorer
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
