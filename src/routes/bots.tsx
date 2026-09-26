import { createFileRoute } from "@tanstack/react-router";
import { BotsPage } from "@/components/factory/bots-page";

export const Route = createFileRoute("/bots")({
  component: BotsPage,
});
