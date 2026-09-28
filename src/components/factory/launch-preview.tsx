import { useEffect, useRef } from "react";
import { LAUNCH_CHAIN_META, type BotLaunchChain } from "@/lib/factory/bot-launch";
import { ChainMark, type MarkChain } from "./chain-mark";
import { ShareCoin } from "./perks";
import { confetti } from "./pulse-live";
import { Mark } from "./ui";

/** Launch fees fixed in the Ferzan factories (the wallet always shows the exact amount before you sign). */
const FEE: Record<BotLaunchChain, { fee: string; extra: string }> = {
  solana: { fee: "0.05 SOL (half for FERZAN holders, free for 10M+)", extra: "about 0.03 SOL of Solana rent and fees" },
  base: { fee: "0.003 ETH", extra: "Base gas (usually cents)" },
  bsc: { fee: "0.015 BNB", extra: "BNB Chain gas (usually cents)" },
  ethereum: { fee: "0.003 ETH", extra: "Ethereum gas (can be a few dollars)" },
  robinhood: { fee: "0.003 ETH", extra: "Robinhood Chain gas (usually cents)" },
  arc: { fee: "1 USDC", extra: "Arc gas, paid in USDC" },
  tron: { fee: "5 TRX", extra: "about 16 TRX of Tron energy" },
  ton: { fee: "0.3 TON", extra: "about 0.3 TON for the coin contract, most of it comes back" },
};

export function LaunchPreview({
  chain,
  name,
  symbol,
  image,
  description,
  devBuy,
  startMinutes,
  plain,
}: {
  chain: BotLaunchChain;
  name: string;
  symbol: string;
  image: string;
  description: string;
  devBuy: string;
  startMinutes: string;
  plain: boolean;
}) {
  const meta = LAUNCH_CHAIN_META[chain];
  const sym = (symbol || "TICKER").slice(0, 12);
  const nm = (name || "Your coin").slice(0, 32);
  const buy = Number(devBuy) > 0 ? `${devBuy} ${meta.native}` : "none";
  const later = Number(startMinutes) > 0 ? `Trading opens ${startMinutes} minute${startMinutes === "1" ? "" : "s"} after launch` : "Trading opens right away";
  return (
    <section className="space-y-3 rounded-2xl bg-bg p-4 shadow-border" aria-label="Preview">
      <p className="text-sm font-medium text-cyan">Preview</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="ticket">
          <div className="flex items-center gap-3">
            <Mark symbol={sym} image={image || undefined} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-extrabold">{sym}</span>
                <ChainMark id={chain as MarkChain} className="h-4 w-4 shrink-0" />
                <span className="text-xs text-muted">Site</span>
              </span>
              <span className="block truncate text-sm text-muted">{nm}</span>
            </span>
            <span className="shrink-0 text-right text-sm tabular-nums">
              <span className="block font-semibold">New</span>
              <span className="block text-muted">just now</span>
            </span>
          </div>
          {!plain ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full w-[2%] bg-cyan" />
            </div>
          ) : null}
          <p className="mt-2 truncate text-xs text-muted">{plain ? "Standard coin · 0 trades" : "0% to graduation · 0 trades · by you"}</p>
          {description ? <p className="mt-2 line-clamp-2 text-xs text-muted">{description}</p> : null}
        </div>
        <div className="overflow-hidden rounded-xl bg-[#07090b] p-4 shadow-border" aria-label="How a shared link looks">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Shared link preview</p>
          <div className="mt-2 flex items-center gap-3">
            {image ? <img src={image} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface font-extrabold text-cyan">{sym.slice(0, 3)}</span>}
            <span className="min-w-0">
              <span className="block truncate font-extrabold">{nm}</span>
              <span className="block font-bold text-cyan">${sym}</span>
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">{meta.label}</p>
          {!plain ? <div className="mt-2 h-2 rounded-full bg-line"><div className="h-2 w-[4%] rounded-full bg-cyan" /></div> : null}
          <p className="mt-2 text-[11px] font-semibold">ferzan-factory.com</p>
        </div>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Launch fee</dt>
        <dd>{FEE[chain].fee}</dd>
        {!plain ? (
          <>
            <dt className="text-muted">Your first buy</dt>
            <dd>{buy}</dd>
          </>
        ) : null}
        <dt className="text-muted">Network</dt>
        <dd>{FEE[chain].extra}</dd>
        {!plain && chain !== "solana" ? (
          <>
            <dt className="text-muted">Trading</dt>
            <dd>{later}</dd>
          </>
        ) : null}
        {!plain ? (
          <>
            <dt className="text-muted">You earn</dt>
            <dd>Half of every trading fee on this coin, for as long as it trades</dd>
          </>
        ) : null}
      </dl>
      <p className="text-xs text-muted">Your wallet shows the exact total before you sign.</p>
    </section>
  );
}

/** The moment after a launch: confetti, the coin card, share buttons. */
export function LaunchCelebration({ chain, token, symbol }: { chain: string; token: string; symbol: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvas.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return confetti(canvas.current);
  }, []);
  const ok = /^[a-z]{2,12}$/.test(chain) && /^[0-9A-Za-z_-]{20,70}$/.test(token);
  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-50" aria-hidden />
      {ok ? (
        <div className="mt-4 space-y-3">
          <img src={`https://launch.ferzaneco.com/api/og/${chain}/${token}.png`} alt={`$${symbol} card`} className="w-full rounded-xl shadow-border" />
          <ShareCoin chain={chain} token={token} symbol={symbol} />
          <p className="text-xs text-muted">Post it now. The first minutes after a launch are when buyers are watching Pulse and the Launches channel.</p>
        </div>
      ) : null}
    </>
  );
}
