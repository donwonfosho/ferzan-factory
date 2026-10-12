import { useEffect, useState, useSyncExternalStore } from "react";
import { setPollInterval } from "@/lib/factory/poll";
import { coinKey, listLiveStreams, setCoinStream, streamUrl, type LiveStream } from "@/lib/factory/streams";
import { proofDigest, proofMessage, type Proof } from "@/lib/factory/proof";
import { signProof } from "@/lib/factory/proof-client";
import { accountWallets, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tr } from "@/lib/i18n";

let live: LiveStream[] = [];
let started = false;
const subs = new Set<() => void>();

function sameWallet(a: string, b: string) {
  if (!a || !b) return false;
  if (a.startsWith("0x") || a.startsWith("0X") || b.startsWith("0x") || b.startsWith("0X")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function pull() {
  void listLiveStreams()
    .then((rows) => {
      live = rows;
      subs.forEach((fn) => fn());
    })
    .catch(() => undefined);
}

function ensure() {
  if (started || typeof window === "undefined") return;
  started = true;
  pull();
  setPollInterval(pull, 20_000);
}

export function useLiveStreams(): LiveStream[] {
  return useSyncExternalStore(
    (fn) => {
      ensure();
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => live,
    () => [],
  );
}

export function LiveMark({ chain, token }: { chain: string; token: string }) {
  const rows = useLiveStreams();
  if (!rows.some((row) => row.coin === coinKey(chain, token))) return null;
  return <span className="rounded bg-[#e11d48] px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white">{tr("LIVE")}</span>;
}

function youtubeId(url: URL): string {
  const fromPath = url.hostname.replace(/^www\./, "") === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : "";
  const fromQuery = url.searchParams.get("v") ?? "";
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((part) => part === "embed" || part === "live" || part === "shorts");
  const id = fromPath || fromQuery || (at >= 0 ? parts[at + 1] : "");
  return /^[A-Za-z0-9_-]{6,20}$/.test(id ?? "") ? (id as string) : "";
}

function embedOf(raw: string): { src: string; href: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const href = url.toString();
  if (host === "youtube.com" || host === "youtu.be") {
    const id = youtubeId(url);
    return id ? { href, src: `https://www.youtube-nocookie.com/embed/${id}` } : { href, src: "" };
  }
  if (host === "twitch.tv") {
    const parts = url.pathname.split("/").filter(Boolean);
    const parent = "parent=ferzan-factory.com";
    if (parts[0] === "videos" && /^\d{1,12}$/.test(parts[1] ?? "")) return { href, src: `https://player.twitch.tv/?video=${parts[1]}&${parent}` };
    if (/^[A-Za-z0-9_]{2,25}$/.test(parts[0] ?? "")) return { href, src: `https://player.twitch.tv/?channel=${parts[0]}&${parent}` };
    return { href, src: "" };
  }
  if (host === "kick.com") {
    const channel = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_]{2,25}$/.test(channel) ? { href, src: `https://player.kick.com/${channel}` } : { href, src: "" };
  }
  if (host === "x.com") return { href, src: "" };
  return null;
}

async function sha256Hex(message: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function signStream(chain: string, wallet: string, fields: Record<string, string>): Promise<Proof> {
  if (chain !== "ton" && chain !== "tron") return signProof("stream", wallet, fields);
  const ts = Date.now();
  const message = proofMessage("stream", wallet, await proofDigest(fields), ts);
  const hash = await sha256Hex(message);
  const acc = accountWallets();
  if (chain === "ton") {
    if (!acc?.tonAddress || !sameWallet(acc.tonAddress, wallet)) throw new Error("Open the wallet that owns this address to sign.");
    const pub = (await acc.tonPublicKey()).replace(/^0x/i, "");
    const sig = (await acc.tonSignHash(hash)).replace(/^0x/i, "");
    return { ts, signature: `ton.${pub}.${sig}` };
  }
  if (!acc?.tronAddress || !sameWallet(acc.tronAddress, wallet)) throw new Error("Open the wallet that owns this address to sign.");
  const sig = (await acc.tronSignHash(hash)).replace(/^0x/i, "");
  return { ts, signature: `tron.${sig}` };
}

/** Live embed, plus the creator's control to set or end the link. */
export function CoinStream({ chain, token, curve = "", creator, signer = "" }: { chain: string; token: string; curve?: string; creator: string; signer?: string }) {
  const rows = useLiveStreams();
  const account = useAccountWallets();
  const current = rows.find((row) => row.coin === coinKey(chain, token));
  const owned = [signer, account?.authenticated ? account.evmAddress : "", account?.authenticated ? account.solAddress : "", account?.authenticated ? account.tonAddress : "", account?.authenticated ? account.tronAddress : ""].find((item) => item && creator && sameWallet(item, creator)) ?? "";
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const view = current ? embedOf(current.url) : null;

  useEffect(() => {
    setUrl(current?.url ?? "");
  }, [current?.url]);

  async function save(next: string) {
    if (!owned) return;
    setBusy(true);
    setNote("");
    try {
      const clean = next === "" ? "" : streamUrl(next);
      const fields = { chain, coin: coinKey(chain, token), url: clean };
      const proof = await signStream(chain, owned, fields);
      await setCoinStream({ data: { chain, token, curve, url: clean, wallet: owned, proof } });
      pull();
      setNote(next ? "Stream link saved." : "Stream ended.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That link is not allowed.");
    } finally {
      setBusy(false);
    }
  }

  if (!current && !owned) return null;
  return (
    <section className="ticket space-y-3">
      {current ? (
        <div className="flex items-center gap-2">
          <LiveMark chain={chain} token={token} />
          <p className="text-sm font-semibold">{tr("Live now")}</p>
        </div>
      ) : null}
      {view?.src ? <iframe src={view.src} title={tr("Live stream")} className="aspect-video w-full rounded-xl" allow="autoplay; fullscreen" allowFullScreen /> : null}
      {view && !view.src ? (
        <a className="text-sm font-semibold text-cyan" href={view.href} target="_blank" rel="noopener noreferrer">
          {tr("Open on X")}
        </a>
      ) : null}
      {owned ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(url.trim());
          }}
        >
          <label className="block text-xs text-muted" htmlFor={`stream-${token}`}>
            {tr("YouTube, Twitch, Kick, or X. It stays up for 12 hours.")}
          </label>
          <input id={`stream-${token}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="w-full rounded-lg bg-bg px-3 py-2 text-sm shadow-border" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-cyan min-h-10 px-3" disabled={busy || !url.trim()}>
              {tr("Set stream")}
            </button>
            {current ? (
              <button type="button" className="btn-line min-h-10 px-3" disabled={busy} onClick={() => void save("")}>
                {tr("End stream")}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      {note ? <p className="text-xs text-muted">{tr(note)}</p> : null}
    </section>
  );
}
