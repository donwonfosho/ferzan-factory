import { useState, useSyncExternalStore, type MouseEvent } from "react";
import { quickBuy, quickTarget, setQuickAmount, UNIT_OF, useQuickAmounts, validAmount, type QuickUnit } from "@/lib/factory/quick-buy";
import { WalletNeeded } from "@/lib/factory/wallet-bridge";
import { explorerTx, type EvmChainId } from "@/lib/factory/deploy";
import { solanaExplorerTx } from "@/lib/factory/solana";
import { cn } from "@/lib/cn";

import { tr } from "@/lib/i18n";
/* ---- one toast for all quick buys ---- */
type Toast = { id: number; symbol: string; msg: string; tone: "busy" | "ok" | "err"; href: string };
let toast: Toast | null = null;
let seq = 0;
const tsubs = new Set<() => void>();
function setToast(t: Toast | null) {
  toast = t;
  tsubs.forEach((fn) => fn());
}
let busy = false;

export function QuickBuyToast() {
  const t = useSyncExternalStore(
    (fn) => {
      tsubs.add(fn);
      return () => tsubs.delete(fn);
    },
    () => toast,
    () => null,
  );
  if (!t) return null;
  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm shadow-border-hover",
        "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6",
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.tone === "ok" ? "bg-cyan" : t.tone === "err" ? "bg-sell" : "live-dot")} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">${t.symbol}</span> <span className={t.tone === "err" ? "text-sell" : "text-muted"}>{t.msg}</span>
      </span>
      {t.href ? (
        <a className="shrink-0 text-cyan" href={t.href} target="_blank" rel="noopener noreferrer">
          {tr("View")}
        </a>
      ) : null}
      <button type="button" className="shrink-0 px-1 text-muted" aria-label={tr("Close")} onClick={() => setToast(null)}>
        ✕
      </button>
    </div>
  );
}

/** "⚡ 0.1 SOL" on a board card. Renders nothing for coins that can't be bought on this site. */
export function QuickBuyButton({
  coin,
  className,
}: {
  coin: { chain: string; token: string; url: string; graduated: boolean; symbol: string };
  className?: string;
}) {
  const amounts = useQuickAmounts();
  const target = quickTarget(coin);
  const unit = UNIT_OF[coin.chain];
  if (!target || !unit) return null;
  const amount = amounts[unit];

  async function go(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!target || busy) return;
    busy = true;
    const id = ++seq;
    const show = (msg: string, tone: Toast["tone"] = "busy", href = "") => setToast({ id, symbol: coin.symbol, msg, tone, href });
    try {
      show(tr("Buying {0} {1}…", amount, unit));
      const tx = await quickBuy(target, amount, (m) => show(m));
      const href = target.chain === "solana" ? solanaExplorerTx(tx) : explorerTx(target.chain as EvmChainId, tx);
      show(tr("Bought with {0} {1}.", amount, unit), "ok", href);
      window.setTimeout(() => toast?.id === id && setToast(null), 8000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The buy did not go through.";
      show(err instanceof WalletNeeded ? tr(msg) : /user (rejected|denied)|rejected the request|4001/i.test(msg) ? tr("You cancelled in the wallet.") : msg.split("\n")[0], "err");
    } finally {
      busy = false;
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void go(e)}
      className={cn("inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-cyan/15 px-2.5 text-xs font-bold text-cyan hover:bg-cyan hover:text-cyan-ink", className)}
      aria-label={tr("Quick buy {0} with {1} {2}", coin.symbol, amount, unit)}
    >
      ⚡ {amount} {unit}
    </button>
  );
}

/** Set the quick-buy amount for each coin (saved in this browser). */
export function QuickBuyBar() {
  const amounts = useQuickAmounts();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<QuickUnit, string>>(amounts);
  const units = Object.keys(amounts) as QuickUnit[];
  return (
    <div className="mt-3 text-xs">
      <button type="button" className="text-muted hover:text-fg" onClick={() => (setDraft(amounts), setOpen(!open))} aria-expanded={open}>
        {tr("⚡ Quick buy:")}{" "}{units.map((u) => `${amounts[u]} ${u}`).join(" · ")} <span className="text-cyan">{open ? tr("Done") : tr("Change")}</span>
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {units.map((u) => (
            <label key={u} className="flex items-center gap-2 rounded-lg bg-bg px-2 shadow-border">
              <input
                value={draft[u]}
                inputMode="decimal"
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft({ ...draft, [u]: v });
                  if (validAmount(u, v)) setQuickAmount(u, v);
                }}
                className={cn("min-h-9 w-full bg-transparent tabular-nums outline-none", !validAmount(u, draft[u]) && "text-sell")}
                aria-label={tr("Quick buy amount in {0}", u)}
              />
              <span className="text-muted">{u}</span>
            </label>
          ))}
          <p className="col-span-2 text-muted sm:col-span-4">{tr("One tap on ⚡ buys this much. Your wallet still asks you to approve each buy. Slippage 15%.")}</p>
        </div>
      ) : null}
    </div>
  );
}
