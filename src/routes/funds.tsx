import { createFileRoute } from "@tanstack/react-router";
import { FundsDesk } from "@/components/factory/funds";

export const Route = createFileRoute("/funds")({
  head: () => ({ meta: [{ title: "Add funds · Ferzan Factory" }] }),
  component: FundsDesk,
});
