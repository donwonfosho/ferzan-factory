import { useEffect, useState } from "react";
import { getTransparency, type Transparency } from "@/lib/factory/trust";
import { useLive, useLiveConnected } from "@/lib/factory/live";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";

const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);
const tx = (sig: string) => `https://solscan.io/tx/${sig}`;
const n0 = (v: number) => Math.round(v).toLocaleString();
const sol = (v: number) => `${v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toFixed(4)} SOL`;

function Tile({ label, value, hint, live }: { label: string; value: string; hint?: string; live?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-border">
      <p className="flex items-center gap-2 text-xs text-muted">
        {label}
        {live ? <span className="live-dot" aria-label="Live" /> : null}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Every number behind Ferzan, with the transactions to check it. */
export function TransparencyPage() {
  const [t, setT] = useState<Transparency | null | undefined>(undefined);
  const [extra, setExtra] = useState(0);
  const live = useLiveConnected();

  useEffect(() => {
    let stop = false;
    const pull = () =>
      getTransparency()
        .then((r) => {
          if (!stop) {
            setT(r);
            setExtra(0);
          }
        })
        .catch(() => !stop && setT((x) => (x === undefined ? null : x)));
    void pull();
    const id = window.setInterval(pull, 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useLive((e) => {
    if (e.type === "trade") setExtra((x) => x + 1);
  });

  if (t === undefined) return <p className="ticket mx-auto max-w-3xl text-sm text-muted">Loading the numbers…</p>;
  if (t === null) return <p className="ticket mx-auto max-w-3xl text-sm text-muted">The numbers did not load. Try again in a minute.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header>
        <h1 className="text-4xl">Transparency</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every number behind Ferzan, from our own records and the chains themselves. Each FERZAN buyback and burn links to its transactions so you can check it.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Coins launched" value={n0(t.totals.launches)} hint="On all 8 chains" />
        <Tile label="Graduated" value={n0(t.totals.graduated)} hint="Filled their curve" />
        <Tile label="Trading volume" value={compactUsd(t.totals.volumeUsd)} hint="On Ferzan curves" />
        <Tile label="Paid to creators" value={compactUsd(t.totals.creatorFeesUsd)} hint="Half of every curve fee (Base, BNB, Ethereum, Robinhood, Arc, Tron)" />
        <Tile label="Trades, last 24 h" value={n0(t.totals.trades24h + extra)} live={live} hint={`${n0(t.totals.traders24h)} different wallets`} />
        <Tile label="Trades, all time" value={n0(t.totals.tradesAll + extra)} live={live} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl">FERZAN buyback and burn</h2>
          <p className="mt-1 text-sm text-muted">
            Every day a program on Ferzan's server claims Ferzan's share of the Solana trading fees, spends 30% of it buying FERZAN on the open market and burns what it
            bought. The rest goes to the Ferzan multisig.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="FERZAN burned" value={n0(t.burn.burned)} />
          <Tile label="Spent buying FERZAN" value={sol(t.burn.boughtSol)} hint={t.burn.boughtUsd ? compactUsd(t.burn.boughtUsd) : undefined} />
          <Tile label="Fees claimed" value={sol(t.burn.claimedSol)} />
          <Tile label="To the multisig" value={sol(t.burn.forwardSol)} />
        </div>
        {t.burns.length === 0 ? (
          <p className="ticket text-sm text-muted">
            {t.ferzanLive
              ? "The first daily run has not happened yet. It shows up here with its transactions as soon as it does."
              : "FERZAN launches Friday, October 9 at 7:00 PM ET. The first buyback and burn runs the day after, and every run shows up here with its transactions."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl shadow-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Day (UTC)</th>
                  <th className="px-3 py-2 text-right font-medium">Claimed</th>
                  <th className="px-3 py-2 text-right font-medium">Bought with</th>
                  <th className="px-3 py-2 text-right font-medium">Burned</th>
                  <th className="px-3 py-2 font-medium">Receipts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.burns.map((d) => (
                  <tr key={d.day}>
                    <td className="px-3 py-2 tabular-nums">{d.day}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sol(d.claimedSol)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sol(d.boughtSol)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-cyan">{n0(d.burned)}</td>
                    <td className="space-x-3 px-3 py-2 whitespace-nowrap">
                      {d.burnTx ? (
                        <a className="text-cyan" href={tx(d.burnTx)} target="_blank" rel="noopener noreferrer">
                          Burn
                        </a>
                      ) : null}
                      {d.buyTx ? (
                        <a className="text-cyan" href={tx(d.buyTx)} target="_blank" rel="noopener noreferrer">
                          Buy
                        </a>
                      ) : null}
                      {d.claimTxs.map((c, i) => (
                        <a key={c} className="text-muted hover:text-cyan" href={tx(c)} target="_blank" rel="noopener noreferrer">
                          Claim{d.claimTxs.length > 1 ? ` ${i + 1}` : ""}
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">By chain</h2>
        <div className="overflow-x-auto rounded-2xl shadow-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Chain</th>
                <th className="px-3 py-2 text-right font-medium">Launched</th>
                <th className="px-3 py-2 text-right font-medium">Graduated</th>
                <th className="px-3 py-2 text-right font-medium">Volume</th>
                <th className="px-3 py-2 text-right font-medium">24 h</th>
                <th className="px-3 py-2 text-right font-medium">Paid to creators</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.chains.map((c) => (
                <tr key={c.chain}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      {MARKS.has(c.chain) ? <ChainMark id={c.chain as MarkChain} className="h-5 w-5" /> : null}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{n0(c.launches)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n0(c.graduated)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{compactUsd(c.volumeUsd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{compactUsd(c.volume24hUsd)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", c.creatorFeesNative ? "" : "text-muted")}>
                    {c.chain === "solana" ? "Paid by Meteora" : c.creatorFeesNative ? `${c.creatorFeesNative.toPrecision(3)} ${c.unit}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Volume is in today's dollars. On Solana, Meteora pays creators their half of the fees directly, and creators claim it themselves.</p>
      </section>

      <section className="ticket space-y-3">
        <h2 className="text-xl">Where the fees go</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Every trade on a Ferzan curve pays 1%.</li>
          <li>Half goes to the coin's creator on every trade, for as long as it trades.</li>
          <li>The other half goes to Ferzan, or 40% to Ferzan and 10% to whoever referred the buyer.</li>
          <li>On Solana, 30% of Ferzan's share buys FERZAN every day and burns it (above). The rest goes to the Ferzan multisig.</li>
        </ul>
        {t.multisig ? (
          <p className="text-sm">
            Ferzan multisig (Squads):{" "}
            <a className="break-all font-mono text-xs text-cyan" href={`https://solscan.io/account/${t.multisig}`} target="_blank" rel="noopener noreferrer">
              {t.multisig}
            </a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
