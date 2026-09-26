import { Link } from "@tanstack/react-router";
import { X_URL } from "@/lib/factory/catalog";

const ROOMS = [
  {
    name: "Trade Desk",
    handle: "@Ferzan_Trade_Bot",
    href: "https://t.me/Ferzan_Trade_Bot",
    text: "The trading bot. Buy, sell, snipe a new coin, copy a wallet, set a limit, or set a trailing stop from Telegram. You sign every action. The bot never holds your key, and it is not part of the token.",
  },
  {
    name: "Launch Bot",
    handle: "@Ferzan_Launch_Bot",
    href: "https://t.me/Ferzan_Launch_Bot",
    text: "Launch a coin from Telegram on your phone. You do not need this website open, and you do not need a computer. You still sign. The bot does not keep the key. Every Telegram launch shows on the floor under From Telegram, and in the @Ferzan_Launches channel.",
  },
  {
    name: "Buy Bot",
    handle: "@Ferzan_Buy_Bot",
    href: "https://t.me/Ferzan_Buy_Bot",
    text: "Add it to your coin's group. It posts every buy the moment it lands, with a chart and a buy button.",
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
    text: "A moderator for a Telegram group. Add it to the chat. It watches the room. It does not check a token, and it is not attached to a coin.",
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
    name: "X",
    handle: "@ferzaneco",
    href: X_URL,
    text: "Ferzan Trade on X.",
  },
] as const;

export function BotsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl">Telegram</h1>
      <p className="mt-4 max-w-xl text-muted">
        These are the Ferzan bots and rooms. They live in Telegram. None of them are minted onto a coin, and none of them hold your key.
      </p>
      <ul className="mt-8 space-y-4">
        {ROOMS.map((room) => (
          <li key={room.handle} className="ticket">
            <p className="text-lg font-semibold">{room.name}</p>
            <p className="mt-1 text-sm text-cyan">{room.handle}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{room.text}</p>
            <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-cyan" href={room.href}>
              Open
            </a>
          </li>
        ))}
      </ul>
      <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan mt-8">
        Launch a coin
      </Link>
    </div>
  );
}
