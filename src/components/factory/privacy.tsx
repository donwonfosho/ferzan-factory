import { tr } from "@/lib/i18n";

const COLLECT = [
  "Sign-in: when you sign in we receive your email or phone number, or your linked Telegram or X account, from our sign-in provider Privy, plus your wallet addresses.",
  "Wallets and trades: public blockchain data such as your wallet addresses, the coins you launch and your trades. This is public on the blockchain anyway.",
  "Telegram bots: if you use our Telegram bots we store your Telegram user ID and username, your bot settings, your trade history, and (for the Trade Bot) the encrypted keys of the trading wallets the bot holds for you.",
  "Usage: privacy-friendly, cookie-free page statistics (Plausible) and error reports (Sentry) that help us fix bugs. Our servers keep IP addresses in short-term logs to stop abuse and rate-limit requests.",
  "What you send us: feedback forms and messages.",
  "In your browser: small settings (language, watchlist, drafts) in local storage on your device.",
];

export function PrivacyBody() {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <p className="text-muted">{tr("Privacy Policy — last updated [date]")}</p>
      <section>
        <h2 className="text-lg font-semibold">{tr("Who we are")}</h2>
        <p className="mt-2 text-muted">
          {tr("Ferzan Factory ([legal company name], [country/state]) runs ferzan-factory.com and the Ferzan Telegram bots. Contact: [privacy email].")}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("What we collect")}</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
          {COLLECT.map((line) => (
            <li key={line}>{tr(line)}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("What we do NOT collect")}</h2>
        <p className="mt-2 text-muted">
          {tr("We never see your card, bank or Apple Pay details. Payments for buying crypto are handled by MoonPay under MoonPay's own privacy policy. The keys of your website wallet are held by Privy and you, not by us.")}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("How we use it")}</h2>
        <p className="mt-2 text-muted">
          {tr("To run your account and the bots, show your portfolio, execute the orders you ask for, prevent fraud and abuse, fix bugs, and follow the law. We do not sell your personal data.")}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("Who we share it with")}</h2>
        <p className="mt-2 text-muted">
          {tr("Service providers who run parts of the service (Privy for sign-in and wallets, MoonPay for payments, our hosting and RPC providers, Plausible, Sentry), and authorities when the law requires it.")}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("How long we keep it")}</h2>
        <p className="mt-2 text-muted">
          {tr("As long as your account is active and as required by law; ask us to delete your account data at [privacy email]. Public blockchain data cannot be deleted by anyone.")}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("Your rights")}</h2>
        <p className="mt-2 text-muted">
          {tr("Depending on where you live you may ask to see, correct or delete your data, or object to how we use it. Email [privacy email]. Not for under-18s.")}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("Changes")}</h2>
        <p className="mt-2 text-muted">{tr("We will post updates on this page with a new date.")}</p>
      </section>
    </div>
  );
}
