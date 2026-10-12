import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { openSearch } from "@/components/factory/search";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw notFound();
  },
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      { title: "That page isn't here · Ferzan Factory" },
      { name: "description", content: "That page isn't on Ferzan Factory. Search for a coin, or go to Home, Pulse or Launch." },
    ],
  }),
  component: NotFoundPage,
});

export function NotFoundPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <div className="term-page mx-auto max-w-lg">
      <div className="term-card">
        <p className="term-label">404</p>
        <h1 className="mt-2 text-4xl text-[#f4f7f7]">{tr("That page isn't here")}</h1>
        <p className="mt-3 text-sm text-[#93a4a7]">{tr("Search for a coin, or pick a page that is.")}</p>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            openSearch(true, term);
            void router.navigate({ to: "/" });
          }}
        >
          <label className="term-label" htmlFor="miss-search">{tr("Search coins")}</label>
          <div className="mt-2 flex gap-2">
            <input
              id="miss-search"
              className="min-w-0 flex-1 bg-[#111c40] px-3 text-[#f4f7f7]"
              value={q}
              placeholder={tr("Name, ticker, or address")}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="submit" className="btn-cyan shrink-0">{tr("Search")}</button>
          </div>
        </form>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link to="/" className="btn-cyan">{tr("Home")}</Link>
          <Link to="/pulse" className="btn-line">{tr("Pulse")}</Link>
          <Link to="/launch" search={{ kind: "curve" }} className="btn-line">{tr("Launch")}</Link>
        </div>
      </div>
    </div>
  );
}
