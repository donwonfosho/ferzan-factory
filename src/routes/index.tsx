import { createFileRoute } from "@tanstack/react-router";
import { Floor } from "@/components/factory/floor";

export const Route = createFileRoute("/")({
  component: Floor,
});
