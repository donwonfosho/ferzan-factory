import { useEffect, useState } from "react";
import { addComment, listComments, reportComment, type Comment } from "@/lib/factory/social";
import { moderate } from "@/lib/factory/moderation";
import { signProof } from "@/lib/factory/proof-client";
import { proofAddress, postBody } from "@/lib/factory/proof";
import { creatorLabel } from "@/lib/factory/engine";
import { useFactory } from "@/lib/factory/store";
import { formatWhen } from "@/lib/factory/units";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { useLive, sameCoin } from "@/lib/factory/live";
import { cn } from "@/lib/cn";

/** The comment thread under a Ferzan coin. Every comment is signed by the wallet that wrote it. */
export function CoinComments({ chain, token, creator }: { chain: string; token: string; creator?: string }) {
  const account = useAccountWallets();
  const siteWallet = useFactory((s) => s.wallet);
  const me = account?.authenticated && account.evmAddress ? account.evmAddress : siteWallet || "";
  const [items, setItems] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const hint = body.trim() ? moderate(body) : "";

  async function pull() {
    const rows = await listComments({ data: { chain, token } }).catch(() => null);
    if (rows) setItems(rows);
  }
  useEffect(() => {
    setItems(null);
    void pull();
    const id = window.setInterval(() => void pull(), 20_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, token]);
  useLive((e) => {
    if (e.type === "trade" && sameCoin(e, chain, token) && Math.random() < 0.2) void pull(); // busy coins: refresh now and then
  });

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const text = postBody(body);
    const why = moderate(text);
    if (why) return setError(why);
    if (!me) return setError("Sign in (Profile) to comment. Every comment is signed by your wallet, so nobody can post as you.");
    setBusy(true);
    try {
      const proof = await signProof("post", me, { contract: proofAddress(token), chain, body: text });
      await addComment({ data: { chain, token, author: me, body: text, proof } });
      setBody("");
      await pull();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not post.";
      setError(/user (rejected|denied)|rejected the request|4001/i.test(msg) ? "You cancelled the signature." : msg.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  async function report(id: string) {
    if (!me) return setError("Sign in to report a comment.");
    try {
      const proof = await signProof("post", me, { report: id });
      await reportComment({ data: { id, reporter: me, proof } });
      setReported((r) => new Set(r).add(id));
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Could not report.");
    }
  }

  const dev = creator ? proofAddress(creator) : "";
  return (
    <section className="ticket space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-muted">Comments</p>
        {items ? <p className="text-xs text-muted">{items.length} shown</p> : null}
      </div>
      <form onSubmit={(e) => void post(e)} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Say something about this coin"
          className="w-full rounded-xl bg-bg px-3 py-3 text-sm shadow-border outline-none"
          aria-label="Your comment"
        />
        <div className="flex items-center justify-between gap-3">
          <p className={cn("text-xs", hint ? "text-sell" : "text-muted")}>{hint || error || `${body.length}/280 · no links or addresses`}</p>
          <button type="submit" className="btn-cyan shrink-0" disabled={busy || !body.trim() || Boolean(hint)}>
            {busy ? "Signing…" : "Post"}
          </button>
        </div>
        {error && hint ? <p className="text-xs text-sell">{error}</p> : null}
      </form>
      {items === null ? (
        <p className="text-sm text-muted">Loading comments…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No comments yet. Be the first.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex items-center gap-2 text-xs">
                <a href={`/p/${c.author}`} className="font-semibold text-cyan">
                  {creatorLabel(c.author)}
                </a>
                {dev && proofAddress(c.author) === dev ? <span className="rounded-full bg-fg/10 px-2 py-0.5 font-semibold">Dev</span> : null}
                <span className="text-muted tabular-nums">{Number.isFinite(Date.parse(c.createdAt)) ? formatWhen(Date.parse(c.createdAt)) : ""}</span>
                <button
                  type="button"
                  className="ml-auto text-muted hover:text-sell"
                  onClick={() => void report(c.id)}
                  disabled={reported.has(c.id)}
                  aria-label="Report this comment"
                >
                  {reported.has(c.id) ? "Reported" : "Report"}
                </button>
              </div>
              <p className="mt-1 text-sm break-words">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Links, contract addresses and scam phrases are blocked. A comment reported by 3 wallets is hidden. Admins never DM first.</p>
    </section>
  );
}
