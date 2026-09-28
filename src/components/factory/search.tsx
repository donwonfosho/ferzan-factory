import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { searchCoins, type SearchHit } from "@/lib/factory/market-extra";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";
import { Mark } from "./ui";

let isOpen = false;
const subs = new Set<() => void>();
export function openSearch(v = true) {
  isOpen = v;
  subs.forEach((fn) => fn());
}
function useOpen() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => isOpen,
    () => false,
  );
}

const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);

export function SearchButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => openSearch()} className={cn("btn-line", className)} aria-label="Search coins">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <span className="hidden lg:inline">Search</span>
      <kbd className="hidden rounded bg-bg px-1.5 text-[10px] text-muted shadow-border lg:inline">/</kbd>
    </button>
  );
}

/** Search every Ferzan coin on all 8 chains by ticker, name or address. Opens with "/" or Ctrl/⌘ K. */
export function SearchOverlay() {
  const open = useOpen();
  const router = useRouter();
  const input = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        openSearch(true);
      } else if (e.key === "Escape") openSearch(false);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 30);
    else {
      setQ("");
      setHits(null);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    let stop = false;
    const id = window.setTimeout(() => {
      searchCoins({ data: { q: term } })
        .then((r) => {
          if (!stop) {
            setHits(r);
            setSel(0);
          }
        })
        .catch(() => !stop && setHits([]));
    }, 220);
    return () => {
      stop = true;
      window.clearTimeout(id);
    };
  }, [q]);

  if (!open) return null;
  function go(h: SearchHit | undefined) {
    if (!h) return;
    openSearch(false);
    router.history.push(h.path);
  }
  const list = hits ?? [];
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-bg/80 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => openSearch(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-border-hover" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search coins">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(list.length - 1, s + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              if (e.key === "Enter") go(list[sel]);
            }}
            placeholder="Ticker, name or contract address"
            spellCheck={false}
            className="min-h-14 w-full bg-transparent text-base outline-none"
            aria-label="Search"
          />
          <button type="button" className="shrink-0 text-xs text-muted" onClick={() => openSearch(false)}>
            Esc
          </button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {hits === null ? (
            <li className="px-3 py-6 text-center text-sm text-muted">Every Ferzan coin on Solana, Base, BNB, Ethereum, Robinhood, Arc, Tron and TON.</li>
          ) : list.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">No Ferzan coin matches “{q.trim()}”.</li>
          ) : (
            list.map((h, i) => (
              <li key={`${h.chain}-${h.token}`}>
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(h)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", i === sel ? "bg-bg" : "")}
                >
                  <Mark symbol={h.symbol} image={h.image || undefined} className="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">${h.symbol}</span>
                      {MARKS.has(h.chain) ? <ChainMark id={h.chain as MarkChain} className="h-4 w-4" /> : null}
                      {h.graduated ? <span className="text-xs text-cyan">Graduated</span> : null}
                    </span>
                    <span className="block truncate text-xs text-muted">{h.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                    {h.mcapUsd > 0 ? compactUsd(h.mcapUsd) : ""}
                    {h.progress !== null && !h.graduated ? <span className="block">{h.progress.toFixed(0)}%</span> : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
