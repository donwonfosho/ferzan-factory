import { useEffect, useSyncExternalStore } from "react";
import { accountWallets, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { dropFollow, listFollows, putFollow } from "@/lib/factory/follows";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

const KEY = "ferzan-follows";
const CREATOR = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|T[1-9A-HJ-NP-Za-km-z]{33}|EQ[A-Za-z0-9_-]{46})$/;
let list: string[] = [];
let loaded = false;
const subs = new Set<() => void>();

export function sameCreator(a: string, b: string): boolean {
  if (a.startsWith("0x") || a.startsWith("0X") || b.startsWith("0x") || b.startsWith("0X")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function norm(value: string): string | null {
  const raw = value.trim();
  if (!CREATOR.test(raw)) return null;
  return raw.startsWith("0x") || raw.startsWith("0X") ? raw.toLowerCase() : raw;
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]") as unknown;
    list = (Array.isArray(raw) ? raw : []).map((item) => (typeof item === "string" ? norm(item) : null)).filter((item): item is string => Boolean(item)).slice(0, 200);
  } catch {
    list = [];
  }
}

function save(next: string[], sync = true) {
  const prev = list;
  const seen = new Set<string>();
  list = [];
  for (const item of next) {
    const id = norm(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
    if (list.length >= 200) break;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* kept for this visit */
  }
  subs.forEach((fn) => fn());
  if (sync) void pushDiff(prev, list);
}

async function pushDiff(prev: string[], next: string[]) {
  const account = accountWallets();
  if (!account?.authenticated) return;
  const token = await account.identityToken();
  if (!token) return;
  for (const creator of next) {
    if (prev.some((item) => sameCreator(item, creator))) continue;
    await putFollow({ data: { token, creator } }).catch(() => undefined);
  }
  for (const creator of prev) {
    if (next.some((item) => sameCreator(item, creator))) continue;
    await dropFollow({ data: { token, creator } }).catch(() => undefined);
  }
}

export function FollowSync() {
  const account = useAccountWallets();
  const id = account?.userId ?? "";
  useEffect(() => {
    if (!id) return;
    let stop = false;
    void (async () => {
      const live = accountWallets();
      const token = live ? await live.identityToken() : null;
      if (!token || stop) return;
      const remote = await listFollows({ data: { token } }).catch(() => [] as string[]);
      if (stop) return;
      load();
      const merged = [...list];
      for (const creator of remote) {
        if (!merged.some((item) => sameCreator(item, creator))) merged.push(creator);
      }
      save(merged.slice(0, 200), false);
      for (const creator of merged) {
        if (remote.some((item) => sameCreator(item, creator))) continue;
        await putFollow({ data: { token, creator } }).catch(() => undefined);
      }
    })();
    return () => {
      stop = true;
    };
  }, [id]);
  return null;
}

export function useFollows(): string[] {
  return useSyncExternalStore(
    (fn) => {
      load();
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => (load(), list),
    () => [],
  );
}

export function FollowButton({ creator }: { creator: string }) {
  const follows = useFollows();
  const on = follows.some((item) => sameCreator(item, creator));
  return (
    <button
      type="button"
      className={cn(on ? "btn-line" : "btn-cyan")}
      onClick={() => save(on ? follows.filter((item) => !sameCreator(item, creator)) : [...follows, creator])}
    >
      {on ? tr("Following") : tr("Follow")}
    </button>
  );
}
