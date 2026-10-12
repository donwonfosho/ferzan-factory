import { createFileRoute } from "@tanstack/react-router";
import { PrivacyBody } from "@/components/factory/privacy";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Ferzan Factory" },
      { name: "description", content: "How Ferzan Factory handles personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-4xl">{tr("Privacy Policy")}</h1>
      <p className="mt-3 text-muted">{tr("How Ferzan Factory handles personal data.")}</p>
      <div className="mt-8">
        <PrivacyBody />
      </div>
    </div>
  );
}
