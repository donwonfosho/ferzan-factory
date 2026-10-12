import { Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

import { tr } from "@/lib/i18n";

const DSN = import.meta.env.VITE_SENTRY_DSN;

function report(error: unknown) {
  if (typeof DSN !== "string" || !DSN) return;
  void import("@sentry/react")
    .then((Sentry) => {
      if (!Sentry.getClient()) {
        void import("@/lib/factory/sentry").then((mod) => mod.startBrowserSentry(DSN));
      }
      Sentry.captureException(error);
    })
    .catch(() => {
      /* reporting is optional */
    });
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  useEffect(() => {
    report(error);
  }, [error]);
  return (
    <div className="term-page mx-auto max-w-lg px-4 py-16">
      <div className="term-card">
        <p className="term-label">{tr("Error")}</p>
        <h1 className="mt-2 text-3xl text-[#f4f7f7]">{tr("Something broke on this page")}</h1>
        <p className="mt-3 text-sm text-[#93a4a7]">{tr("Reload the page. If it keeps happening, the status page says whether the site is up.")}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-cyan" onClick={() => window.location.reload()}>
            {tr("Reload")}
          </button>
          <Link to="/status" className="btn-line">{tr("Status")}</Link>
        </div>
      </div>
    </div>
  );
}
