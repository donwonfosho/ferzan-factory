import { createFileRoute } from "@tanstack/react-router";
import { CreatorPage } from "@/components/factory/creator-page";

export const Route = createFileRoute("/creator/$wallet")({
  component: CreatorRoute,
});

function CreatorRoute() {
  const { wallet } = Route.useParams();
  return <CreatorPage wallet={wallet} />;
}
