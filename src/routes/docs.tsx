import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

export function DocsPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">How it works</h1>
      <p className="mt-3 text-muted">A coin launched here is a fixed supply. The curve sells it. Graduation opens a pool. This site never holds the key.</p>
      <ol className="mt-6 space-y-4">
        <Item n="1" title="Create a wallet on Profile">
          One key covers Ethereum, Base, BNB, Robinhood, and Arc. Solana is a second address from the same key. Export it before you fund it.
        </Item>
        <Item n="2" title="Launch a curve">
          You pick the chain, the supply, and the graduation target. The anti-snipe wall caps each wallet at 0.5% of that target until graduation. Turn it off if you want an open curve.
        </Item>
        <Item n="3" title="Trades stay on the coin page">
          Buys and sells sign in the wallet this site opened. A 1% fee splits 0.30% to the creator, 0.10% to a referrer when the buyer names one, and 0.60% to treasury.
        </Item>
        <Item n="4" title="Graduation opens the pool">
          The buy that fills the curve opens the pool in that same transaction on Ethereum, Base, BNB, Robinhood, and Arc. The creator keeps 30% of the LP. The rest is burned. Solana does not seed a Raydium pool yet.
        </Item>
      </ol>
      <p className="mt-6 text-sm text-muted">
        Nothing here is a promise of buyers or a price. Read the <Link to="/terms" className="text-cyan">terms</Link> before you launch or trade.
      </p>
    </div>
  );
}

function Item({ n, title, children }: { n: string; title: string; children: string }) {
  return (
    <li className="bg-surface p-4 shadow-border">
      <p className="text-sm font-extrabold text-cyan">{n}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </li>
  );
}
