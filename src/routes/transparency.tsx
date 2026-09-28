import { createFileRoute } from "@tanstack/react-router";
import { TransparencyPage } from "@/components/factory/transparency-page";

export const Route = createFileRoute("/transparency")({
  component: TransparencyPage,
});
