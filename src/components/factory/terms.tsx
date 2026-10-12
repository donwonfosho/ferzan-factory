import { useState } from "react";
import { acceptTerms } from "@/lib/factory/terms";
import { X_URL } from "@/lib/factory/catalog";

import { tr } from "@/lib/i18n";
const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Not advice",
    body: "Nothing on Ferzan Factory is financial, investment, legal, or tax advice. You decide for yourself. Talk to your own advisor if you need one.",
  },
  {
    title: "You can lose everything",
    body: "Memecoins and new tokens are speculative. The price can go to zero in one trade. You can lose 100% of what you spend. Do not spend money you cannot afford to lose.",
  },
  {
    title: "No value and no promise of profit",
    body: "Coins launched here are for entertainment, community, or experiment. They have no intrinsic value. Nothing here promises a return, profit sharing, or income.",
  },
  {
    title: "You are using a screen, not a broker",
    body: "The website is a screen for signing your own transactions; your website wallet is non-custodial. Separately, our optional Telegram Trade Bot holds trading wallets for you (encrypted keys) and places the trades you order or the automatic rules you set; withdrawals need your confirmation in Telegram. We do not make trading decisions for you, control the tokens people create, or endorse them.",
  },
  {
    title: "Your website wallet",
    body: "Your website wallet is created and secured by our sign-in provider Privy. You can export its key. Anyone with the key can spend the wallet. We cannot reverse trades.",
  },
  {
    title: "Buying crypto with a card or Apple Pay",
    body: "Card and Apple Pay purchases are provided by MoonPay, not by Ferzan Factory. MoonPay's terms and privacy policy apply, and MoonPay handles identity checks and payments. Crypto you buy goes to your own website wallet.",
  },
  {
    title: "The software is unaudited",
    body: "The site and the contracts are provided as is and as available. They may have bugs. They may go offline. They may be attacked. Blockchains can be slow, congested, or reorg. We are not liable for that.",
  },
  {
    title: "Pools are not a promise",
    body: "A curve may graduate into a public pool. That does not promise buyers, a price, or a listing on any exchange. Older coins may not open a pool at all.",
  },
  {
    title: "Your responsibility",
    body: "You are at least 18. You are allowed to use crypto where you live. You pay your own taxes. If you launch or trade a coin, you are responsible for what it says and what it does.",
  },
  {
    title: "Where you may not use this",
    body: "Do not use this site if you are in, or a resident of, a place under comprehensive sanctions, including Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions of Ukraine, or if you are on a sanctions list. Using a VPN to hide that is a breach of these terms.",
  },
  {
    title: "Names and pictures",
    body: "Do not upload a name, ticker, or picture you do not have the right to use. We can remove a name or picture from this website. That does not delete the token from the chain. Send a takedown through the Ferzan account on X with the coin link, what you own, and how to reach you.",
  },
  {
    title: "If something goes wrong",
    body: "To the fullest extent the law allows, Ferzan Factory and its people are not liable for lost tokens, lost profits, or indirect damages. Any liability is limited to the fees you paid this site in the three months before the claim. You will cover claims that come from your launches, your trades, or your breach of these terms.",
  },
];

export function TermsBody() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{tr("Operated by [legal company name]. Contact: [support email].")}</p>
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="text-lg font-semibold">{tr(section.title)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{tr(section.body)}</p>
        </section>
      ))}
      <p className="text-sm text-muted">
        {tr("Takedowns go to")}{" "}
        <a className="text-cyan" href={X_URL}>
          {tr("@ferzanfactory")}
        </a>
        {tr(". These terms are the rules for using the site. They are not a substitute for your own lawyer.")}
      </p>
      <p className="text-sm text-muted">{tr("Governing law: [state/country].")}</p>
    </div>
  );
}

export function TermsGate({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-4xl">{tr("Before you start")}</h1>
      <p className="mt-3 text-muted">{tr("Read this before you create a wallet. You only do it once.")}</p>
      <div className="ticket mt-6 max-h-[28rem] overflow-y-auto">
        <TermsBody />
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>{tr("I am 18 or older, I am allowed to use this where I live, and I understand I can lose everything I spend.")}</span>
      </label>
      <button
        type="button"
        className="btn-cyan mt-4 w-full"
        disabled={!checked}
        onClick={() => {
          acceptTerms();
          onAccept();
        }}
      >
        {tr("Accept and continue")}
      </button>
    </div>
  );
}
