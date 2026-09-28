import { createFileRoute, Link } from "@tanstack/react-router";
import { COMMUNITY_URL, X_URL } from "@/lib/factory/catalog";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const EMAIL = "Ferzantrade@gmail.com";
const MULTISIG = "2vWqwX72ijo24vgvPQW6yBQh2qXE4jrEd18YDdEbWKLG";

const OFFICIAL: { label: string; href: string; text: string }[] = [
  { label: "Website", href: "https://ferzan-factory.com", text: "ferzan-factory.com" },
  { label: "X", href: X_URL, text: "@ferzaneco" },
  { label: "Telegram chat", href: COMMUNITY_URL, text: "t.me/Ferzan_Chat" },
  { label: "Telegram hub", href: "https://t.me/Ferzan_Trade_Ecosystem", text: "t.me/Ferzan_Trade_Ecosystem" },
  { label: "New launches channel", href: "https://t.me/Ferzan_Launches", text: "t.me/Ferzan_Launches" },
  { label: "Trade Bot", href: "https://t.me/Ferzan_Trade_Bot", text: "@Ferzan_Trade_Bot" },
  { label: "Launch Bot", href: "https://t.me/Ferzan_Launch_Bot", text: "@Ferzan_Launch_Bot" },
];

function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header>
        <h1 className="text-4xl">{tr("About Ferzan")}</h1>
        <p className="mt-3 text-lg text-muted">
          {tr("Ferzan Factory is a launchpad for crypto coins. Anyone can launch a coin on Solana, Base, BNB Chain, Ethereum, Robinhood Chain, Arc, Tron or TON, from this website or from the Ferzan Telegram bots, and trade it here with their own wallet.")}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl">{tr("What we run")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>
            <span className="text-fg">{tr("Ferzan Factory")}</span>{tr(": this website. Launch a coin, follow every Ferzan coin live, and trade it with a wallet only you control.")}
          </li>
          <li>
            <span className="text-fg">{tr("Telegram bots")}</span>{tr(": a Launch Bot, a Trade Bot, a Buy Bot that posts buys in project chats, and Guardian, which moderates Telegram groups.")}
          </li>
          <li>
            <span className="text-fg">{tr("FERZAN")}</span>{tr(": the platform's token, launching on Solana on Friday, October 9, 2026 at 7:00 PM ET.")}{" "}
            <Link to="/ferzan" className="text-cyan">
              {tr("How it works")}
            </Link>
          </li>
        </ul>
        <p className="text-sm">
          <Link to="/transparency" className="font-semibold text-cyan">
            {tr("Every number behind Ferzan, with receipts →")}
          </Link>
        </p>
        <p className="text-sm text-muted">
          {tr("Ferzan never holds your funds. Every launch and trade is signed by your own wallet. Nothing on this site is financial advice or a promise of price or profit.")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">{tr("Team")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {["Don", "Dre"].map((name) => (
            <div key={name} className="ticket flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-cyan/15 text-lg font-extrabold text-cyan">{name[0]}</span>
              <span className="text-lg font-semibold">{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">{tr("Official links")}</h2>
        <p className="text-sm text-muted">{tr("These are the only official Ferzan accounts. Anything else using the Ferzan name is not us.")}</p>
        <ul className="divide-y divide-line border-y border-line">
          {OFFICIAL.map((o) => (
            <li key={o.label} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
              <span className="text-muted">{tr(o.label)}</span>
              <a className="break-all text-cyan" href={o.href} target="_blank" rel="noopener noreferrer">
                {tr(o.text)}
              </a>
            </li>
          ))}
          <li className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
            <span className="text-muted">{tr("Ferzan multisig (Squads, Solana)")}</span>
            <span className="break-all font-mono text-xs">{MULTISIG}</span>
          </li>
        </ul>
      </section>

      <section className="ticket space-y-2">
        <h2 className="text-xl">{tr("Stay safe")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>{tr("Ferzan admins never DM you first and never ask for a seed phrase, private key or payment.")}</li>
          <li>{tr("The FERZAN contract address is posted only on this site, by @ferzaneco on X and in the Ferzan Telegram chat, at 7:00 PM ET on October 9. Any address before that is fake.")}</li>
          <li>{tr("Ferzan does not sell listings, guaranteed pumps or \"recovery\" services. Anyone offering them in our name is a scammer.")}</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl">{tr("Contact")}</h2>
        <p className="text-muted">
          {tr("Email")}{" "}
          <a className="text-cyan" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>{" "}
          {tr("or message us in the")}{" "}
          <a className="text-cyan" href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer">
            {tr("Ferzan Telegram chat")}
          </a>
          {tr(". Security issues and wrongly blocked pages can be reported to the same email.")}
        </p>
      </section>
    </div>
  );
}
