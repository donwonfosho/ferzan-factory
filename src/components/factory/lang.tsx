import { Fragment, useEffect, type ReactNode } from "react";
import { LANGS, preferredLang, setLang, useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/** Renders the site in English first (matches the server), then switches to the visitor's language and
 * re-mounts the page so every text on it is re-read in that language. */
export function LangRoot({ children }: { children: ReactNode }) {
  const lang = useLang();
  useEffect(() => {
    const want = preferredLang();
    if (want !== "en") void setLang(want, false);
  }, []);
  return <Fragment key={lang}>{children}</Fragment>;
}

export function LangPicker({ className }: { className?: string }) {
  const lang = useLang();
  return (
    <label className={cn("relative inline-flex min-h-10 items-center rounded-lg px-2 text-sm text-muted shadow-border hover:text-fg", className)}>
      <span aria-hidden className="mr-1">
        🌐
      </span>
      <select
        value={lang}
        onChange={(e) => void setLang(e.target.value as Lang)}
        className="cursor-pointer appearance-none bg-transparent pr-1 font-semibold outline-none"
        aria-label="Language"
      >
        {LANGS.map((l) => (
          <option key={l.id} value={l.id} className="bg-bg text-fg">
            {l.short}
          </option>
        ))}
      </select>
    </label>
  );
}
