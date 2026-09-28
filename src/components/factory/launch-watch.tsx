import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listBoard, type BoardCoin } from "@/lib/factory/board";
import { CHAINS } from "@/lib/factory/catalog";
import { readPrefs } from "@/lib/factory/prefs";
import type { ChainId } from "@/lib/factory/types";

const SEEN = "ferzan-seen-launch";

export function LaunchWatch() {
  const [coin, setCoin] = useState<BoardCoin | null>(null);

  useEffect(() => {
    let stop = false;
    let primed = false;

    async function pull() {
      const prefs = readPrefs();
      const rows = await listBoard({ data: { chain: "all", sort: "new", q: "" } }).catch(() => [] as BoardCoin[]);
      const newest = rows[0];
      if (!newest || stop) return;
      const stamp = `${newest.contract}:${newest.createdAt}`;
      const previous = window.sessionStorage.getItem(SEEN);
      window.sessionStorage.setItem(SEEN, stamp);
      if (!primed) {
        primed = true;
        return;
      }
      if (prefs.alerts === "off" || previous === stamp) return;
      setCoin(newest);
      if (prefs.sound) chime();
      window.setTimeout(() => {
        if (!stop) setCoin((current) => (current?.contract === newest.contract ? null : current));
      }, 8000);
    }

    void pull();
    const timer = window.setInterval(() => void pull(), 20000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!coin) return null;
  const chain = CHAINS[coin.chain as ChainId]?.label ?? coin.chain;
  return (
    <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-50 sm:bottom-4 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-surface p-4 shadow-border">
      <p className="text-sm font-extrabold text-cyan">New launch</p>
      <p className="mt-1 font-semibold">
        {coin.symbol} · {coin.name}
      </p>
      <p className="text-sm text-muted">{chain}</p>
      <div className="mt-3 flex gap-2">
        <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="btn-cyan" onClick={() => setCoin(null)}>
          Open
        </Link>
        <button type="button" className="btn-line" onClick={() => setCoin(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function chime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* the browser blocked sound */
  }
}
