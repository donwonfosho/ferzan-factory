import { Link, useRouterState } from "@tanstack/react-router";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { useEffect, useState, type ReactNode } from "react";
import { CHAINS, COMMUNITY_URL, X_URL } from "@/lib/factory/catalog";
import { creatorLabel, owns } from "@/lib/factory/engine";
import { useFactory } from "@/lib/factory/store";
import { hydrateSiteWallet } from "@/lib/factory/site-wallet";
import { setPollInterval } from "@/lib/factory/poll";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { WalletBalances } from "./gas-step";
import { LaunchWatch } from "./launch-watch";
import { GraduationBanner, TradeTape, usePulse } from "./pulse-live";
import { LAUNCH_AT_MS, LAUNCH_LABEL } from "@/lib/factory/launch";
import { FeedbackButton, openFeedback } from "./feedback";
import { Analytics } from "./analytics";
import { StatusBanner, StatusLine } from "./status-line";
import { TxDock } from "./trade-confidence";
import { InstallApp } from "./perks";
import { MobileNav } from "./mobile-nav";
import { QuickBuyToast } from "./quick-buy";
import { SearchButton, SearchOverlay } from "./search";
import { WatchSync } from "./watch";
import { FollowSync } from "./follow";
import { tr } from "@/lib/i18n";
import { LangPicker } from "./lang";
import { captureEvmRef, captureRef } from "@/lib/factory/compete";

/** Starts the saved-key address fill once, before the first child reads the wallet. */
let siteWalletStarted = false;
/** Reading pages stay a narrow column; every other page uses the wide container. */
const NARROW_PATHS = ["/docs", "/terms", "/about", "/transparency", "/how-to-buy", "/press", "/changelog", "/verify"];
const LINKS = [
  { to: "/", label: "Floor" },
  { to: "/pulse", label: "Pulse" },
  { to: "/ferzan", label: "FERZAN" },
  { to: "/launch", label: "Launch" },
  { to: "/bridge", label: "Bridge" },
  { to: "/bots", label: "Bots" },
  { to: "/login", label: "Profile" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  if (!siteWalletStarted && typeof window !== "undefined") {
    siteWalletStarted = true;
    void hydrateSiteWallet();
  }
  const path = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const launches = useFactory((s) => s.launches);
  const reset = useFactory((s) => s.reset);
  const wallet = useFactory((s) => s.wallet);
  const profile = useFactory((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [sol, setSol] = useState<string | null>(null);
  const account = useAccountWallets();

  useEffect(() => {
    const siteReady = hydrateSiteWallet();
    captureRef();
    const done = useFactory.persist.rehydrate();
    void Promise.all([siteReady, Promise.resolve(done)]).then(async ([site]) => {
      const current = useFactory.getState().wallet;
      if (site && !current) useFactory.getState().setWallet(site.address);
      if (!site) {
        setSol(null);
        return;
      }
      const { solanaAddress } = await import("@/lib/factory/solana-address");
      setSol(solanaAddress());
    });
  }, []);

  useEffect(() => {
    captureEvmRef();
  }, [href]);

  useEffect(() => {
    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
    if (!dsn) return;
    void import("@/lib/factory/sentry").then((mod) => mod.startBrowserSentry(dsn));
  }, []);

  useEffect(() => {
    labelUnnamedControls();
  }, [path]);

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
      <WatchSync />
      <FollowSync />
      <div className="sticky top-0 z-40">
        <StatusBanner />
        <div className="h-px bg-cyan" />
        <header className="border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3">
          <Link to="/" className="mr-auto flex items-center gap-2">
            <img src="/brand/seal.jpg" alt="" width={512} height={512} className="h-11 w-11 object-contain" />
            <span className="hidden text-base font-semibold text-fg min-[420px]:inline">{tr("Ferzan")}</span>
            <span className="rounded-full bg-cyan/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan">{tr("Beta")}</span>
          </Link>
          <nav className="order-last hidden w-full gap-1 overflow-x-auto sm:order-none sm:flex sm:w-auto">
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
                  {tr(link.label)}
                </Link>
              );
            })}
          </nav>
          <LangPicker />
          <SearchButton />
          <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan hidden sm:inline-flex">
            {tr("Launch")}
          </Link>
          {wallet ? (
            <Link to="/login" className="btn-line">
              {profile?.image ? <img src={profile.image} alt="" className="h-6 w-6 object-cover" /> : null}
              {profile?.name || creatorLabel(wallet)}
            </Link>
          ) : (
            <Link to="/login" className="btn-line">
              {tr("Profile")}
            </Link>
          )}
          <button
            type="button"
            className="btn-line"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {tr("Desk")}
          </button>
        </div>
        {open ? (
          <div className="border-t border-line bg-surface">
            <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4">
              <div>
                <p className="text-sm font-medium text-muted">{tr("Menu")}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Link to="/ferzan" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("FERZAN")}</span>
                    <span className="text-sm text-muted">{tr("FERZAN launches {0}", LAUNCH_LABEL)}</span>
                  </Link>
                  <Link to="/bots" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("Bots")}</span>
                    <span className="text-sm text-muted">{tr("Launch, trade, and track from Telegram")}</span>
                  </Link>
                  <Link to="/terminal" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("Terminal")}</span>
                    <span className="text-sm text-muted">{tr("Trade through your Telegram bot")}</span>
                  </Link>
                  <Link to="/login" hash="portfolio" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("Portfolio")}</span>
                    <span className="text-sm text-muted">{tr("Balances, holdings, and launches")}</span>
                  </Link>
                  <Link to="/login" hash="rewards" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("Rewards")}</span>
                    <span className="text-sm text-muted">{tr("Creator fees and your referrer link")}</span>
                  </Link>
                  <Link to="/compete" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("🏆 Weekly competition")}</span>
                    <span className="text-sm text-muted">{tr("Top traders and top callers this week")}</span>
                  </Link>
                  <Link to="/docs" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("Docs")}</span>
                    <span className="text-sm text-muted">{tr("How a launch, a trade, and graduation work")}</span>
                  </Link>
                  <Link to="/funds" className="rounded-xl bg-bg px-3 py-3 shadow-border" onClick={() => setOpen(false)}>
                    <span className="block font-semibold">{tr("Add funds")}</span>
                    <span className="text-sm text-muted">{tr("Card, Apple Pay, or cash out")}</span>
                  </Link>
                  <a href={COMMUNITY_URL} className="rounded-xl bg-bg px-3 py-3 shadow-border">
                    <span className="block font-semibold">{tr("Telegram")}</span>
                    <span className="text-sm text-muted">{tr("Ferzan chat")}</span>
                  </a>
                  <a href={X_URL} className="rounded-xl bg-bg px-3 py-3 shadow-border">
                    <span className="block font-semibold">X</span>
                    <span className="text-sm text-muted">{tr("@ferzanfactory")}</span>
                  </a>
                </div>
                <p className="mt-4 text-sm font-medium text-muted">{tr("Your cuts")}</p>
                <p className="mt-2 text-sm">
                  {tr("Creator")}{" "}{sumLine(creatorCut)}{" "}{tr("· Referrer")}{" "}{sumLine(referrerCut)}
                </p>
                <Button variant="ghost" className="mt-3" onClick={() => { reset(); setOpen(false); }}>
                  {tr("Reset floor")}
                </Button>
              </div>
              {wallet.startsWith("0x") ? <WalletBalances evm={wallet} sol={account?.authenticated ? account.solAddress : sol} /> : null}
            </div>
          </div>
        ) : null}
        <TradeTape />
        </header>
      </div>
      <LaunchBar />
      <main className={cn("mx-auto px-4 pt-10 pb-28 sm:px-6 sm:py-14", NARROW_PATHS.some((p) => path.startsWith(p)) ? "max-w-5xl" : "max-w-7xl")}>{children}</main>
      <LaunchWatch />
      <GraduationBanner />
      <footer className="mx-auto max-w-7xl px-4 pb-28 text-sm text-muted sm:px-6 sm:pb-10">
        <div className="mb-4">
          <InstallApp compact />
        </div>
        <div className="mb-6">
          <p className="font-semibold text-fg">{tr("Fees")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{tr("Site curves: 1% on every trade. 60% treasury, 30% creator, 10% to a referrer when a buyer names a wallet.")}</li>
            <li>{tr("Telegram curves: 1% on every trade. 50% creator, 50% platform, or 50% creator, 40% platform, 10% referrer when a buyer came from a referral link.")}</li>
          </ul>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold text-fg">{tr("Product")}</p>
            <ul className="mt-2 space-y-1">
              <li><Link to="/" className="text-cyan">{tr("Floor")}</Link></li>
              <li><Link to="/pulse" className="text-cyan">{tr("Pulse")}</Link></li>
              <li><Link to="/creator" className="text-cyan">{tr("Creator")}</Link></li>
              <li><Link to="/launch" search={{ kind: "curve" }} className="text-cyan">{tr("Launch")}</Link></li>
              <li><Link to="/bots" className="text-cyan">{tr("Bots")}</Link></li>
              <li><Link to="/terminal" className="text-cyan">{tr("Terminal")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg">{tr("Community")}</p>
            <ul className="mt-2 space-y-1">
              <li><a className="text-cyan" href={COMMUNITY_URL}>{tr("Chat")}</a></li>
              <li><a className="text-cyan" href="https://t.me/Ferzan_Trade_Ecosystem">{tr("Hub")}</a></li>
              <li><a className="text-cyan" href="https://t.me/Ferzan_Launches">{tr("Launches")}</a></li>
              <li><a className="text-cyan" href={X_URL}>X</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg">{tr("Learn")}</p>
            <ul className="mt-2 space-y-1">
              <li><Link to="/docs" className="text-cyan">{tr("Docs")}</Link></li>
              <li><Link to="/verify" className="text-cyan">{tr("Verify")}</Link></li>
              <li><Link to="/how-to-buy" className="text-cyan">{tr("How to buy FERZAN")}</Link></li>
              <li><Link to="/press" className="text-cyan">{tr("Press")}</Link></li>
              <li><Link to="/changelog" className="text-cyan">{tr("Changelog")}</Link></li>
              <li><Link to="/about" className="text-cyan">{tr("About")}</Link></li>
              <li><Link to="/transparency" className="text-cyan">{tr("Transparency")}</Link></li>
              <li><Link to="/terms" className="text-cyan">{tr("Terms")}</Link></li>
              <li>
                <button type="button" className="text-cyan" onClick={() => openFeedback()}>
                  {tr("Report a bug / Feedback")}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg">{tr("Contact")}</p>
            <p className="mt-2">
              <a className="text-cyan" href="mailto:Ferzantrade@gmail.com">{tr("Ferzantrade@gmail.com")}</a>
            </p>
            <StatusLine />
          </div>
        </div>
      </footer>
      <MobileNav />
      <FeedbackButton />
      <Analytics />
      <SearchOverlay />
      <QuickBuyToast />
      <TxDock />
    </div>
  );
}

function labelUnnamedControls() {
  const nodes = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  for (const node of nodes) {
    if (node.type === "hidden") continue;
    if (node.closest("label")) continue;
    if (node.getAttribute("aria-label") || node.getAttribute("aria-labelledby")) continue;
    if (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) continue;
    const text = node.getAttribute("placeholder") || node.getAttribute("name") || node.getAttribute("aria-describedby");
    if (text) node.setAttribute("aria-label", text);
  }
}

function LaunchCountdown({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setPollInterval(() => setNow(Date.now()), 1000), []);
  const left = Math.max(0, at - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return (
    <>
      <Link to="/ferzan" className="min-w-[12rem] flex-1 font-semibold leading-5 text-fg">
        {left === 0 ? tr("Opening any moment") : tr(`FERZAN launches ${LAUNCH_LABEL}`)}
      </Link>
      <span className="flex shrink-0 items-center gap-3">
        {left === 0 ? null : <span className="tabular-nums font-semibold text-cyan">{d}d {h}h {m}m</span>}
        <Link to="/how-to-buy" className="font-semibold text-cyan">
          {tr("How to buy")}
        </Link>
      </span>
    </>
  );
}

function LaunchBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pulse = usePulse();
  if (path === "/" || pulse?.ferzan?.live) return null;
  const at = pulse?.ferzan?.launchAt ? pulse.ferzan.launchAt * 1000 : LAUNCH_AT_MS;
  return (
    <div className="relative z-30 isolate border-b border-line bg-surface px-4 py-2 text-sm text-fg [transform:translateZ(0)]">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <LaunchCountdown at={at} />
      </div>
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
