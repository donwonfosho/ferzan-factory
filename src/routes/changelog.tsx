import { createFileRoute } from "@tanstack/react-router";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog · Ferzan Factory" },
      { name: "description", content: "What changed on Ferzan Factory." },
    ],
  }),
  component: ChangelogPage,
});

const ENTRIES = [
  {
    date: "October 11, 2026",
    items: [
      "Portuguese, Russian, Turkish and Vietnamese are available. Those four are machine translated.",
    ],
  },
  {
    date: "October 10, 2026",
    items: [
      "Add funds and cash out: a card or Apple Pay in, and a cash-out link on the chains that have one.",
      "Beta feedback and coin reports, from the report button on every page.",
      "Known issues notice: the site is in beta. Real funds are at risk. Start small.",
      "Coin creator badges on coin pages. They count launches we already have. They are not a guarantee.",
      "Launch date locked: Friday, November 13, 2026 at 4:00 PM ET.",
      "System status",
      "Launch countdown on the home page, and a preview before you sign a buy, sell, or bridge.",
      "A verify page for the contracts this site uses, and a health check for uptime monitors.",
    ],
  },
];

function ChangelogPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">{tr("Changelog")}</h1>
      <div className="mt-6 space-y-6">
        {ENTRIES.map((entry) => (
          <section key={entry.date}>
            <h2 className="text-lg">{tr(entry.date)}</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted">
              {entry.items.map((item) => (
                <li key={item}>{tr(item)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
