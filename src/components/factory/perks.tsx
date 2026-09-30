import { useEffect, useState } from "react";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { getPerks, PERK_DEFAULTS, type Perks } from "@/lib/factory/perks";
import { cn } from "@/lib/cn";

import { tr } from "@/lib/i18n";
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

/** Profile card: what holding FERZAN gets you, and where this account stands. */
export function FerzanPerksCard({ sol: wallet }: { sol: string | null }) {
  const p = usePerks(wallet) ?? PERK_DEFAULTS;
  const rows = [
    { tier: "holder", need: p.holderMin, badge: "🔷 FERZAN holder", perk: tr("Half-price Solana launch fee ({0})", sol(p.launchFeeSol / 2)) },
    { tier: "whale", need: p.whaleMin, badge: "🐋 FERZAN whale", perk: "Free Solana launches" },
  ];
  return (
    <section className="ticket mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-cyan">{tr("FERZAN holder perks")}</p>
        {p.badge ? <span className="chip-on rounded-full px-3 py-1 text-xs font-semibold">{tr(p.badge)}</span> : null}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.tier} className={cn("flex items-start justify-between gap-3", p.tier === r.tier && "text-cyan")}>
            <span>
              <span className="font-semibold">{tr(r.badge)}</span>
              <span className="block text-muted">{tr(r.perk)}{tr(", plus the badge on your coins' creator score and on your Solana buys in Buy Bot alerts.")}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted">{whole(r.need)}+</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        {!p.active
          ? tr("Switches on when FERZAN launches on Thursday, October 15 at 4:00 PM ET. Hold it in the Solana wallet you launch and trade with.")
          : !wallet
            ? tr("Sign in to see your status. It is read from your Solana wallet.")
            : p.tier === "none"
              ? tr("This wallet holds {0} FERZAN. {1} more unlocks the holder perks.", whole(p.balance), whole(Math.max(0, p.holderMin - p.balance)))
              : tr("This wallet holds {0} FERZAN. Your Solana launch fee: {1}.", whole(p.balance), p.yourLaunchFeeSol === 0 ? tr("free") : sol(p.yourLaunchFeeSol))}
      </p>
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
    p.active && p.tier !== "none"
      ? " " + tr("{0}: you pay {1}.", tr(p.badge), p.yourLaunchFeeSol === 0 ? tr("no launch fee") : sol(p.yourLaunchFeeSol))
      : "";
  return (
    <p className="mt-2 text-xs text-muted">
      {tr("Your coin gets a Ferzan address ending in")}{" "}<span className="font-semibold text-fg">{tr("…fzn")}</span>{tr(". Launch fee")}{" "}{sol(p.launchFeeSol)}{tr(": FERZAN holders (")}{whole(p.holderMin)}{tr("+) pay half,")}{" "}{whole(p.whaleMin)}{tr("+ launch free")}{p.active ? "." : tr(" (from Oct 15).")}
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
      <a className="btn-line" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
        {tr("Post on X")}
      </a>
      <a className="btn-line" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
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
