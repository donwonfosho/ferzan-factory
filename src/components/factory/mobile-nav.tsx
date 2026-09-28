import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { openSearch } from "./search";

import { tr } from "@/lib/i18n";
const I = {
  floor: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  pulse: <path d="M3 12h4l2.5-6 5 12L17 12h4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </>
  ),
  launch: <path d="M12 3c3 2.5 4.5 6 4.5 10l-2 3h-5l-2-3C7.5 9 9 5.5 12 3Zm-2.5 16.5L12 21l2.5-1.5M12 9.5v.01" />,
  me: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" />
    </>
  ),
};

function Icon({ d }: { d: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

const cls = (on: boolean) => cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", on ? "text-cyan" : "text-muted");

/** App-style tab bar on phones. */
export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md sm:hidden"
      aria-label={tr("Main")}
    >
      <Link to="/" className={cls(path === "/")}>
        <Icon d={I.floor} />
        {tr("Floor")}
      </Link>
      <Link to="/pulse" className={cls(path.startsWith("/pulse"))}>
        <Icon d={I.pulse} />
        {tr("Pulse")}
      </Link>
      <button type="button" onClick={() => openSearch()} className={cls(false)}>
        <Icon d={I.search} />
        {tr("Search")}
      </button>
      <Link to="/launch" search={{ kind: "curve" }} className={cls(path.startsWith("/launch"))}>
        <Icon d={I.launch} />
        {tr("Launch")}
      </Link>
      <Link to="/login" className={cls(path.startsWith("/login"))}>
        <Icon d={I.me} />
        {tr("Profile")}
      </Link>
    </nav>
  );
}
