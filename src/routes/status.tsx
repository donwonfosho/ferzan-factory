import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getSiteStatus, type SiteStatus } from "@/lib/factory/site-status";
import { tr, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Status · Ferzan Factory" },
      { name: "description", content: "Whether Ferzan Factory is up." },
    ],
  }),
  component: StatusPage,
});

const PART = { normal: "Normal", down: "Down", unknown: "Unknown" } as const;

function label(status: SiteStatus): string {
  if (status.reach === "fail") return "Can't reach Ferzan servers";
  if (status.status === "normal") return "Systems normal";
  if (status.status === "degraded") return "Some systems degraded";
  if (status.status === "down") return "Systems down";
  return "Status unknown";
}

function when(unix: number, lang: string): string {
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const locale =
    lang === "zh" ? "zh-CN" : lang === "es" ? "es" : lang === "pt" ? "pt" : lang === "ru" ? "ru" : lang === "tr" ? "tr" : lang === "vi" ? "vi" : "en-US";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
}

function StatusPage() {
  const lang = useLang();
  const [status, setStatus] = useState<SiteStatus | null>(null);
  useEffect(() => {
    let stop = false;
    void getSiteStatus()
      .then((next) => {
        if (!stop) setStatus(next);
      })
      .catch(() => {
        if (!stop) setStatus({ reach: "fail", status: "degraded", updated: 0, components: [] });
      });
    return () => {
      stop = true;
    };
  }, []);
  const text = status ? label(status) : "";
  const updated = status && status.reach === "ok" && status.updated > 0 ? when(status.updated, lang) : "";
  return (
    <div className="term-page mx-auto max-w-lg">
      <div className="term-card">
        <p className="term-label">{tr("Status")}</p>
        <h1 className="mt-2 text-4xl text-[#f4f7f7]">{status ? tr(text) : tr("Checking")}</h1>
        {status && status.components.length ? (
          <ul className="mt-4 space-y-2 text-sm">
            {status.components.map((part, i) => (
              <li key={`${part.name}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">{part.name}</span>
                <span className={part.status === "down" ? "shrink-0 text-sell" : "shrink-0 text-[#93a4a7]"}>{tr(PART[part.status])}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {updated ? <p className="mt-4 text-sm text-[#93a4a7]">{tr("Updated {0}", updated)}</p> : null}
      </div>
    </div>
  );
}
