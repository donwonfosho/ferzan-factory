/**
 * Site languages: English (built in). 中文, Español, Português, Русский, Türkçe
 * and Tiếng Việt load on demand. Portuguese, Russian, Turkish and Vietnamese
 * are machine translated.
 * `tr("English text", ...args)` returns the text in the visitor's language; {0}, {1}… are filled from args.
 * The English text is the key, so anything without a translation simply shows in English.
 * The page first renders in English (server and first paint), then switches: see <LangRoot/>.
 */
import { useSyncExternalStore } from "react";

export type Lang = "en" | "zh" | "es" | "pt" | "ru" | "tr" | "vi";
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "zh", label: "中文", short: "中文" },
  { id: "es", label: "Español", short: "ES" },
  { id: "pt", label: "Português", short: "PT" },
  { id: "ru", label: "Русский", short: "RU" },
  { id: "tr", label: "Türkçe", short: "TR" },
  { id: "vi", label: "Tiếng Việt", short: "VI" },
];
const KEY = "ferzan-lang";

let current: Lang = "en";
let dict: Record<string, string> = {};
const subs = new Set<() => void>();

export function tr(key: string, ...args: (string | number | bigint | null | undefined)[]): string;
export function tr<T>(key: T): T;
export function tr(key: unknown, ...args: unknown[]): unknown {
  if (typeof key !== "string") return key; // labels that are elements or numbers pass through
  const s = current === "en" ? key : (dict[key] ?? dict[key.trim()] ?? key);
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? "")) : s;
}

export function getLang(): Lang {
  return current;
}

async function loadDict(lang: Lang): Promise<Record<string, string>> {
  if (lang === "zh") return (await import("./zh")).default;
  if (lang === "es") return (await import("./es")).default;
  if (lang === "pt") return (await import("./pt")).default;
  if (lang === "ru") return (await import("./ru")).default;
  if (lang === "tr") return (await import("./tr")).default;
  if (lang === "vi") return (await import("./vi")).default;
  return {};
}

/** Switch language (loads the dictionary first, then re-renders the whole site). */
export async function setLang(lang: Lang, remember = true): Promise<void> {
  const next = await loadDict(lang).catch(() => ({}));
  current = lang;
  dict = next;
  if (typeof document !== "undefined") document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  if (remember) {
    try {
      window.localStorage.setItem(KEY, lang);
    } catch {
      /* not remembered, still switched */
    }
  }
  subs.forEach((fn) => fn());
}

const LANG_IDS: readonly Lang[] = ["en", "zh", "es", "pt", "ru", "tr", "vi"];

function asLang(value: string | null | undefined): Lang | null {
  return LANG_IDS.find((id) => id === value) ?? null;
}

/** The saved choice, else the browser's language, else English. */
export function preferredLang(): Lang {
  try {
    const saved = asLang(window.localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const nav = (typeof navigator !== "undefined" ? navigator.languages?.[0] || navigator.language : "") || "";
  const code = nav.toLowerCase().split("-")[0];
  return asLang(code) ?? "en";
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => current,
    () => "en" as Lang,
  );
}
