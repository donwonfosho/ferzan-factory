import { track } from "@/lib/factory/analytics";
import { tr } from "@/lib/i18n";

const TRADE_BOT = "Ferzan_Trade_Bot";

/** Deep link the Trade Bot already uses on the TON and Tron coin pages. */
export function OpenInTelegram({ token }: { token: string }) {
  if (!token) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a className="btn-cyan inline-flex" href={`https://t.me/${TRADE_BOT}?start=buy_${encodeURIComponent(token)}`} target="_blank" rel="noopener noreferrer">
        {tr("Open in Telegram")}
      </a>
      <AlertMe token={token} />
    </span>
  );
}

/** The Trade Bot signal card already has the Alert button. This only opens that card. */
export function AlertMe({ token }: { token: string }) {
  if (!/^[0-9A-Za-z_-]{20,70}$/.test(token)) return null;
  const tip = tr("Opens the Trade Bot. Tap the Alert button on the card to set a price or market-cap alert.");
  return (
    <a
      className="btn-line inline-flex text-center"
      href={`https://t.me/${TRADE_BOT}?start=sig_${encodeURIComponent(token)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={tip}
      onClick={() => track("alert_clicked")}
    >
      {tr("Alert me in Telegram")}
    </a>
  );
}