import { createFileRoute } from "@tanstack/react-router";
import { PulseBoard } from "@/components/factory/pulse-board";

export const Route = createFileRoute("/pulse")({
  head: () => ({ meta: [{ title: "Pulse · Ferzan Factory" }] }),
  component: PulseBoard,
});
