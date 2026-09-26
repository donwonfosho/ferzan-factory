import { createFileRoute } from "@tanstack/react-router";
import { PublicProfile } from "@/components/factory/public-profile";

export const Route = createFileRoute("/p/$address")({
  component: ProfileRoute,
});

function ProfileRoute() {
  const { address } = Route.useParams();
  return <PublicProfile address={address} />;
}
