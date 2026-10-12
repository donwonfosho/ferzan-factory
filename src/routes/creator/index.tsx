import { createFileRoute } from "@tanstack/react-router";
import { CreatorDash } from "@/components/factory/creator-dash";

export const Route = createFileRoute("/creator/")({
  head: () => ({
    meta: [
      { title: "Creator · Ferzan Factory" },
      { name: "description", content: "Launches, fees, and share tools for the signed-in creator." },
    ],
  }),
  component: CreatorDash,
});
