import { createFileRoute } from "@tanstack/react-router";
import { FerzanPage } from "@/components/factory/ferzan-page";

export const Route = createFileRoute("/ferzan")({
  head: () => ({
    meta: [
      { title: "FERZAN · Ferzan Factory" },
      { name: "description", content: "FERZAN, the platform's token." },
    ],
  }),
  component: FerzanPage,
});
