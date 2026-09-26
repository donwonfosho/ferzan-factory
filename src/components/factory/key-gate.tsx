import { useEffect, useState, type ReactNode } from "react";
import { keySaved, markKeySaved, readSiteWallet, siteMatches } from "@/lib/factory/site-wallet";

export function KeyGate({ address, onSaved }: { address: string; onSaved: () => void }) {
  const site = readSiteWallet();
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  if (!site || site.address.toLowerCase() !== address.toLowerCase()) return null;

  return (
    <div className="bg-bg px-3 py-3 shadow-border">
      <p className="text-sm font-semibold">Copy the key. It is the login.</p>
      <p className="mt-1 text-sm text-muted">
        Paste it on another phone and this wallet comes back, with the name, picture, and every coin it launched. The site cannot recover a key you did not save. Anyone with the key can spend the wallet.
      </p>
      <textarea readOnly value={site.privateKey} rows={3} spellCheck={false} className="mt-2 w-full bg-surface px-3 py-3 text-xs break-all shadow-border outline-none" />
      <button
        type="button"
        className="btn-line mt-2"
        onClick={() => {
          void navigator.clipboard.writeText(site.privateKey).then(
            () => {
              setCopied(true);
              setNote("Copied. Keep it offline.");
            },
            () => {
              setCopied(true);
              setNote("Copy was blocked. Select the key and copy it by hand, then continue.");
            },
          );
        }}
      >
        Copy recovery key
      </button>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />
        I saved this key outside the browser.
      </label>
      <button
        type="button"
        className="btn-cyan mt-3"
        disabled={!checked || !copied}
        onClick={() => {
          markKeySaved(site.address);
          onSaved();
        }}
      >
        Continue
      </button>
    </div>
  );
}

export function KeyLock({ address, children }: { address: string; children: ReactNode }) {
  const onSite = Boolean(address && siteMatches(address));
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setSaved(!onSite || keySaved(address));
  }, [address, onSite]);
  if (onSite && !saved) return <KeyGate address={address} onSaved={() => setSaved(true)} />;
  return children;
}
