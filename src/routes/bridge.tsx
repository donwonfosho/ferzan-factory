import { createFileRoute } from "@tanstack/react-router";
import { BridgePage } from "@/components/factory/bridge-page";

export const Route = createFileRoute("/bridge")({
  head: () => ({ meta: [{ title: "Bridge · Ferzan Factory" }] }),
  component: BridgePage,
});
