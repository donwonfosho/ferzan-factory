import { Link, useRouterState } from "@tanstack/react-router";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { useEffect, useState, type ReactNode } from "react";
import { CHAINS, COMMUNITY_URL, X_URL } from "@/lib/factory/catalog";
import { creatorLabel, owns } from "@/lib/factory/engine";
import { useFactory } from "@/lib/factory/store";
import { readSiteWallet } from "@/lib/factory/site-wallet";
import { solanaAddress } from "@/lib/factory/solana";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { WalletBalances } from "./gas-step";
import { LaunchWatch } from "./launch-watch";
import { GraduationBanner, TradeTape } from "./pulse-live";
import { InstallApp } from "./perks";
import { MobileNav } from "./mobile-nav";
import { QuickBuyToast } from "./quick-buy";
import { SearchButton, SearchOverlay } from "./search";

const LINKS = [
  { to: "/", label: "Floor" },
  { to: "/pulse", label: "Pulse" },
  { to: "/ferzan", label: "FERZAN" },
  { to: "/launch", label: "Launch" },
  { to: "/bots", label: "Bots" },
  { to: "/login", label: "Profile" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const launches = useFactory((s) => s.launches);
  const reset = useFactory((s) => s.reset);
  const wallet = useFactory((s) => s.wallet);
  const profile = useFactory((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [sol, setSol] = useState<string | null>(null);
  const account = useAccountWallets();

  useEffect(() => {
    const done = useFactory.persist.rehydrate();
    void Promise.resolve(done).then(() => {
      const site = readSiteWallet();
      const current = useFactory.getState().wallet;
      if (site && !current) useFactory.getState().setWallet(site.address);
      setSol(solanaAddress());
    });
  }, []);

  const creatorCut = launches
    .filter((item) => item.kind === "primary" && owns(item.creator, wallet))
    .reduce<Record<string, bigint>>((acc, item) => {
      acc[item.chain] = (acc[item.chain] ?? 0n) + BigInt(item.feeCreator);
      return acc;
    }, {});
  const referrerCut = launches
    .filter((item) => item.kind === "attached" && owns(item.creator, wallet))
    .reduce<Record<string, bigint>>((acc, item) => {
      acc[item.chain] = (acc[item.chain] ?? 0n) + BigInt(item.feeReferrer);
      return acc;
    }, {});

  return (
    <div className="min-h-screen">
      <div className="h-px bg-cyan" />
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="mr-auto flex items-center gap-2">
            <img src="/brand/seal.jpg" alt="" className="h-10 w-10 rounded-full object-cover" />
            <span className="text-base font-semibold text-fg">Ferzan</span>
          </Link>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {LINKS.filter((link) => wallet || link.to !== "/login").map((link) => {
              const on = link.to === "/" ? path === "/" : path.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium",
                    on ? "bg-cyan/15 text-cyan" : "text-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <SearchButton />
          <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan hidden sm:inline-flex">
            Launch
          </Link>
          {wallet ? (
            <Link to="/login" className="btn-line">
              {profile?.image ? <img src={profile.image} alt="" className="h-6 w-6 object-cover" /> : null}
              {profile?.name || creatorLabel(wallet)}
            </Link>
          ) : (
            <Link to="/login" className="btn-line">
              Profile
            </Link>
          )}
          <button
            type="button"
            className="btn-line"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Desk
          </button>
        </div>
        {open ? (
          <div className="border-t border-line bg-surface">
            <div className="mx-auto grid max-w-5xl gap-4 px-4 py-4">
              <div>
                <p className="text-sm font-medium text-muted">Menu</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Link to="/login" hash="portfolio" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">Portfolio</span>
                    <span className="text-sm text-muted">Balances, holdings, and launches</span>
                  </Link>
                  <Link to="/login" hash="rewards" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">Rewards</span>
                    <span className="text-sm text-muted">Creator fees and your referrer link</span>
                  </Link>
                  <Link to="/docs" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">Docs</span>
                    <span className="text-sm text-muted">How a launch, a trade, and graduation work</span>
                  </Link>
                  <a href={COMMUNITY_URL} className="rounded-xl bg-bg px-3 py-3 shadow-border">
                    <span className="block font-semibold">Telegram</span>
                    <span className="text-sm text-muted">Ferzan chat</span>
                  </a>
                  <a href={X_URL} className="rounded-xl bg-bg px-3 py-3 shadow-border">
                    <span className="block font-semibold">X</span>
                    <span className="text-sm text-muted">@ferzaneco</span>
                  </a>
                </div>
                <p className="mt-4 text-sm font-medium text-muted">Your cuts</p>
                <p className="mt-2 text-sm">
                  Creator {sumLine(creatorCut)} · Referrer {sumLine(referrerCut)}
                </p>
                <Button variant="ghost" className="mt-3" onClick={() => { reset(); setOpen(false); }}>
                  Reset floor
                </Button>
              </div>
              {wallet.startsWith("0x") ? <WalletBalances evm={wallet} sol={account?.authenticated ? account.solAddress : sol} /> : null}
            </div>
          </div>
        ) : null}
        <TradeTape />
      </header>
      <main className={cn("mx-auto px-4 pt-10 pb-12 sm:px-6 sm:py-14", path.startsWith("/pulse") ? "max-w-7xl" : "max-w-5xl")}>{children}</main>
      <LaunchWatch />
      <GraduationBanner />
      <footer className="mx-auto max-w-5xl px-4 pb-28 text-sm text-muted sm:pb-10">
        <div className="mb-4">
          <InstallApp compact />
        </div>
        <p>
          Site curves: 1% on every trade. 60% treasury, 30% creator, 10% to a referrer when a buyer names a wallet. After graduation the creator keeps 30% of the pool.
          Telegram curves: 1% on every trade. 50% creator, 50% platform, or 50% creator, 40% platform, 10% referrer when a buyer came from a referral link.
        </p>
        <p className="mt-2">
          <a className="text-cyan" href={COMMUNITY_URL}>
            Ferzan Chat
          </a>
          {" · "}
          <a className="text-cyan" href="https://t.me/Ferzan_Trade_Ecosystem">
            Hub
          </a>
          {" · "}
          <a className="text-cyan" href="https://t.me/Ferzan_Launches">
            Launches
          </a>
          {" · "}
          <Link to="/leaderboard" className="text-cyan">
            Leaderboard
          </Link>
          {" · "}
          <Link to="/docs" className="text-cyan">
            Docs
          </Link>
          {" · "}
          <Link to="/about" className="text-cyan">
            About
          </Link>
          {" · "}
          <Link to="/terms" className="text-cyan">
            Terms
          </Link>
          {" · "}
          <a className="text-cyan" href={X_URL}>
            X
          </a>
        </p>
        <p className="mt-2">
          Contact:{" "}
          <a className="text-cyan" href="mailto:Ferzantrade@gmail.com">
            Ferzantrade@gmail.com
          </a>
        </p>
      </footer>
      <MobileNav />
      <SearchOverlay />
      <QuickBuyToast />
    </div>
  );
}

function sumLine(map: Record<string, bigint>) {
  const parts = Object.entries(map).filter(([, v]) => v > 0n);
  if (!parts.length) return "0";
  return parts
    .map(([chain, value]) => {
      const meta = CHAINS[chain as ChainId];
      return `${formatSmart(value, meta.nativeDecimals)} ${meta.native}`;
    })
    .join(" · ");
}
