import { createFileRoute } from "@tanstack/react-router";
import { TransparencyPage } from "@/components/factory/transparency-page";

export const Route = createFileRoute("/transparency")({
  head: () => ({
    meta: [
      { title: "Transparency · Ferzan Factory" },
      { name: "description", content: "Ferzan fees, burns and creator payouts, with the transactions." },
    ],
  }),
  component: TransparencyPage,
});
