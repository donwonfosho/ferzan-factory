import { tr } from "@/lib/i18n";

const NOTE = "Add it as an admin. Guardian turns on the contract-address guard with this coin as the official one.";

/** One-tap links that add the buy bot and Guardian to a Telegram group. */
export function CommunitySetup({ chain, token }: { chain: string; token: string }) {
  if (!/^[a-z]{2,12}$/.test(chain) || !/^[0-9A-Za-z_-]{20,80}$/.test(token)) return null;
  const buy = chain === "robinhood" ? "" : `https://t.me/Ferzan_Buy_Bot?startgroup=${encodeURIComponent(`trk_${chain}_${token}`)}`;
  const guard = `https://t.me/Ferzan_Guardian_Bot?startgroup=${encodeURIComponent(`ca_${token}`)}`;
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-3">
        {buy ? (
          <a className="btn-line" href={buy} target="_blank" rel="noopener noreferrer">
            {tr("Add the Buy Bot to your group")}
          </a>
        ) : null}
        <a className="btn-line" href={guard} target="_blank" rel="noopener noreferrer">
          {tr("Add Guardian to your group")}
        </a>
      </div>
      <p className="text-xs text-muted">{tr(NOTE)}</p>
    </div>
  );
}
