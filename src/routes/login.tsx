import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/factory/account-page";

export const Route = createFileRoute("/login")({
  component: AccountPage,
});
