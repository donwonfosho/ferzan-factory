import { useEffect, useRef, useState } from "react";
import { listTelegram } from "@/lib/factory/telegram-feed";
import { solBalance } from "@/lib/factory/solana";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { openSolCheckout } from "@/lib/factory/moonpay-open";
import { tr } from "@/lib/i18n";

const FALLBACK = "/brand/ferzan-token.jpg";
const DUST = 10_000_000n;
const RING: { left: string; top: string; dur: string; delay: string }[] = [
  { left: "18%", top: "28%", dur: "7s", delay: "0s" },
  { left: "38%", top: "14%", dur: "9s", delay: "0.4s" },
  { left: "62%", top: "12%", dur: "8s", delay: "0.8s" },
  { left: "82%", top: "30%", dur: "10s", delay: "0.2s" },
  { left: "72%", top: "72%", dur: "7.5s", delay: "1s" },
  { left: "28%", top: "74%", dur: "8.5s", delay: "0.6s" },
];

/** Shown until My Wallet holds at least 0.01 SOL. Hidden again once it does. */
export function AddFundsCard() {
  const account = useAccountWallets();
  const [images, setImages] = useState<string[]>(() => Array(6).fill(FALLBACK));
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const want = useRef(false);
  const asked = useRef(false);

  useEffect(() => {
    let stop = false;
    listTelegram({ data: { sort: "volume", chain: "", q: "" } })
      .then((rows) => {
        if (stop) return;
        const picked = rows
          .filter((row) => row.image)
          .sort((a, b) => b.vol24Usd - a.vol24Usd)
          .slice(0, 6)
          .map((row) => row.image);
        setImages(Array.from({ length: 6 }, (_, i) => picked[i] || FALLBACK));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!account?.ready) return;
    if (!account.authenticated || !account.solAddress) {
      setShown(true);
      return;
    }
    let stop = false;
    void solBalance(account.solAddress)
      .then((n) => {
        if (!stop) setShown(n < DUST);
      })
      .catch(() => {
        if (!stop) setShown(true);
      });
    return () => {
      stop = true;
    };
  }, [account?.ready, account?.authenticated, account?.solAddress]);

  useEffect(() => {
    if (!want.current || !account?.ready) return;
    if (account.authenticated && account.solAddress) {
      want.current = false;
      setBusy(true);
      setNote("");
      void openSolCheckout(account.solAddress)
        .catch((err) => setNote(err instanceof Error ? err.message : tr("Could not open card checkout.")))
        .finally(() => setBusy(false));
      return;
    }
    if (!asked.current) {
      asked.current = true;
      account.login();
    }
  }, [account]);

  if (!shown) return null;

  function press() {
    setNote("");
    want.current = true;
    asked.current = false;
    if (!account?.ready) return;
    if (!account.authenticated || !account.solAddress) {
      asked.current = true;
      account.login();
      return;
    }
    want.current = false;
    setBusy(true);
    void openSolCheckout(account.solAddress)
      .catch((err) => setNote(err instanceof Error ? err.message : tr("Could not open card checkout.")))
      .finally(() => setBusy(false));
  }

  return (
    <section className="term-card overflow-hidden" style={{ padding: 0 }}>
      <div
        className="relative h-[180px] overflow-hidden"
        style={{ background: "linear-gradient(165deg, #1a6d78 0%, #143f4a 28%, #0b1330 68%, #070b18 100%)" }}
      >
        {RING.map((spot, i) => (
          <span key={spot.left + spot.top} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: spot.left, top: spot.top }}>
            <img
              src={images[i]}
              alt=""
              width={44}
              height={44}
              className="fz-coin-float h-11 w-11 rounded-full border-2 border-[#2fe3d8] object-cover"
              style={{ ["--fz-dur" as string]: spot.dur, ["--fz-delay" as string]: spot.delay }}
              onError={(e) => {
                if (e.currentTarget.src.endsWith(FALLBACK)) return;
                e.currentTarget.src = FALLBACK;
              }}
            />
          </span>
        ))}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-black">Apple Pay</span>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        <h2 className="text-lg font-bold">{tr("Get your first coin with Apple Pay")}</h2>
        <p className="text-sm text-[#93a4a7]">
          {tr("Card, Apple Pay or Google Pay. MoonPay handles the payment; first-time buyers verify their ID once.")}
        </p>
        <button type="button" className="term-go" disabled={busy} onClick={press}>
          {busy ? tr("Opening") : tr("Get coins now →")}
        </button>
        {note ? <p className="text-sm text-[#fb7185]">{tr(note)}</p> : null}
      </div>
    </section>
  );
}
