import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { loadFeedbackAdmin, unlockFeedbackAdmin } from "@/lib/factory/feedback-admin";
import { tr } from "@/lib/i18n";
import { NotFoundPage } from "../$";

type Kind = "all" | "feedback" | "coin";

export const Route = createFileRoute("/admin/feedback")({
  validateSearch: (search: Record<string, unknown>): { kind: Kind } => ({
    kind: search.kind === "feedback" || search.kind === "coin" ? search.kind : "all",
  }),
  loaderDeps: ({ search }) => ({ kind: search.kind }),
  loader: async ({ deps }) => {
    const view = await loadFeedbackAdmin({ data: { kind: deps.kind } });
    if (view.status === "missing") throw notFound();
    return view;
  },
  head: () => ({
    meta: [
      { title: "Feedback · Ferzan Factory" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: NotFoundPage,
  component: AdminFeedback,
});

function AdminFeedback() {
  const view = Route.useLoaderData();
  const { kind } = Route.useSearch();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function open(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await unlockFeedbackAdmin({ data: { password } });
      if (!result.ok) {
        setError(tr(result.error));
        return;
      }
      setPassword("");
      await router.invalidate();
    } catch {
      setError(tr("Wrong password."));
    } finally {
      setBusy(false);
    }
  }

  if (view.status === "locked") {
    return (
      <form className="mx-auto max-w-sm" onSubmit={(e) => void open(e)}>
        <h1 className="text-3xl">{tr("Feedback reports")}</h1>
        <label className="mt-4 block text-sm font-semibold">
          {tr("Password")}
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className="fz-ca mt-1 w-full text-sm font-normal"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-sell">{error}</p> : null}
        <button type="submit" className="btn-cyan mt-4" disabled={busy || password.length < 1}>
          {busy ? tr("Sending") : tr("Open")}
        </button>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl">{tr("Feedback reports")}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <Filter kind="all" current={kind} label={tr("All")} />
        <Filter kind="feedback" current={kind} label={tr("Feedback")} />
        <Filter kind="coin" current={kind} label={tr("Coin reports")} />
      </div>
      {view.rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{tr("No reports yet.")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">{tr("Time")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Kind")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Category")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Message")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Contact")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Page")}</th>
                <th className="py-2 font-semibold">{tr("Coin")}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row, i) => (
                <tr key={`${row.time}-${i}`} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{row.time.replace("T", " ").slice(0, 16)}</td>
                  <td className="py-2 pr-3">{row.kind}</td>
                  <td className="py-2 pr-3">{row.category}</td>
                  <td className="max-w-xs py-2 pr-3 whitespace-pre-wrap break-words">{row.message}</td>
                  <td className="py-2 pr-3 break-all">{row.contact}</td>
                  <td className="py-2 pr-3 break-all">{row.path}</td>
                  <td className="py-2 break-all">{row.coin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Filter({ kind, current, label }: { kind: Kind; current: Kind; label: string }) {
  return (
    <Link to="/admin/feedback" search={{ kind }} className={kind === current ? "btn-cyan" : "btn-line"}>
      {label}
    </Link>
  );
}
