import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { APP_VERSION } from "@/lib/factory/beta";
import { sendReport } from "@/lib/factory/feedback";
import { track } from "@/lib/factory/analytics";
import { tr } from "@/lib/i18n";

const FEEDBACK = ["bug", "idea", "other"] as const;
const COIN = ["scam", "impersonation", "offensive", "other"] as const;
const NAME: Record<string, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
  scam: "Scam",
  impersonation: "Impersonation",
  offensive: "Offensive",
};

function Sheet({
  title,
  kind,
  categories,
  coin,
  onClose,
}: {
  title: string;
  kind: "feedback" | "coin";
  categories: readonly string[];
  coin?: string;
  onClose: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [category, setCategory] = useState(categories[0] ?? "other");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendReport({
        data: { kind, category, message, contact, company, path, version: APP_VERSION, coin: coin ?? "" },
      });
      track("feedback_sent");
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg ? tr(msg) : tr("Could not send that. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <form
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-4 shadow-border"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button type="button" className="text-sm font-semibold text-cyan" onClick={onClose}>
            {tr("Close")}
          </button>
        </div>
        {done ? (
          <p className="mt-4 text-sm">{tr("Thanks. We got it.")}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={category === id}
                  className={category === id ? "btn-cyan" : "btn-line"}
                  onClick={() => setCategory(id)}
                >
                  {tr(NAME[id] ?? id)}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm font-semibold">
              {kind === "coin" ? tr("Note") : tr("What happened?")}
              <textarea
                value={message}
                maxLength={1000}
                required
                rows={4}
                onChange={(e) => setMessage(e.target.value)}
                className="fz-ca mt-1 w-full text-sm font-normal"
              />
            </label>
            <p className="mt-1 text-right text-xs text-muted">{message.length}/1000</p>
            <label className="mt-3 block text-sm font-semibold">
              {tr("Contact handle (optional)")}
              <input
                value={contact}
                maxLength={40}
                onChange={(e) => setContact(e.target.value)}
                className="fz-ca mt-1 w-full text-sm font-normal"
                autoComplete="off"
              />
            </label>
            <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              Company
              <input value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" />
            </label>
            {error ? <p className="mt-3 text-sm text-sell">{error}</p> : null}
            <button type="submit" className="btn-cyan mt-4" disabled={busy || message.trim().length < 4}>
              {busy ? tr("Sending") : kind === "coin" ? tr("Send report") : tr("Send")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

/** Opens the same sheet as the floating button. */
export function openFeedback() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ferzan-feedback"));
}

/** Floating beta feedback. Hidden whenever it would cover a link, a button, or the footer. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [node, setNode] = useState<HTMLButtonElement | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("ferzan-feedback", onOpen);
    return () => window.removeEventListener("ferzan-feedback", onOpen);
  }, []);

  useEffect(() => {
    if (!node) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const footer = document.querySelector("footer")?.getBoundingClientRect();
      const overFooter = !!footer && footer.top < box.bottom && footer.bottom > box.top && footer.left < box.right && footer.right > box.left;
      node.style.pointerEvents = "none";
      const spots: Array<[number, number]> = [
        [box.left + 3, box.top + 3],
        [box.right - 3, box.top + 3],
        [box.left + box.width / 2, box.top + box.height / 2],
        [box.left + 3, box.bottom - 3],
        [box.right - 3, box.bottom - 3],
      ];
      const overControl = spots.some(([x, y]) => !!document.elementFromPoint(x, y)?.closest("a, button, input, textarea, select, summary, label, [role='button']"));
      const hide = overFooter || overControl;
      node.style.pointerEvents = hide ? "none" : "";
      node.classList.toggle("invisible", hide);
      node.toggleAttribute("aria-hidden", hide);
      node.tabIndex = hide ? -1 : 0;
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const watch = new ResizeObserver(schedule);
    watch.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      watch.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [path, node]);

  return (
    <>
      <button
        ref={setNode}
        type="button"
        aria-label={tr("Report a bug / Feedback")}
        className="fixed right-3 z-30 inline-flex h-8 items-center whitespace-nowrap rounded-full bg-cyan px-3 text-xs font-semibold leading-none text-cyan-ink shadow-border bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-4"
        onClick={() => setOpen(true)}
      >
        {tr("Feedback")}
      </button>
      {open ? <Sheet title={tr("Report a bug / Feedback")} kind="feedback" categories={FEEDBACK} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Coin report. Does not hide the coin. */
export function ReportCoin({ coin }: { coin: string }) {
  const [open, setOpen] = useState(false);
  if (!coin) return null;
  return (
    <>
      <button type="button" className="btn-line" onClick={() => setOpen(true)}>
        {tr("Report")}
      </button>
      {open ? <Sheet title={tr("Report this coin")} kind="coin" categories={COIN} coin={coin} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
