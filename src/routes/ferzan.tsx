import { createFileRoute } from "@tanstack/react-router";
import { FerzanPage } from "@/components/factory/ferzan-page";

export const Route = createFileRoute("/ferzan")({
  component: FerzanPage,
});
