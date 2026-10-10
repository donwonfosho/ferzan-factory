import { createFileRoute } from "@tanstack/react-router";
import { CompetePage } from "@/components/factory/compete-page";

export const Route = createFileRoute("/compete")({
  head: () => ({
    meta: [
      { title: "Compete · Ferzan Factory" },
      { name: "description", content: "Weekly competition: top traders and top callers on every Ferzan coin." },
    ],
  }),
  component: CompetePage,
});
