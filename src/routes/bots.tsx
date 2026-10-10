import { createFileRoute } from "@tanstack/react-router";
import { BotsPage } from "@/components/factory/bots-page";

export const Route = createFileRoute("/bots")({
  head: () => ({
    meta: [
      { title: "Bots · Ferzan Factory" },
      { name: "description", content: "Ferzan Telegram bots for trading, launches, buy alerts and chat." },
    ],
  }),
  component: BotsPage,
});
