import { useEffect, useState, useSyncExternalStore } from "react";
import { setPollInterval } from "@/lib/factory/poll";
import { STATUS_BANNER_TEXT } from "@/lib/factory/beta";
import { getSiteStatus, type SiteStatus } from "@/lib/factory/site-status";
import { tr, useLang } from "@/lib/i18n";

const PART = { normal: "Normal", down: "Down", unknown: "Unknown" } as const;

const FAIL: SiteStatus = { reach: "fail", status: "degraded", updated: 0, components: [] };

let current: SiteStatus | null = null;
const subs = new Set<() => void>();
let stopPoll: (() => void) | null = null;

function publish(next: SiteStatus) {
  current = next;
  subs.forEach((fn) => fn());
}

async function pull() {
  try {
    publish(await getSiteStatus());
  } catch {
    publish(FAIL);
  }
}

function subscribe(fn: () => void) {
  subs.add(fn);
  if (stopPoll === null && typeof window !== "undefined") {
    void pull();
    stopPoll = setPollInterval(() => void pull(), 20_000);
  }
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && stopPoll) {
      stopPoll();
      stopPoll = null;
    }
  };
}

function useSiteStatus(): SiteStatus | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

function footerLabel(status: SiteStatus): string {
  if (status.reach === "fail") return "Can't reach Ferzan servers";
  if (status.status === "normal") return "Systems normal";
  if (status.status === "degraded") return "Some systems degraded";
  if (status.status === "down") return "Systems down";
  return "Status unknown";
}

/** degraded, down, or the request failed. unknown and normal have no banner. */
function bannerKey(status: SiteStatus | null): "degraded" | "down" | "fail" | null {
  if (!status) return null;
  if (status.reach === "fail") return "fail";
  if (status.status === "degraded") return "degraded";
  if (status.status === "down") return "down";
  return null;
}

function bannerSentence(key: "degraded" | "down" | "fail"): string {
  return key === "down" ? STATUS_BANNER_TEXT.down : STATUS_BANNER_TEXT.degraded;
}

function formatUpdated(unix: number, lang: string): string {
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const locale = lang === "zh" ? "zh-CN" : lang === "es" ? "es" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/** Footer line. "Systems normal" only when the API answered normal. */
export function StatusLine() {
  const status = useSiteStatus();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  if (!status) return <p className="mt-4 h-5" aria-hidden />;
  const text = footerLabel(status);
  const parts = status.reach === "ok" ? status.components : [];
  const when = status.reach === "ok" && status.updated > 0 ? formatUpdated(status.updated, lang) : "";
  const shown = status.reach === "fail" ? "unreachable" : status.status;
  return (
    <div className="mt-4">
      <button
        type="button"
        className="min-h-11 text-left text-sm text-muted underline decoration-line underline-offset-2"
        aria-expanded={open}
        data-site-status={shown}
        onClick={() => setOpen((v) => !v)}
      >
        {tr(text)}
      </button>
      {open ? (
        <div className="mt-1 max-w-full rounded-xl bg-bg px-3 py-2 text-xs shadow-border" data-site-status-panel>
          <p className="font-medium text-fg">{tr("System status")}</p>
          {parts.length ? (
            <ul className="mt-2 space-y-1">
              {parts.map((part, i) => (
                <li key={`${part.name}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-fg">{part.name}</span>
                  <span className={part.status === "down" ? "shrink-0 text-sell" : "shrink-0 text-muted"}>{tr(PART[part.status])}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">{tr(text)}</p>
          )}
          {when ? <p className="mt-2 text-muted">{tr("Updated {0}", when)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Dismissible one-line strip at the top of the page. Copy is STATUS_BANNER_TEXT. */
export function StatusBanner() {
  const status = useSiteStatus();
  const key = bannerKey(status);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (!key) {
      setHidden(true);
      return;
    }
    try {
      setHidden(window.sessionStorage.getItem("ferzan-status-hide") === key);
    } catch {
      setHidden(false);
    }
  }, [key]);
  if (!key || hidden) return null;
  return (
    <div className="border-b border-sell/40 bg-surface px-4 py-2 text-sm text-fg" role="status" data-banner={key}>
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <p className="min-w-0 flex-1">{tr(bannerSentence(key))}</p>
        <button
          type="button"
          className="min-h-11 shrink-0 font-semibold text-cyan"
          onClick={() => {
            try {
              window.sessionStorage.setItem("ferzan-status-hide", key);
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
