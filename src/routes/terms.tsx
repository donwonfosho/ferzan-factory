import { createFileRoute } from "@tanstack/react-router";
import { TermsBody } from "@/components/factory/terms";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-4xl">Terms</h1>
      <p className="mt-3 text-muted">The rules for using Ferzan Factory.</p>
      <div className="mt-8">
        <TermsBody />
      </div>
    </div>
  );
}
