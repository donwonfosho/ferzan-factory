import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { getPerks, PERK_DEFAULTS, type Perks } from "@/lib/factory/perks";
import { cn } from "@/lib/cn";

import { track } from "@/lib/factory/analytics";
import { tr } from "@/lib/i18n";
import { usePortfolio } from "./portfolio";
import { compactUsd } from "./market-line";
const whole = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : n.toFixed(0));
const sol = (n: number) => `${+n.toFixed(4)} SOL`;

function usePerks(wallet: string | null | undefined): Perks | null {
  const [p, setP] = useState<Perks | null>(null);
  useEffect(() => {
    let stop = false;
    getPerks({ data: { wallet: wallet || "" } })
      .then((r) => !stop && setP(r))
      .catch(() => !stop && setP(PERK_DEFAULTS));
    return () => {
      stop = true;
    };
  }, [wallet]);
  return p;
}

/** Profile card: current FERZAN tier, the next one, and what each tier gives. Numbers come from the perks API. */
export function FerzanPerksCard({ sol: wallet }: { sol: string | null }) {
  const p = usePerks(wallet) ?? PERK_DEFAULTS;
  const next = p.tiers.find((row) => row.tier === p.nextTier);
  const more = p.nextMin > p.balance ? p.nextMin - p.balance : 0;
  return (
    <section className="ticket">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-cyan">{tr("FERZAN holder tier")}</p>
        {p.active && p.badge ? <span className="chip-on rounded-full px-3 py-1 text-xs font-semibold">{tr(p.badge)}</span> : null}
      </div>
      {!p.active ? <p className="mt-2 text-sm text-muted">{tr("Opens at launch · Fri Nov 13, 4:00 PM ET")}</p> : null}
      {p.active && !wallet ? <p className="mt-2 text-sm text-muted">{tr("Sign in to see your status. It is read from your Solana wallet.")}</p> : null}
      {p.active && wallet && p.balance <= 0 ? (
        <p className="mt-2 text-sm text-muted">
          {tr("This wallet holds none.")}{" "}
          <Link to="/how-to-buy" className="font-semibold text-cyan">
            {tr("How to buy FERZAN")}
          </Link>
        </p>
      ) : null}
      {p.active && wallet && p.balance > 0 ? (
        <p className="mt-2 text-sm">
          <span className="text-muted">{tr("Current tier")}: </span>
          {p.badge ? tr(p.badge) : tr("No FERZAN tier yet")}
          {next && more > 0 ? (
            <>
              {" · "}
              <span className="text-muted">{tr("Next tier")}: </span>
              {tr(next.badge)}
              {" · "}
              {tr("{0} more FERZAN", whole(more))}
            </>
          ) : p.badge ? (
            <>
              {" · "}
              {tr("Top tier")}
            </>
          ) : null}
        </p>
      ) : null}
      <ul className="mt-3 space-y-2 text-sm">
        {p.tiers.map((row) => (
          <li key={row.tier} className={cn("flex items-start justify-between gap-3", p.active && p.tierName === row.tier && "text-cyan")}>
            <span>
              <span className="font-semibold">{tr(row.badge)}</span>
              <span className="block text-muted">{tierGives(row.launchFeeOffPct, p.launchFeeSol)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted">{whole(row.min)}+</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function tierGives(offPct: number, launchFeeSol: number): string {
  const badge = tr("Badge on your coins' creator score and on your Solana buys in Buy Bot alerts.");
  if (launchFeeSol <= 0 || offPct <= 0) return badge;
  if (offPct >= 100) return tr("Free Solana launches. {0}", badge);
  if (offPct === 50) return tr("Half-price Solana launch fee ({0}). {1}", sol(launchFeeSol / 2), badge);
  return tr("Solana launch fee {0}% off. {1}", offPct, badge);
}

/** The signed-in wallet's referral link. EVM only: a Solana address cannot be paid by these buys. */
export function ReferralCard({ evm, sol: solWallet }: { evm: string | null; sol: string | null }) {
  const { data, failed } = usePortfolio(evm, solWallet);
  const [copied, setCopied] = useState(false);
  if (!evm && !solWallet) {
    return (
      <section className="ticket">
        <p className="text-sm font-medium text-cyan">{tr("Your referral link")}</p>
        <p className="mt-2 text-sm text-muted">{tr("Sign in to get your referral link.")}</p>
      </section>
    );
  }
  if (!evm || !/^0x[0-9a-fA-F]{40}$/.test(evm)) {
    return (
      <section className="ticket">
        <p className="text-sm font-medium text-cyan">{tr("Your referral link")}</p>
        <p className="mt-2 text-sm text-muted">{tr("Referral links are for EVM coins; use your Telegram referral link for Telegram coins")}</p>
      </section>
    );
  }
  const url = `https://ferzan-factory.com/?ref=${evm.toLowerCase()}`;
  const earned = !failed && data && data.referralUsd > 0 ? data.referralUsd : 0;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return;
      } catch {
        return;
      }
    }
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  }
  return (
    <section className="ticket">
      <p className="text-sm font-medium text-cyan">{tr("Your referral link")}</p>
      <p className="mt-2 break-all text-sm">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-line" onClick={() => void copy()}>
          {copied ? tr("Link copied") : tr("Copy")}
        </button>
        <button type="button" className="btn-line" onClick={() => void share()}>
          {tr("Share")}
        </button>
      </div>
      {earned > 0 ? <p className="mt-3 text-sm">{tr("{0} from referrals", compactUsd(earned))}</p> : null}
      <p className="mt-3 text-sm text-muted">{tr("Website curves: 60% treasury, 30% creator, 10% referrer or treasury.")}</p>
      <p className="mt-1 text-sm text-muted">{tr("Telegram curves with a referral: 50% creator, 40% platform, 10% referrer.")}</p>
    </section>
  );
}

/** One line under the Solana option on the launch form. */
export function LaunchPerksNote() {
  const account = useAccountWallets();
  const wallet = account?.authenticated ? account.solAddress : null;
  const p = usePerks(wallet);
  if (!p) return null;
  const mine =
    p.active && p.tierName !== "none" && p.badge
      ? " " + tr("{0}: you pay {1}.", tr(p.badge), p.yourLaunchFeeSol === 0 ? tr("no launch fee") : sol(p.yourLaunchFeeSol))
      : "";
  return (
    <p className="mt-2 text-xs text-muted">
      {tr("Your coin gets a Ferzan address ending in")}{" "}<span className="font-semibold text-fg">{tr("…fzn")}</span>
      {p.launchFeeSol > 0 ? (
        <>
          {tr(". Launch fee")}{" "}{sol(p.launchFeeSol)}{tr(": FERZAN holders (")}{whole(p.holderMin)}{tr("+) pay half,")}{" "}{whole(p.whaleMin)}{tr("+ launch free")}{p.active ? "." : tr(" (from Nov 13).")}
        </>
      ) : (
        "."
      )}
      {mine ? <span className="text-cyan">{mine}</span> : null}
    </p>
  );
}

/** Share a coin: link previews show its live card. */
export function ShareCoin({ chain, token, symbol }: { chain: string; token: string; symbol: string }) {
  const [done, setDone] = useState("");
  const account = useAccountWallets();
  if (!/^[a-z]{2,12}$/.test(chain) || !/^[0-9A-Za-z_-]{20,70}$/.test(token)) return null;
  const me = !account?.authenticated ? "" : chain === "solana" || chain === "ton" ? (account.solAddress ?? "") : chain === "tron" ? "" : (account.evmAddress ?? "");
  const url = `https://launch.ferzaneco.com/api/share/${chain}/${token}${me ? `?r=${encodeURIComponent(me)}` : ""}`;
  const text = symbol ? `$${symbol} on Ferzan` : "On Ferzan";
  async function copy() {
    track("share_clicked");
    try {
      await navigator.clipboard.writeText(url);
      setDone(tr("Link copied"));
    } catch {
      setDone(url);
    }
    window.setTimeout(() => setDone(""), 2500);
  }
  return (
    <div className="ticket flex flex-wrap items-center gap-2">
      <p className="mr-auto text-sm font-medium text-muted">
        {tr("Share")}
        {me ? <span className="block text-xs font-normal">{tr("Buys through your link count for you on the callers board.")}</span> : null}
      </p>
      <a className="btn-line" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share_clicked")}>
        {tr("Post on X")}
      </a>
      <a className="btn-line" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share_clicked")}>
        {tr("Telegram")}
      </a>
      <button type="button" className="btn-line" onClick={() => void copy()}>
        {tr(done) || tr("Copy link")}
      </button>
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const waiting = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    waiting.forEach((fn) => fn());
  });
}

/** Put Ferzan on the home screen: the browser's install prompt where there is one, the iPhone steps elsewhere. */
export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<"hidden" | "prompt" | "ios" | "manual">("hidden");
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const pick = () => setState(deferred ? "prompt" : ios ? "ios" : "manual");
    pick();
    waiting.add(pick);
    return () => {
      waiting.delete(pick);
    };
  }, []);
  if (state === "hidden") return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    setState("manual");
  }
  const iosHref = `${window.location.pathname}?install=1&platform=ios`;
  const button =
    state === "prompt" ? (
      <button type="button" className="btn-cyan" onClick={() => void install()}>
        {tr("Install the app")}
      </button>
    ) : state === "ios" ? (
      <a className="btn-cyan inline-flex" href={iosHref}>
        {tr("Add to Home Screen")}
      </a>
    ) : null;
  if (compact) return button ?? null;
  return (
    <section className="ticket mt-4">
      <p className="text-sm font-medium text-cyan">{tr("Ferzan on your phone")}</p>
      <p className="mt-2 text-sm text-muted">
        {state === "manual"
          ? tr("Open your browser menu and choose Install app or Add to Home Screen. Ferzan then opens full screen like an app, straight to the Floor.")
          : tr("One tap puts Ferzan on your home screen. It opens full screen like an app, straight to the Floor.")}
      </p>
      {button ? <div className="mt-3">{button}</div> : null}
    </section>
  );
}
