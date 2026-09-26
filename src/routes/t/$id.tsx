import { createFileRoute } from "@tanstack/react-router";
import { TokenView } from "@/components/factory/token-view";

export const Route = createFileRoute("/t/$id")({
  component: TokenRoute,
});

function TokenRoute() {
  const { id } = Route.useParams();
  return <TokenView id={id} />;
}
