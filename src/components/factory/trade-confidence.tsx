import { useSyncExternalStore } from "react";
import { solanaRelay } from "@/lib/factory/solana";
import { formatSmart } from "@/lib/factory/units";
import { tr } from "@/lib/i18n";

/** Same sentences as /docs. Do not reword them here. */
export const FEE_SITE = "Website curves: 60% treasury, 30% creator, 10% referrer or treasury.";
export const FEE_TG = "Telegram curves: 50% creator, 50% platform.";
export const FEE_TG_REF = "Telegram curves with a referral: 50% creator, 40% platform, 10% referrer.";

export type TradePreviewProps = {
  amountIn?: string;
  amountOut?: string;
  minReceived?: string;
  /** Only pass this when a quote API returned a price impact. Never invent one. */
  priceImpact?: string;
  /** Fee sentence already in English-as-key form. Omitted when the fee is not the 1% split. */
  fee?: string;
  /** Only pass a network fee the wallet or a quote actually computed. */
  networkFee?: string;
  approving?: string;
};

/** What the wallet is about to do. Hidden rows are fields we do not have. */
export function TradePreview(props: TradePreviewProps) {
  const rows = [
    props.amountIn ? [tr("Amount in"), props.amountIn] : null,
    props.amountOut ? [tr("Estimated out"), props.amountOut] : null,
    props.minReceived ? [tr("Minimum received"), props.minReceived] : null,
    props.priceImpact ? [tr("Price impact"), props.priceImpact] : null,
    props.fee ? [tr("Fee"), props.fee === FEE_SITE || props.fee === FEE_TG || props.fee === FEE_TG_REF ? tr(props.fee) : props.fee] : null,
    props.networkFee ? [tr("Network fee"), props.networkFee] : null,
  ].filter((row): row is [string, string] => row !== null);
  if (!rows.length && !props.approving) return null;
  return (
    <div className="space-y-2 rounded-xl bg-bg px-3 py-3 text-sm shadow-border" data-trade-preview>
      {rows.length ? (
        <dl className="space-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {props.approving ? <p className="text-xs text-muted">{props.approving}</p> : null}
    </div>
  );
}

export function minText(out: bigint, bps: number, decimals: number, unit: string): string {
  if (out <= 0n || bps < 0 || bps > 10_000) return "";
  return `${formatSmart((out * BigInt(10_000 - bps)) / 10_000n, decimals)} ${unit}`;
}

export function approveLine(amountIn?: string, amountOut?: string): string {
  if (amountIn && amountOut) return tr("You're swapping {0} for {1}. This site never holds your funds.", amountIn, amountOut);
  if (amountIn) return tr("You're swapping {0}. This site never holds your funds.", amountIn);
  return tr("This site never holds your funds.");
}

export function bridgeApproveLine(amountIn: string, dest: string): string {
  return tr("You're sending {0} to your own wallet on {1}. This site never holds your funds.", amountIn, dest);
}

type TxStatus = "pending" | "confirmed" | "failed";
type TxItem = {
  id: string;
  status: TxStatus;
  label: string;
  explorer?: string;
  finalAmount?: string;
  retry?: () => void;
};

let items: TxItem[] = [];
const subs = new Set<() => void>();
let seq = 0;

function emit() {
  items = items.slice();
  subs.forEach((fn) => fn());
}

export function beginTx(label: string): {
  id: string;
  hash: (explorer: string) => void;
  confirmed: (explorer?: string, finalAmount?: string) => void;
  failed: (retry?: () => void) => void;
  pending: () => void;
} {
  const id = `tx-${++seq}`;
  items = [...items, { id, status: "pending", label }];
  emit();
  const patch = (next: Partial<TxItem>) => {
    items = items.map((item) => (item.id === id ? { ...item, ...next } : item));
    emit();
  };
  return {
    id,
    hash: (explorer) => patch({ explorer, status: "pending" }),
    confirmed: (explorer, finalAmount) => patch({ status: "confirmed", explorer, finalAmount }),
    failed: (retry) => patch({ status: "failed", retry }),
    pending: () => patch({ status: "pending" }),
  };
}

export function dismissTx(id: string) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Solana wallet signatures are not confirmed until the cluster says so. Stays pending if the status call fails. */
export function watchSolana(id: string, signature: string, explorer: string) {
  items = items.map((item) => (item.id === id ? { ...item, explorer, status: "pending" } : item));
  emit();
  let n = 0;
  const timer = window.setInterval(() => {
    n += 1;
    if (n > 40) {
      window.clearInterval(timer);
      return;
    }
    void solanaRelay({ data: { method: "status", signature } })
      .then((row) => {
        const status = row && typeof row === "object" && "status" in row ? (row as { status?: string }).status : "";
        if (status !== "confirmed" && status !== "failed") return;
        window.clearInterval(timer);
        items = items.map((item) => (item.id === id ? { ...item, status } : item));
        emit();
      })
      .catch(() => undefined);
  }, 3000);
}

/** Stays on screen until the visitor dismisses it. */
export function TxDock() {
  const list = useSyncExternalStore(subscribe, () => items, () => []);
  if (!list.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-full max-w-lg space-y-2 px-3 sm:bottom-4" data-tx-dock>
      {list.map((item) => (
        <div key={item.id} className="ticket shadow-border" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">
              {item.label} · {item.status === "pending" ? tr("Pending") : item.status === "confirmed" ? tr("Confirmed") : tr("Failed")}
            </p>
            <button type="button" className="btn-line min-h-11 px-3 text-sm" onClick={() => dismissTx(item.id)}>
              {tr("Dismiss")}
            </button>
          </div>
          {item.finalAmount ? (
            <p className="mt-1 text-sm">
              {tr("Final amount")} {item.finalAmount}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {item.explorer ? (
              <a className="btn-line min-h-11 px-3 text-sm" href={item.explorer} target="_blank" rel="noopener noreferrer">
                {tr("View transaction")}
              </a>
            ) : null}
            {item.status === "failed" && item.retry ? (
              <button type="button" className="btn-cyan min-h-11 px-3 text-sm" onClick={() => item.retry?.()}>
                {tr("Retry")}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
