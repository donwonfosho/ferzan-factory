import { tr } from "@/lib/i18n";

/** Deep link the Trade Bot already uses on the TON and Tron coin pages. */
export function OpenInTelegram({ token }: { token: string }) {
  if (!token) return null;
  return (
    <a className="btn-cyan inline-flex" href={`https://t.me/Ferzan_Trade_Bot?start=buy_${token}`} target="_blank" rel="noopener noreferrer">
      {tr("Open in Telegram")}
    </a>
  );
}
