import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

import { tr } from "@/lib/i18n";

/** Selects the text of an element so the visitor can copy by hand when the clipboard API is blocked. */
function selectText(el: HTMLElement | null) {
  if (!el || typeof window === "undefined") return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/**
 * The contract address of a coin: the address itself is tappable (tap copies it, long-press or drag still
 * selects it) and a "Copy contract" button sits next to it. Works on phones: the clipboard write happens
 * inside the click handler, and if it is blocked the address is selected so the visitor can copy it.
 */
export function CopyAddress({ address, label, className }: { address: string; label?: string; className?: string }) {
  const [state, setState] = useState<"" | "copied" | "blocked">("");
  const textRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);

  function flash(next: "copied" | "blocked") {
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(""), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      flash("copied");
    } catch {
      selectText(textRef.current);
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      flash(ok ? "copied" : "blocked");
    }
  }

  return (
    <div className={cn("mt-3 min-w-0", className)}>
      <p className="fz-eyebrow">{label ?? tr("Contract")}</p>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <button
          type="button"
          className="fz-ca min-w-0 flex-1"
          title={tr("Copy contract")}
          onClick={() => void copy()}
        >
          <span ref={textRef}>{address}</span>
        </button>
        <button type="button" className="btn-line min-h-11 shrink-0" onClick={() => void copy()}>
          {state === "copied" ? tr("Copied") : tr("Copy contract")}
        </button>
      </div>
      <p className="mt-1 min-h-5 text-xs text-muted" aria-live="polite">
        {state === "copied" ? tr("Contract copied.") : state === "blocked" ? tr("Copy was blocked. Select the address above.") : ""}
      </p>
    </div>
  );
}
