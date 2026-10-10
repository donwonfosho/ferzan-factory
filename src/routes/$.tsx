import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw notFound();
  },
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      { title: "Page not found · Ferzan Factory" },
      { name: "description", content: "That page is not on Ferzan Factory." },
    ],
  }),
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">{tr("Page not found")}</h1>
      <p className="mt-3 text-muted">{tr("That page is not on Ferzan Factory.")}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link to="/" className="btn-cyan">
          {tr("Floor")}
        </Link>
        <Link to="/launch" search={{ kind: "curve" }} className="btn-line">
          {tr("Launch")}
        </Link>
        <Link to="/bots" className="btn-line">
          {tr("Bots")}
        </Link>
      </div>
    </div>
  );
}
