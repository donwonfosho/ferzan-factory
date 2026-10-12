import { createFileRoute } from "@tanstack/react-router";
import { TerminalPage } from "@/components/factory/terminal";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Terminal · Ferzan Factory" },
      { name: "description", content: "Trade through your Ferzan Telegram bot. Keys stay in the bot." },
    ],
  }),
  component: TerminalPage,
});
