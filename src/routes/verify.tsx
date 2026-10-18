import { createFileRoute, Link } from "@tanstack/react-router";
import { COMMUNITY_URL, TREASURY, X_URL } from "@/lib/factory/catalog";
import {
  FACTORIES,
  PLAIN_FACTORIES,
  SOLANA_CURVE_PROGRAM,
  TRON_CURVE_FACTORY,
  TRON_CURVE_FACTORY_OLD,
  TRON_PLAIN_FACTORY,
} from "@/lib/factory/contracts";
import { tr } from "@/lib/i18n";

type EvmChain = "ethereum" | "base" | "bsc" | "robinhood" | "arc";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify · Ferzan Factory" },
      { name: "description", content: "Contracts this site uses, how fees are enforced, and the only official links." },
    ],
  }),
  component: VerifyPage,
});

const EVM_ORDER: EvmChain[] = ["ethereum", "base", "bsc", "robinhood", "arc"];

const CHAIN_LABEL: Record<EvmChain, string> = {
  ethereum: "Ethereum",
  base: "Base",
  bsc: "BNB Chain",
  robinhood: "Robinhood Chain",
  arc: "Arc",
};

const EXPLORER: Record<EvmChain, string> = {
  ethereum: "https://etherscan.io",
  base: "https://basescan.org",
  bsc: "https://bscscan.com",
  robinhood: "https://robinhoodchain.blockscout.com",
  arc: "https://explorer.arc.io",
};

type Row = { what: string; chain: string; address: string; href: string };

function evm(chain: EvmChain, address: string): string {
  return `${EXPLORER[chain]}/address/${address}`;
}

function rows(): Row[] {
  const out: Row[] = [];
  for (const chain of EVM_ORDER) {
    out.push({
      what: "Curve factory. It creates a bonding-curve coin on this chain.",
      chain: CHAIN_LABEL[chain],
      address: FACTORIES[chain],
      href: evm(chain, FACTORIES[chain]),
    });
    out.push({
      what: "Standard-coin factory. It creates a coin that is not a curve.",
      chain: CHAIN_LABEL[chain],
      address: PLAIN_FACTORIES[chain],
      href: evm(chain, PLAIN_FACTORIES[chain]),
    });
  }
  out.push({
    what: "Tron curve factory — new launches (0 TRX fee)",
    chain: "Tron",
    address: TRON_CURVE_FACTORY,
    href: `https://tronscan.org/#/address/${TRON_CURVE_FACTORY}`,
  });
  out.push({
    what: "Tron curve factory — older coins (5 TRX fee)",
    chain: "Tron",
    address: TRON_CURVE_FACTORY_OLD,
    href: `https://tronscan.org/#/address/${TRON_CURVE_FACTORY_OLD}`,
  });
  out.push({
    what: "Tron standard-coin factory. It creates a coin that is not a curve, on Tron.",
    chain: "Tron",
    address: TRON_PLAIN_FACTORY,
    href: `https://tronscan.org/#/address/${TRON_PLAIN_FACTORY}`,
  });
  out.push({
    what: "Solana curve program. Every Solana curve coin is created by this program.",
    chain: "Solana",
    address: SOLANA_CURVE_PROGRAM,
    href: `https://solscan.io/account/${SOLANA_CURVE_PROGRAM}`,
  });
  out.push({
    what: "Treasury. Website curve fees and the bridge fee are paid to this address.",
    chain: "EVM",
    address: TREASURY.evm,
    href: `https://etherscan.io/address/${TREASURY.evm}`,
  });
  out.push({
    what: "Treasury on Solana. The Solana curve program pays this address.",
    chain: "Solana",
    address: TREASURY.sol,
    href: `https://solscan.io/account/${TREASURY.sol}`,
  });
  return out;
}

function VerifyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl">{tr("Verify")}</h1>
      <p className="mt-3 text-muted">
        {tr("Contracts this site uses, how the fees are enforced, and the only links that are official.")}
      </p>

      <h2 className="mt-8 text-2xl">{tr("Contracts")}</h2>
      <p className="mt-3 text-sm text-muted">
        {tr("These are the contracts this site already uses. A coin's own curve address is created when that coin launches and is shown on its page.")}
      </p>
      <div className="mt-4 space-y-3 sm:hidden">
        {rows().map((row) => (
          <article key={`m-${row.chain}-${row.what}-${row.address}`} className="rounded-xl bg-surface p-3 text-sm shadow-border">
            <p className="font-semibold">{tr(row.what)}</p>
            <p className="mt-1 text-muted">{tr(row.chain)}</p>
            <p className="mt-2 break-all font-mono text-xs">{row.address}</p>
            <a className="mt-1 inline-flex min-h-12 items-center text-cyan" href={row.href} target="_blank" rel="noopener noreferrer">
              {tr("View on explorer")}
            </a>
          </article>
        ))}
      </div>
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-2 pr-3 font-semibold">{tr("What")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Chain")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Address")}</th>
              <th className="py-2 font-semibold">{tr("Explorer")}</th>
            </tr>
          </thead>
          <tbody>
            {rows().map((row) => (
              <tr key={`${row.chain}-${row.what}-${row.address}`} className="border-b border-line align-top">
                <td className="py-3 pr-3">{tr(row.what)}</td>
                <td className="py-3 pr-3 whitespace-nowrap">{tr(row.chain)}</td>
                <td className="py-3 pr-3 break-all font-mono text-xs">{row.address}</td>
                <td className="py-3">
                  <a className="inline-flex min-h-12 items-center text-cyan" href={row.href} target="_blank" rel="noopener noreferrer">
                    {tr("View on explorer")}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">
        {tr("There is no Ferzan bridge contract in this site's config. The bridge uses Relay and deBridge.")}
      </p>
      <p className="mt-2 text-sm text-muted">{tr("There is no TON factory address in this site's config.")}</p>

      <h2 className="mt-8 text-2xl">{tr("How fees are enforced")}</h2>
      <div className="mt-3 space-y-3 text-sm">
        <p>
          {tr("New launches use Launch Bot curves: 50% creator, 50% platform, paid on each trade.")}{" "}
          {tr("Older website curves: the contract takes a 1% fee inside the trade. The EVM contract the curve factories deploy credits 60% of that fee to the treasury, 30% to the creator, and 10% to the referrer. If the referrer address is empty, that 10% is credited to the treasury. Each recipient withdraws with claim(). The Solana curve program takes the same 1% and pays the same split in the trade. If there is no referrer, that share goes to the treasury.")}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{tr("Older website curves (first contracts, no longer used for new launches): 60% treasury, 30% creator, 10% referrer or treasury.")}</li>
          <li>{tr("New launches (Launch Bot curves): 50% creator, 50% platform.")}</li>
          <li>{tr("New launches (Launch Bot curves) with a referral: 50% creator, 40% platform, 10% referrer.")}</li>
          <li>{tr("Ferzan Curve V2 (BNB Chain): 1% on every trade. 0.40% creator (half held until graduation), 0.35% Ferzan (0.10% of it to a referrer when a buyer came from a referral link), 0.10% Diamond Hands, 0.05% Rising Floor, 0.05% Auto-Trending, 0.05% FERZAN Flywheel.")}</li>
        </ul>
        <p>
          {tr("New launches (Launch Bot curves) on this site use that split. It is not the older website curve contract, and this site has no separate Launch Bot factory address to list.")}
        </p>
        <p>
          {tr("The bridge is not that 1% fee. The quote adds a 0.25% Ferzan fee and pays it to the EVM treasury through Relay or deBridge.")}
        </p>
        <p>
          <Link to="/docs" className="inline-flex min-h-12 items-center text-cyan">
            {tr("Docs")}
          </Link>
        </p>
      </div>

      <h2 className="mt-8 text-2xl">{tr("FERZAN lock")}</h2>
      <p className="mt-3 text-sm">
        {tr("The team and locked allocations will be published here with a Jupiter Lock link when FERZAN launches.")}
      </p>

      <h2 className="mt-8 text-2xl">{tr("Official links")}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li>
          <a className="inline-flex min-h-12 items-center text-cyan" href="https://ferzan-factory.com">
            ferzan-factory.com
          </a>
        </li>
        <li>
          <a className="inline-flex min-h-12 items-center text-cyan" href={X_URL}>
            {tr("@ferzanfactory")}
          </a>
        </li>
        <li>
          <a className="inline-flex min-h-12 items-center text-cyan" href={COMMUNITY_URL}>
            t.me/Ferzan_Chat
          </a>
        </li>
      </ul>

      <h2 className="mt-8 text-2xl">{tr("Anti-phishing")}</h2>
      <p className="mt-3 text-sm">
        {tr("We never DM you first. We never ask for a seed phrase. Only trust ferzan-factory.com.")}
      </p>
    </div>
  );
}
