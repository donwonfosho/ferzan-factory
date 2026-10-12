import { useEffect, useState } from "react";
import { dropSocial, listSocials, mySocials, putSocial, type LinkedSocials, type SocialRow } from "@/lib/factory/creator-socials";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tr } from "@/lib/i18n";

function sameWallet(a: string, b: string) {
  if (!a || !b) return false;
  if (a.startsWith("0x") || a.startsWith("0X") || b.startsWith("0x") || b.startsWith("0X")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function href(row: SocialRow): string {
  return row.platform === "x" ? `https://x.com/${row.handle}` : `https://t.me/${row.handle}`;
}

/** Shows a verified X or Telegram handle, and lets that coin's creator attach or remove it. */
export function VerifiedCreator({ chain, coin, creator }: { chain: string; coin: string; creator: string }) {
  const account = useAccountWallets();
  const [rows, setRows] = useState<SocialRow[]>([]);
  const [mine, setMine] = useState<LinkedSocials | null>(null);
  const [note, setNote] = useState("");
  const wallets = [account?.evmAddress, account?.solAddress, account?.tronAddress, account?.tonAddress];
  const owned = Boolean(account?.authenticated && creator && wallets.some((wallet) => wallet && sameWallet(wallet, creator)));

  useEffect(() => {
    let stop = false;
    listSocials({ data: { chain, coin } })
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, [chain, coin, note]);

  useEffect(() => {
    if (!owned) {
      setMine(null);
      return;
    }
    let stop = false;
    void account?.accessToken().then((token) => {
      if (!token || stop) return;
      void mySocials({ data: { token } })
        .then((next) => {
          if (!stop) setMine(next);
        })
        .catch(() => {
          if (!stop) setMine(null);
        });
    });
    return () => {
      stop = true;
    };
  }, [owned, account?.userId]);

  async function save(platform: "x" | "telegram", remove: boolean) {
    const token = await account?.accessToken();
    if (!token) {
      setNote(tr("Sign in again."));
      return;
    }
    setNote("");
    try {
      if (remove) await dropSocial({ data: { token, chain, coin, platform } });
      else await putSocial({ data: { token, chain, coin, platform } });
      setNote(remove ? tr("Removed.") : tr("Verified."));
    } catch (err) {
      setNote(err instanceof Error ? err.message : tr("Could not save that."));
    }
  }

  const have = new Set(rows.map((row) => row.platform));
  return (
    <div className="space-y-2 text-sm">
      {rows.map((row) => (
        <p key={row.platform}>
          {tr("Creator")}:{" "}
          <a className="font-semibold text-cyan" href={href(row)} target="_blank" rel="noopener noreferrer">
            @{row.handle}
          </a>{" "}
          {row.platform === "x" ? tr("on X") : tr("on Telegram")}{" "}
          <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-xs font-semibold text-cyan">{tr("Verified")}</span>
        </p>
      ))}
      {owned && mine?.x && !have.has("x") ? (
        <button type="button" className="btn-line min-h-9 px-3 text-xs" onClick={() => void save("x", false)}>
          {tr("Show @{0} on X", mine.x)}
        </button>
      ) : null}
      {owned && mine?.telegram && !have.has("telegram") ? (
        <button type="button" className="btn-line min-h-9 px-3 text-xs" onClick={() => void save("telegram", false)}>
          {tr("Show @{0} on Telegram", mine.telegram)}
        </button>
      ) : null}
      {owned && have.has("x") ? (
        <button type="button" className="btn-line min-h-9 px-3 text-xs" onClick={() => void save("x", true)}>
          {tr("Remove X")}
        </button>
      ) : null}
      {owned && have.has("telegram") ? (
        <button type="button" className="btn-line min-h-9 px-3 text-xs" onClick={() => void save("telegram", true)}>
          {tr("Remove Telegram")}
        </button>
      ) : null}
      {note ? <p className="text-xs text-muted">{tr(note)}</p> : null}
    </div>
  );
}
