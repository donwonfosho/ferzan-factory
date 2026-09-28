import { createFileRoute } from "@tanstack/react-router";
import { CompetePage } from "@/components/factory/compete-page";

export const Route = createFileRoute("/compete")({
  component: CompetePage,
});
