import { Link } from "@tanstack/react-router";
import { X_URL } from "@/lib/factory/catalog";
import { FeeTable } from "./fee-table";

import { tr } from "@/lib/i18n";
const ROOMS = [
  {
    name: "Trade Desk",
    handle: "@Ferzan_Trade_Bot",
    href: "https://t.me/Ferzan_Trade_Bot",
    text: "The trading bot. Buy, sell, snipe a new coin, copy a wallet, set a limit, or set a trailing stop from Telegram. The bot creates a trading wallet for you. Its key is stored encrypted on Ferzan's server so trades run in one tap, and you can export it any time with /wallet. Every trade needs your tap. Opens as a mini app or classic chat mode.",
  },
  {
    name: "Launch Bot",
    handle: "@Ferzan_Launch_Bot",
    href: "https://t.me/Ferzan_Launch_Bot",
    text: "Launch a coin from Telegram on your phone. You do not need this website open, and you do not need a computer. You sign with your own wallet, or launch from your Trade Bot wallet. Every Telegram launch shows on the floor under From Telegram, and in the @Ferzan_Launches channel. Opens as a mini app or classic chat mode.",
  },
  {
    name: "Buy Bot",
    handle: "@Ferzan_Buy_Bot",
    href: "https://t.me/Ferzan_Buy_Bot",
    text: "Add it to your coin's group. It posts every buy the moment it lands, with a chart and a buy button. Opens as a mini app or classic chat mode.",
  },
  {
    name: "Launches channel",
    handle: "@Ferzan_Launches",
    href: "https://t.me/Ferzan_Launches",
    text: "Every coin launched with the Launch Bot, its milestones, King of the Hill, and graduations. Follow it to catch coins early.",
  },
  {
    name: "Guardian",
    handle: "@Ferzan_Guardian_Bot",
    href: "https://t.me/Ferzan_Guardian_Bot",
    text: "A moderator for a Telegram group. Add it to the chat. It watches the room. It does not check a token, and it is not attached to a coin. Opens as a mini app or classic chat mode.",
  },
  {
    name: "Trending",
    handle: "@Ferzan_Trending",
    href: "https://t.me/Ferzan_Trending",
    text: "The channel for what is moving. It is a feed, not a bot you add to a coin.",
  },
  {
    name: "Raid leaderboard",
    handle: "@Ferzan_Raid",
    href: "https://t.me/Ferzan_Raid",
    text: "The raid board. Groups post raids and the board ranks them.",
  },
  {
    name: "Ecosystem hub",
    handle: "@Ferzan_Trade_Ecosystem",
    href: "https://t.me/Ferzan_Trade_Ecosystem",
    text: "The directory. Bots, channels, and the chat, in one place.",
  },
  {
    name: "Ecosystem chat",
    handle: "@Ferzan_Chat",
    href: "https://t.me/Ferzan_Chat",
    text: "The public Ferzan chat.",
  },
  {
    name: "Ferzan on X",
    handle: "@ferzanfactory",
    href: X_URL,
    text: "Ferzan Trade on X.",
  },
] as const;

const FEATURED = 3;

export function BotsPage() {
  const lead = ROOMS.slice(0, FEATURED);
  const rest = ROOMS.slice(FEATURED);
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="fz-glow fz-rise relative overflow-hidden rounded-2xl px-5 py-7 sm:px-8 sm:py-10">
        <div className="fz-orb -right-10 -top-10 h-48 w-48" aria-hidden />
        <p className="fz-eyebrow relative">{tr("Bots and rooms")}</p>
        <h1 className="relative mt-2 text-4xl sm:text-5xl lg:text-6xl">
          <span className="fz-grad-text">{tr("Telegram")}</span>
        </h1>
        <p className="relative mt-4 max-w-2xl text-muted">
          {tr("These are the Ferzan bots and rooms. They live in Telegram. None of them are minted onto a coin.")}
        </p>
        <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan relative mt-6 w-full sm:w-auto">
          {tr("Launch a coin")}
        </Link>
      </section>

      <ul className="grid gap-4 lg:grid-cols-3">
        {lead.map((room) => (
          <li key={room.handle} className="fz-card ticket flex flex-col">
            <RoomBody room={room} big />
          </li>
        ))}
      </ul>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((room) => (
          <li key={room.handle} className="fz-card ticket flex flex-col">
            <RoomBody room={room} />
          </li>
        ))}
      </ul>
      <FeeTable />
    </div>
  );
}

function RoomBody({ room, big }: { room: (typeof ROOMS)[number]; big?: boolean }) {
  return (
    <>
      <p className={big ? "text-xl font-extrabold" : "text-lg font-semibold"}>{tr(room.name)}</p>
      <p className="mt-1 text-sm font-medium text-cyan">{room.handle}</p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{tr(room.text)}</p>
      <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-cyan" href={room.href}>
        {tr("Open")} →
      </a>
    </>
  );
}
