import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/cn";

const BUCKETS = [
  { name: "Community + liquidity", pct: "35%", lock: "LP locked 12–24 months", why: "The chart has to exist." },
  { name: "Staking / fee treasury", pct: "20%", lock: "Only from real fees, slow emit cap", why: "This is the product." },
  { name: "Ecosystem / dev tools", pct: "15%", lock: "Multisig, 24-month vest", why: "Launch, trending, and buy-bot credits." },
  { name: "Team", pct: "15%", lock: "6-month cliff, 24-month vest", why: "Liquid at launch and nobody trusts it." },
  { name: "Treasury / ops", pct: "10%", lock: "Multisig", why: "Servers, RPCs, audits." },
  { name: "Airdrop / referrals", pct: "5%", lock: "Earned, not dumped", why: "People who actually traded or launched." },
] as const;

const USES = [
  { title: "Trade Desk", detail: "A slice of swap fees the desk already takes." },
  { title: "Launch", detail: "A slice of launch fees." },
  { title: "Trade rebate", detail: "High-volume desks pay a smaller cut. Tiers, not a coupon code." },
  { title: "Trending and raids", detail: "Boost inventory is paid in FERZAN, not only in SOL." },
  { title: "Referrals", detail: "A boost when you bring a desk or a dev who actually launches." },
] as const;

const LOCKS = [
  { id: "0", label: "0 days", detail: "Base share of the weekly pot. You can exit." },
  { id: "30", label: "30 days", detail: "A larger share of the same pot. Not a higher rate." },
  { id: "90", label: "90 days", detail: "The largest share of the same pot. Still the same fees." },
] as const;

const ORDER = [
  "Mint FERZAN on Solana through the Launch Bot. Plain SPL. The curve can wait.",
  "LP with treasury funds. Lock the LP. Post the lock.",
  "Revoke mint and freeze. Publish those transactions.",
  "Wire the fee router: Trade, Launch, and paid Trending into the weekly split.",
  "Publish the staking contract and audit it.",
  "Only then does this page take a stake.",
] as const;

export function FerzanPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section>
        <p className="text-sm font-medium text-cyan">Desk token · Solana</p>
        <h1 className="mt-2 text-4xl sm:text-5xl">FERZAN</h1>
        <p className="mt-3 max-w-xl text-muted">
          Access and a fee claim on the tools. Holders get a slice of what Trade, Launch, and paid Trending already collect. If a feature does not need the coin, it does not get one.
        </p>
        <p className="mt-3 max-w-xl text-sm text-muted">
          One ticker, FERZAN, on the site, in the bots, and on X. Solana first. Base and Ethereum wait so the pool is not split on day one.
        </p>
      </section>

      <FerzanHome />

      <section>
        <h2 className="text-xl font-extrabold">Supply</h2>
        <p className="mt-2 text-sm text-muted">The desk plan. Nothing here is minted yet, and nothing is liquid.</p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {BUCKETS.map((row) => (
            <li key={row.name} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
              <p className="text-2xl font-extrabold tabular-nums">{row.pct}</p>
              <div>
                <p className="font-semibold">{row.name}</p>
                <p className="text-sm text-muted">{row.lock}. {row.why}</p>
              </div>
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-2 text-sm text-muted">
          <li>No tax on every transfer. The cut stays inside the swap.</li>
          <li>No hidden mint. Freeze and mint authority get revoked after the LP and the staking contract are set. Those transactions get published.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Before this coin means anything</h2>
        <ol className="mt-3 space-y-3">
          {ORDER.map((step, index) => (
            <li key={step} className="ticket">
              <p className="text-sm font-medium text-cyan">0{index + 1} · Not live</p>
              <p className="mt-1 text-sm">{step}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">
          Until the fee router is live, this page does not sell fee sharing. A coin that does not sit on those fees is just another ticker.
        </p>
      </section>
    </div>
  );
}

export function FerzanHome({ home = false }: { home?: boolean }) {
  return (
    <section className="space-y-8">
      {home ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-cyan">Desk token · Solana</p>
            <h2 className="mt-2 text-3xl">FERZAN</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Not another coin on the floor. Holders claim fees the tools already take, and spend the coin on Factory credits.
            </p>
          </div>
          <Link to="/ferzan" className="btn-line">
            Full token
          </Link>
        </div>
      ) : null}
      <div>
        <h2 className="text-xl font-extrabold">What it is for</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {USES.map((item) => (
            <li key={item.title} className="ticket">
              <p className="font-extrabold">{item.title}</p>
              <p className="mt-1 text-sm text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">Fee split</h2>
          <p className="mt-2 text-sm text-muted">
            Of every fee Ferzan actually collects — trade cut, launch fee, paid trending. Not a transfer tax.
          </p>
          <div className="mt-4 space-y-3">
            <Split label="Stakers" pct={50} note="Pro-rata claim. SOL, USDC, or ETH that arrived that week." />
            <Split label="Treasury" pct={30} note="RPC, audits, payouts." />
            <Split label="Buyback" pct={20} note="Buy FERZAN on the open market. Half burned, half to the staking pool." />
          </div>
          <div className="ticket mt-4">
            <p className="text-sm font-medium text-cyan">Last week</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">—</p>
            <p className="mt-1 text-sm text-muted">
              Fees collected ÷ staked supply. The router is not wired, so there is nothing to claim and no rate to quote.
            </p>
          </div>
        </div>
        <StakeCard />
      </div>
    </section>
  );
}

function StakeCard() {
  const [lock, setLock] = useState<(typeof LOCKS)[number]["id"]>("0");
  const picked = LOCKS.find((row) => row.id === lock) ?? LOCKS[0];
  return (
    <div>
      <p className="text-sm font-medium text-cyan">Staking preview</p>
      <h2 className="mt-2 text-xl font-extrabold">One pool. Not a deposit to us.</h2>
      <p className="mt-2 text-sm text-muted">
        After the contract is published and audited, you stake FERZAN from your wallet into that contract. This site never holds the tokens.
      </p>
      <form
        className="ticket mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <p className="text-sm font-medium text-muted">Not taking deposits</p>
        <div className="grid gap-2">
          {LOCKS.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={lock === row.id}
              onClick={() => setLock(row.id)}
              className={cn(
                "min-h-11 px-3 py-2 text-left",
                lock === row.id ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border",
              )}
            >
              <span className="font-extrabold">{row.label}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{picked.detail}</p>
        <button type="submit" className="btn-line w-full disabled:opacity-40" disabled>
          No mainnet deposits
        </button>
        <p className="text-xs text-muted">
          One pool. No farm. No rewards printed in new FERZAN. Closed until the audit and the fee router.
        </p>
      </form>
    </div>
  );
}

function Split({ label, pct, note }: { label: string; pct: number; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{label}</p>
        <p className="tabular-nums">{pct}%</p>
      </div>
      <div className="mt-1 h-2 bg-surface-2">
        <div className="h-full bg-cyan" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </div>
  );
}
