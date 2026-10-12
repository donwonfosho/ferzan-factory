import { useEffect, useState, type ReactNode } from "react";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const LAST = "ferzan-last-trade:";

export function tradePresets(unit: string): string[] {
  if (unit === "SOL") return ["0.05", "0.1", "0.5", "1"];
  if (unit === "BNB") return ["0.01", "0.05", "0.1", "0.5"];
  if (unit === "TRX") return ["20", "100", "500", "1000"];
  if (unit === "TON") return ["0.5", "1", "5", "10"];
  if (unit === "USDC") return ["5", "10", "25", "100"];
  return ["0.001", "0.005", "0.01", "0.05"];
}

export function rememberLastTrade(key: string, amount: string) {
  const value = amount.trim();
  if (!value) return;
  try {
    sessionStorage.setItem(LAST + key, value);
  } catch {
    /* this visit can still repeat it after the sheet reads state */
  }
}

function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const go = () => setPhone(mq.matches);
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, []);
  return phone;
}

/** On a phone, the existing trade form (slippage and preview included) opens from a bottom bar. */
export function PhoneTrade({
  symbol,
  presets,
  amount,
  setAmount,
  rememberKey,
  reveal = 0,
  children,
}: {
  symbol: string;
  presets: string[];
  amount: string;
  setAmount: (value: string) => void;
  rememberKey: string;
  /** Bump to open the phone sheet so a buy can use the form that is already there. */
  reveal?: number;
  children: ReactNode;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    if (reveal > 0) setOpen(true);
  }, [reveal]);

  useEffect(() => {
    if (!phone) return;
    try {
      setLast(sessionStorage.getItem(LAST + rememberKey));
    } catch {
      setLast(null);
    }
  }, [phone, rememberKey, open, amount]);

  if (!phone) return children;
  return (
    <>
      <div className="h-16" />
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-line bg-bg/95 p-3">
        <button type="button" className="btn-cyan w-full" onClick={() => setOpen(true)}>
          {tr("Trade {0}", symbol)}
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label={tr("Close")} onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] max-h-[70vh] overflow-y-auto rounded-t-2xl bg-bg p-4 shadow-border">
            <div className="mb-3 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button key={preset} type="button" className={cn("min-h-10 px-3", amount === preset ? "btn-cyan" : "btn-line")} onClick={() => setAmount(preset)}>
                  {preset}
                </button>
              ))}
              <button type="button" className="btn-line min-h-10 px-3" disabled={!last} onClick={() => last && setAmount(last)}>
                {tr("Repeat last trade")}
              </button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
