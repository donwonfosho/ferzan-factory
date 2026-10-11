import { useEffect, useState } from "react";
import { setPollInterval } from "@/lib/factory/poll";
import { Link } from "@tanstack/react-router";
import { LAUNCH_AT_MS } from "@/lib/factory/launch";
import { OnlyOnFerzan } from "./floor-live";
import { usePulse } from "./pulse-live";
import { CopyAddress } from "./copy-address";

import { tr } from "@/lib/i18n";
const SQUADS_VAULT = "2vWqwX72ijo24vgvPQW6yBQh2qXE4jrEd18YDdEbWKLG";
const FLAGSHIP_CONFIG = "8YoqjUBsyfgQv5s7fWR5nyjeMd43rKvMUEexAuYRCvbo";

const SUPPLY = [
  { pct: "28%", amount: "279,991,997", name: "Public curve", detail: "Every one of these is bought on the curve. No presale, no dev buy." },
  { pct: "7%", amount: "69,998,001", name: "Graduation liquidity", detail: "Paired with the SOL raised in the Meteora pool at graduation. The liquidity is locked forever." },
  { pct: "5%", amount: "50,000,000", name: "Unlocks at graduation", detail: "Airdrop and early rewards, held by the Ferzan multisig." },
  { pct: "57%", amount: "570,000,000", name: "Locked, 24 months", detail: "Meteora releases it to the Ferzan multisig over 24 months. Nobody can speed it up." },
  { pct: "3%", amount: "30,000,000", name: "Team lock", detail: "Locked on-chain with Jupiter Lock: nothing for 12 months, then released monthly over the next 12 months." },
] as const;

const DAY_STEPS = [
  { when: "Before 4:00 PM ET", what: "No official FERZAN address exists yet. Anything posted before launch is fake. Guardian deletes unofficial addresses in Ferzan chats." },
  { when: "4:00 PM ET, Friday November 13", what: "The curve opens on Solana. The contract address is posted here, on @Ferzan_Launches and on X at the same moment." },
  { when: "First 30 minutes", what: "The trading fee starts at 99% and falls to 1%, so sniping the open costs almost everything." },
  { when: "When the curve fills", what: "The Meteora pool opens with the liquidity locked forever. The 5% for airdrop and early rewards unlocks to the Ferzan multisig." },
  { when: "Every day after", what: "30% of Ferzan's Solana trading fees buys FERZAN and burns it. Every burn is posted with its transaction." },
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
  useEffect(() => setPollInterval(() => setNow(Date.now()), 1000), []);
  return now;
}

function Countdown() {
  const now = useNow();
  const pulse = usePulse();
  const live = pulse?.ferzan?.live === true;
  const left = Math.max(0, LAUNCH_AT_MS - now);
  if (live) return <p className="mt-4 text-lg font-extrabold text-cyan">{tr("FERZAN is live. Find it on the Launches board.")}</p>;
  if (left === 0) return <p className="mt-4 text-lg font-extrabold text-cyan">{tr("Launching soon")}</p>;
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

function VerifyContract() {
  const pulse = usePulse();
  const token = pulse?.ferzan?.live && pulse.ferzan.token ? pulse.ferzan.token : "";
  return (
    <section className="ticket">
      <h2 className="text-lg font-extrabold">{tr("Verify the contract")}</h2>
      {token ? (
        <div className="mt-3">
          <CopyAddress address={token} label={tr("Copy address")} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{tr("No official FERZAN address exists yet.")}</p>
      )}
      <p className="mt-2 text-sm text-muted">{tr("Only trust the address posted here and in @Ferzan_Launches.")}</p>
    </section>
  );
}

export function FerzanPage() {
  return (
    <div className="space-y-8 lg:space-y-12">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        <div className="space-y-4 lg:sticky lg:top-28">
          <section className="fz-glow fz-border fz-shimmer ticket overflow-hidden p-5 sm:p-7">
            <div className="flex items-center gap-4 sm:gap-5">
              <img src="/brand/ferzan-token.jpg" alt={tr("FERZAN token")} className="h-24 w-24 shrink-0 rounded-full shadow-border sm:h-32 sm:w-32" />
              <div className="min-w-0">
                <p className="fz-eyebrow">{tr("Solana · Meteora bonding curve")}</p>
                <h1 className="mt-1 text-4xl sm:text-5xl">
                  <span className="fz-grad-text">{tr("FERZAN")}</span>
                </h1>
                <p className="mt-2 text-muted">{tr("Launches Friday, November 13 at 4:00 PM Eastern.")}</p>
                <Link to="/how-to-buy" className="mt-3 inline-flex font-semibold text-cyan">
                  {tr("How to buy FERZAN")}
                </Link>
              </div>
            </div>
            <Countdown />
          </section>
          <VerifyContract />

          <section className="ticket fz-card">
            <p className="text-muted">
              {tr("FERZAN powers the Ferzan ecosystem: the Ferzan Factory launchpad and the Ferzan Telegram bots for launching, trading and tracking coins on Solana, Base, BNB, Ethereum and Robinhood Chain. Every day, part of Ferzan's platform fees buys FERZAN on the open market and burns it.")}
            </p>
            <p className="mt-3 text-sm text-muted">
              {tr("The contract address is published here, on @Ferzan_Launches and on X the moment it goes live. Anything posted before that is not FERZAN.")}
            </p>
          </section>
        </div>

        <div className="space-y-4">
          <section className="ticket">
            <h2 className="text-xl font-extrabold">{tr("Launch day, step by step")}</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {DAY_STEPS.map((st) => (
                <li key={st.when} className="ticket">
                  <p className="font-semibold text-cyan">{tr(st.when)}</p>
                  <p className="mt-1 text-muted">{tr(st.what)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="ticket">
            <h2 className="text-xl font-extrabold">{tr("Supply: 1,000,000,000")}</h2>
            <p className="mt-1 text-sm text-muted">{tr("Fixed. The mint authority is removed at launch, so no more can ever be made.")}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {SUPPLY.map((row) => (
                <li key={row.name} className="fz-card rounded-2xl p-4">
                  <p className="text-3xl font-extrabold tabular-nums text-cyan">{row.pct}</p>
                  <p className="mt-1 font-semibold">
                    {tr(row.name)} <span className="text-sm font-normal text-muted">· {row.amount}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">{tr(row.detail)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">{tr("These amounts add up to 999,989,998. The other 10,002 is rounding in the pool.")}</p>
            <p className="mt-4 text-sm text-muted">
              {tr("570,000,000 is locked to the Ferzan multisig. Meteora releases it over 24 months, and nobody can speed that up. Those tokens sit in a 2-of-3 Squads multisig, so no single key can move them. Separately, 30,000,000 is the team lock, locked on-chain with Jupiter Lock. Nothing for 12 months, then released monthly over the next 12 months.")}
            </p>
          </section>

          <section className="ticket">
            <h2 className="text-xl font-extrabold">{tr("Team allocation: 3%, locked")}</h2>
            <p className="mt-1 text-sm text-muted">
              {tr("30,000,000 FERZAN (3% of supply) is locked. Nothing can be sold or moved for 12 months. After that it is paid out in 12 equal monthly releases, matching the last 12 of the multisig's 24 monthly unlocks.")}
            </p>
            <p className="mt-3 text-sm text-muted">
              {tr("This 3% is its own allocation, separate from the 57% Meteora releases to the multisig and from the 5% that unlocks at graduation. It is locked on-chain with Jupiter Lock. The link to that lock is published here and on X the moment it exists, so anyone can check it.")}
            </p>
          </section>

          <section className="ticket">
            <h2 className="text-xl font-extrabold">{tr("Launch protection")}</h2>
            <p className="mt-1 text-sm text-muted">
              {tr("The trading fee starts at 99% and falls every 30 seconds to the normal 1% at 30 minutes, so sniping the open costs almost everything. A volatility fee also rises whenever the price swings hard.")}
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {FEE_STEPS.map(([min, fee]) => (
                <div key={min} className="fz-card rounded-xl px-2 py-2 text-center">
                  <p className="font-extrabold tabular-nums">{fee}</p>
                  <p className="text-xs text-muted">{tr("min")}{" "}{min}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="ticket fz-card">
              <h2 className="text-xl font-extrabold">{tr("Graduation")}</h2>
              <p className="mt-1 text-sm text-muted">
                {tr("The curve opens at about 50 SOL market cap and graduates at about 800 SOL. About 56 SOL then moves into a Meteora pool with the liquidity locked forever.")}
              </p>
            </section>

            <section className="ticket fz-card">
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
          </div>

          <section className="ticket">
            <h2 className="text-xl font-extrabold">{tr("On-chain addresses")}</h2>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              <Address label={tr("Ferzan multisig (Squads vault)")} value={SQUADS_VAULT} />
              <Address label={tr("FERZAN Meteora config")} value={FLAGSHIP_CONFIG} />
            </ul>
          </section>
        </div>
      </div>

      <OnlyOnFerzan />
    </div>
  );
}
