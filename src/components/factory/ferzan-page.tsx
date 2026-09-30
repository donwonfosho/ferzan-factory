import { useEffect, useState } from "react";
import { OnlyOnFerzan } from "./floor-live";

import { tr } from "@/lib/i18n";
/** FERZAN launch: Thursday, October 15, 2026, 4:00 PM Eastern (20:00 UTC). */
const LAUNCH_AT = Date.UTC(2026, 9, 15, 20, 0, 0);
const SQUADS_VAULT = "2vWqwX72ijo24vgvPQW6yBQh2qXE4jrEd18YDdEbWKLG";
const FLAGSHIP_CONFIG = "8YoqjUBsyfgQv5s7fWR5nyjeMd43rKvMUEexAuYRCvbo";

const SUPPLY = [
  { pct: "28%", amount: "279,991,997", name: "Public curve", detail: "Every one of these is bought on the curve. No presale, no dev buy." },
  { pct: "7%", amount: "69,998,001", name: "Graduation liquidity", detail: "Paired with the SOL raised in the Meteora pool at graduation. The liquidity is locked forever." },
  { pct: "5%", amount: "50,000,000", name: "Unlocks at graduation", detail: "20,000,000 for airdrop and early rewards, held by the Ferzan multisig. 30,000,000 goes into the team lock below." },
  { pct: "60%", amount: "600,000,000", name: "Locked, 24 months", detail: "Meteora releases 25,000,000 a month to the multisig. Nobody can speed it up." },
] as const;

const TEAM = [
  { name: "Dre", address: "6EFzuX77oyphe4cg5zFGMHPV6du9fj1LJjDucZNVFpn7" },
  { name: "Mike", address: "DFC1VDY22xhS8PjFzEisRBXB4SDfQbV2N7Rgzp49Trhk" },
  { name: "Don", address: "B3JNNu3SRSPpCeGVCK5SAas5Ev5x31uJ9RTMudSArSY" },
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
  if (left === 0) return <p className="mt-4 text-lg font-extrabold text-cyan">{tr("FERZAN is live. Find it on the Launches board.")}</p>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <div className="mt-5 grid max-w-md grid-cols-4 gap-2 text-center" aria-label={tr("Time until FERZAN launches")}>
      {[
        [d, "days"],
        [h, "hours"],
        [m, "min"],
        [s, "sec"],
      ].map(([v, label]) => (
        <div key={label} className="ticket px-2 py-3">
          <p className="text-2xl font-extrabold tabular-nums">{String(v).padStart(2, "0")}</p>
          <p className="text-xs text-muted">{tr(label)}</p>
        </div>
      ))}
    </div>
  );
}

function Address({ label, value }: { label: string; value: string }) {
  return (
    <li className="py-3">
      <p className="text-sm text-muted">{tr(label)}</p>
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
        <img src="/brand/ferzan-token.jpg" alt={tr("FERZAN token")} className="h-32 w-32 shrink-0 rounded-full" />
        <div>
          <p className="text-sm font-medium text-cyan">{tr("Solana · Meteora bonding curve")}</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">{tr("FERZAN")}</h1>
          <p className="mt-2 text-muted">{tr("Launches Thursday, October 15 at 4:00 PM Eastern.")}</p>
          <Countdown />
        </div>
      </section>

      <section>
        <p className="max-w-2xl text-muted">
          {tr("FERZAN powers the Ferzan ecosystem: the Ferzan Factory launchpad and the Ferzan Telegram bots for launching, trading and tracking coins on Solana, Base, BNB, Ethereum and Robinhood Chain. Every day, part of Ferzan's platform fees buys FERZAN on the open market and burns it.")}
        </p>
        <p className="mt-3 text-sm text-muted">
          {tr("The contract address is published here, on @Ferzan_Launches and on X the moment it goes live. Anything posted before that is not FERZAN.")}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">{tr("Supply: 1,000,000,000")}</h2>
        <p className="mt-1 text-sm text-muted">{tr("Fixed. The mint authority is removed at launch, so no more can ever be made.")}</p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {SUPPLY.map((row) => (
            <li key={row.name} className="grid gap-1 py-3 sm:grid-cols-[6rem_1fr] sm:gap-4">
              <p className="text-2xl font-extrabold tabular-nums">{row.pct}</p>
              <div>
                <p className="font-semibold">
                  {row.name} <span className="text-sm font-normal text-muted">· {row.amount}</span>
                </p>
                <p className="text-sm text-muted">{tr(row.detail)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          {tr("The locked tokens only start unlocking after FERZAN graduates. They sit in a 2-of-3 Squads multisig, so no single key can move them.")}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">{tr("Team allocation: 3%, locked")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr("30,000,000 FERZAN (3% of supply) is split equally between three team wallets, 10,000,000 each. Nothing can be sold or moved for 12 months. After that it is paid out in 12 equal monthly releases, about 833,333 per wallet a month, matching the last 12 of the multisig's 24 monthly unlocks.")}
        </p>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {TEAM.map((m) => (
            <Address key={m.name} label={`${m.name} · 10,000,000 FERZAN`} value={m.address} />
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          {tr("The team tokens come out of the 5% that unlocks at graduation, not out of the public curve. Right after graduation the multisig deposits them into an on-chain lock with the 12-month cliff. The link to that lock is published here and on X the moment it exists, so anyone can check it. Until then these addresses are the intended recipients, not a completed lock.")}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">{tr("Launch protection")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr("The trading fee starts at 99% and falls every 30 seconds to the normal 1% at 30 minutes, so sniping the open costs almost everything. A volatility fee also rises whenever the price swings hard.")}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {FEE_STEPS.map(([min, fee]) => (
            <div key={min} className="ticket px-2 py-2 text-center">
              <p className="font-extrabold tabular-nums">{fee}</p>
              <p className="text-xs text-muted">{tr("min")}{" "}{min}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">{tr("Graduation")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr("The curve opens at about 50 SOL market cap and graduates at about 800 SOL. About 56 SOL then moves into a Meteora pool with the liquidity locked forever.")}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">{tr("Fees and the burn")}</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          <li>{tr("1% on every FERZAN trade after the first 30 minutes: half to the Ferzan multisig, half to Ferzan.")}</li>
          <li>
            {tr("Every day a program on Ferzan's server claims Ferzan's share of the fees from every Solana launch, spends 30% of it buying FERZAN, and burns what it bought. Each day's claim, buy and burn is posted with the transaction links.")}
          </li>
          <li>{tr("No transfer tax. No staking promises. Nothing here is a promise of price or profit.")}</li>
        </ul>
        <p className="mt-3 text-sm">
          <a className="font-semibold text-cyan" href="/transparency">
            {tr("See every buyback and burn, with its transactions →")}
          </a>
        </p>
      </section>

      <OnlyOnFerzan />

      <section>
        <h2 className="text-xl font-extrabold">{tr("On-chain addresses")}</h2>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          <Address label={tr("Ferzan multisig (Squads vault)")} value={SQUADS_VAULT} />
          <Address label={tr("FERZAN Meteora config")} value={FLAGSHIP_CONFIG} />
        </ul>
      </section>
    </div>
  );
}
