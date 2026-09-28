import { createFileRoute } from "@tanstack/react-router";
import { TermsBody } from "@/components/factory/terms";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-4xl">{tr("Terms")}</h1>
      <p className="mt-3 text-muted">{tr("The rules for using Ferzan Factory.")}</p>
      <div className="mt-8">
        <TermsBody />
      </div>
    </div>
  );
}
