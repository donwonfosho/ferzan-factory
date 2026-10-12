import { createFileRoute } from "@tanstack/react-router";
import { PromotedPage } from "@/components/factory/promote";

export const Route = createFileRoute("/promoted")({
  head: () => ({
    meta: [
      { title: "Promoted · Ferzan Factory" },
      { name: "description", content: "Paid placements on Pulse, each with its transaction." },
    ],
  }),
  component: PromotedPage,
});
