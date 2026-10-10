import { createFileRoute } from "@tanstack/react-router";
import { COMMUNITY_URL, X_URL } from "@/lib/factory/catalog";
import { LAUNCH_LABEL } from "@/lib/factory/launch";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/press")({
  head: () => ({
    meta: [
      { title: "Press · Ferzan Factory" },
      { name: "description", content: "Ferzan Factory logos, colours, the launch date, and the official links." },
    ],
  }),
  component: PressPage,
});

const COLOURS = [
  { name: "Background", hex: "#07090b" },
  { name: "Surface", hex: "#11181a" },
  { name: "Text", hex: "#f4f7f7" },
  { name: "Cyan", hex: "#3ee0e6" },
  { name: "Cyan ink", hex: "#042022" },
];

function PressPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">{tr("Press kit")}</h1>
      <p className="mt-3 text-muted">
        {tr("Ferzan Factory is a launchpad for crypto coins. Anyone can launch a coin on Solana, Base, BNB Chain, Ethereum, Robinhood Chain, Arc, Tron or TON, from this website or from the Ferzan Telegram bots, and trade it here with their own wallet.")}{" "}
        {tr("FERZAN")}
        {tr(": the platform's token.")}
      </p>
      <p className="mt-3 text-sm">
        <span className="font-semibold">{tr("Launch date")}: </span>
        {tr(LAUNCH_LABEL)}
      </p>

      <h2 className="mt-8 text-2xl">{tr("Logos")}</h2>
      <div className="mt-3 space-y-4">
        <File src="/brand/seal.jpg" label={tr("Logo")} />
        <File src="/brand/lockup.jpg" label={tr("Lockup")} />
        <File src="/brand/ferzan-token.jpg" label={tr("FERZAN mark")} />
      </div>

      <h2 className="mt-8 text-2xl">{tr("Banner")}</h2>
      <div className="mt-3 space-y-4">
        <File src="/og.jpg" label={tr("Share card")} />
        <File src="/x-banner.jpg" label={tr("X banner")} />
      </div>

      <h2 className="mt-8 text-2xl">{tr("Colours")}</h2>
      <ul className="mt-3 space-y-2">
        {COLOURS.map((c) => (
          <li key={c.hex} className="flex items-center gap-3 text-sm">
            <span className="h-8 w-8 shrink-0 border border-line" style={{ background: c.hex }} />
            <span>{tr(c.name)}</span>
            <span className="font-mono text-muted">{c.hex}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-2xl">{tr("Official links")}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li>
          <a className="text-cyan" href="https://ferzan-factory.com">
            ferzan-factory.com
          </a>
        </li>
        <li>
          <a className="text-cyan" href={X_URL}>
            {tr("@ferzanfactory")}
          </a>
        </li>
        <li>
          <a className="text-cyan" href={COMMUNITY_URL}>
            t.me/Ferzan_Chat
          </a>
        </li>
      </ul>
    </div>
  );
}

function File({ src, label }: { src: string; label: string }) {
  return (
    <figure>
      <img src={src} alt={label} className="w-full max-w-full bg-surface" />
      <figcaption className="mt-1 text-sm">
        <a className="text-cyan" href={src} download>
          {label}
        </a>
      </figcaption>
    </figure>
  );
}
