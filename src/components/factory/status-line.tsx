import { useEffect, useState, useSyncExternalStore } from "react";
import { STATUS_BANNER_TEXT } from "@/lib/factory/beta";
import { tr } from "@/lib/i18n";

type Status = "normal" | "degraded" | "down" | "unknown";

const LABEL: Record<Status, string> = {
  normal: "Systems normal",
  degraded: "Degraded",
  down: "Down",
  unknown: "Status unknown",
};

let current: Status = "unknown";
const subs = new Set<() => void>();
let timer: number | null = null;

async function pull() {
  let next: Status = "unknown";
  try {
    const res = await fetch("/api/relay-status", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const body = (await res.json()) as { status?: unknown };
      if (body.status === "normal" || body.status === "degraded" || body.status === "down") next = body.status;
    }
  } catch {
    next = "unknown";
  }
  current = next;
  subs.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subs.add(fn);
  if (timer === null && typeof window !== "undefined") {
    void pull();
    timer = window.setInterval(() => void pull(), 60_000);
  }
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useSiteStatus(): Status {
  return useSyncExternalStore(subscribe, () => current, () => "unknown");
}

/** Footer line. Unreachable or unrecognized payload is "Status unknown", never "normal". */
export function StatusLine() {
  const status = useSiteStatus();
  return <p className="mt-4 text-sm text-muted">{tr(LABEL[status])}</p>;
}

/** Dismissible strip when the relay says degraded or down. Copy is STATUS_BANNER_TEXT. */
export function StatusBanner() {
  const status = useSiteStatus();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (status !== "degraded" && status !== "down") {
      setHidden(true);
      return;
    }
    try {
      setHidden(window.sessionStorage.getItem("ferzan-status-hide") === status);
    } catch {
      setHidden(false);
    }
  }, [status]);
  if (hidden || (status !== "degraded" && status !== "down")) return null;
  return (
    <div className="relative z-30 border-b border-sell/40 bg-surface px-4 py-2 text-sm text-fg">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <p>{tr(STATUS_BANNER_TEXT)}</p>
        <button
          type="button"
          className="shrink-0 font-semibold text-cyan"
          onClick={() => {
            try {
              window.sessionStorage.setItem("ferzan-status-hide", status);
            } catch {
              /* still hidden for this view */
            }
            setHidden(true);
          }}
        >
          {tr("Dismiss")}
        </button>
      </div>
    </div>
  );
}
