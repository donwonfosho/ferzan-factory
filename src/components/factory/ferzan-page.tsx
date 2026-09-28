import { useEffect, useState } from "react";
import { OnlyOnFerzan } from "./floor-live";

/** FERZAN launch: Friday, October 9, 2026, 7:00 PM Eastern (23:00 UTC). */
const LAUNCH_AT = Date.UTC(2026, 9, 9, 23, 0, 0);
const SQUADS_VAULT = "2vWqwX72ijo24vgvPQW6yBQh2qXE4jrEd18YDdEbWKLG";
const FLAGSHIP_CONFIG = "8YoqjUBsyfgQv5s7fWR5nyjeMd43rKvMUEexAuYRCvbo";

const SUPPLY = [
  { pct: "28%", amount: "279,991,997", name: "Public curve", detail: "Every one of these is bought on the curve. No presale, no dev buy." },
  { pct: "7%", amount: "69,998,001", name: "Graduation liquidity", detail: "Paired with the SOL raised in the Meteora pool at graduation. The liquidity is locked forever." },
  { pct: "5%", amount: "50,000,000", name: "Unlocks at graduation", detail: "Airdrop and early rewards, held by the Ferzan multisig." },
  { pct: "60%", amount: "600,000,000", name: "Locked, 24 months", detail: "Meteora releases 25,000,000 a month to the multisig. Nobody can speed it up." },
] as const;

const FEE_STEPS = [
  ["0", "99%"],
  ["1", "85%"],
  ["2", "73%"],
  ["5", "46%"],
  ["10", "21%"],
  ["15", "10%"],
  ["20", "5%"],
  ["30", "1%"],
] as const;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function Countdown() {
  const now = useNow();
  const left = Math.max(0, LAUNCH_AT - now);
  if (left === 0) return <p className="mt-4 text-lg font-extrabold text-cyan">FERZAN is live. Find it on the Launches board.</p>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <div className="mt-5 grid max-w-md grid-cols-4 gap-2 text-center" aria-label="Time until FERZAN launches">
      {[
        [d, "days"],
        [h, "hours"],
        [m, "min"],
        [s, "sec"],
      ].map(([v, label]) => (
        <div key={label} className="ticket px-2 py-3">
          <p className="text-2xl font-extrabold tabular-nums">{String(v).padStart(2, "0")}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}

function Address({ label, value }: { label: string; value: string }) {
  return (
    <li className="py-3">
      <p className="text-sm text-muted">{label}</p>
      <a
        className="block break-all font-mono text-sm text-cyan"
        href={`https://solscan.io/account/${value}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {value}
      </a>
    </li>
  );
}

export function FerzanPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <img src="/brand/ferzan-token.jpg" alt="FERZAN token" className="h-32 w-32 shrink-0 rounded-full" />
        <div>
          <p className="text-sm font-medium text-cyan">Solana · Meteora bonding curve</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">FERZAN</h1>
          <p className="mt-2 text-muted">Launches Friday, October 9 at 7:00 PM Eastern.</p>
          <Countdown />
        </div>
      </section>

      <section>
        <p className="max-w-2xl text-muted">
          FERZAN powers the Ferzan ecosystem: the Ferzan Factory launchpad and the Ferzan Telegram bots for launching, trading and
          tracking coins on Solana, Base, BNB, Ethereum and Robinhood Chain. Every day, part of Ferzan&apos;s platform fees buys FERZAN on
          the open market and burns it.
        </p>
        <p className="mt-3 text-sm text-muted">
          The contract address is published here, on @Ferzan_Launches and on X the moment it goes live. Anything posted before that is
          not FERZAN.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Supply: 1,000,000,000</h2>
        <p className="mt-1 text-sm text-muted">Fixed. The mint authority is removed at launch, so no more can ever be made.</p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {SUPPLY.map((row) => (
            <li key={row.name} className="grid gap-1 py-3 sm:grid-cols-[6rem_1fr] sm:gap-4">
              <p className="text-2xl font-extrabold tabular-nums">{row.pct}</p>
              <div>
                <p className="font-semibold">
                  {row.name} <span className="text-sm font-normal text-muted">· {row.amount}</span>
                </p>
                <p className="text-sm text-muted">{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          The locked tokens only start unlocking after FERZAN graduates. They sit in a 2-of-3 Squads multisig, so no single key can move them.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Launch protection</h2>
        <p className="mt-1 text-sm text-muted">
          The trading fee starts at 99% and falls every 30 seconds to the normal 1% at 30 minutes, so sniping the open costs almost
          everything. A volatility fee also rises whenever the price swings hard.
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {FEE_STEPS.map(([min, fee]) => (
            <div key={min} className="ticket px-2 py-2 text-center">
              <p className="font-extrabold tabular-nums">{fee}</p>
              <p className="text-xs text-muted">min {min}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Graduation</h2>
        <p className="mt-1 text-sm text-muted">
          The curve opens at about 50 SOL market cap and graduates at about 800 SOL. About 56 SOL then moves into a Meteora pool with the
          liquidity locked forever.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Fees and the burn</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          <li>1% on every FERZAN trade after the first 30 minutes: half to the Ferzan multisig, half to Ferzan.</li>
          <li>
            Every day a program on Ferzan&apos;s server claims Ferzan&apos;s share of the fees from every Solana launch, spends 30% of it
            buying FERZAN, and burns what it bought. Each day&apos;s claim, buy and burn is posted with the transaction links.
          </li>
          <li>No transfer tax. No staking promises. Nothing here is a promise of price or profit.</li>
        </ul>
      </section>

      <OnlyOnFerzan />

      <section>
        <h2 className="text-xl font-extrabold">On-chain addresses</h2>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          <Address label="Ferzan multisig (Squads vault)" value={SQUADS_VAULT} />
          <Address label="FERZAN Meteora config" value={FLAGSHIP_CONFIG} />
        </ul>
      </section>
    </div>
  );
}
