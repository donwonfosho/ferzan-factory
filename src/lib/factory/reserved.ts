/**
 * The only name nobody may list is FERZAN, lookalikes included.
 * Any other name or ticker is fine (ETH, USDC, SOL, TON included).
 * The official FERZAN is added by the trusted ingest feed, never through this check.
 */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", $: "s", "@": "a", "!": "i" };
const BRAND = "ferzan";

function norm(s: string): string {
  return s.toLowerCase().replace(/[01345 7$@!]/g, (c) => LEET[c] ?? "").replace(/[^a-z]/g, "");
}

function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const d: number[] = [];
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d.push(i);
    return d.length === 1 || (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]]);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i += 1) if (l.slice(0, i) + l.slice(i + 1) === s) return true;
  return false;
}

/** Why this name/ticker may not be listed, or "" when it is fine. */
export function reservedProblem(name: string, symbol: string): string {
  for (const field of [name, symbol]) {
    const n = norm(field);
    if (!n) continue;
    if (n.includes(BRAND)) return "That name looks like Ferzan's own token. Pick another name.";
    for (let i = 0; i < Math.max(1, n.length - 4); i += 1) {
      for (const w of [5, 6, 7]) if (close(n.slice(i, i + w), BRAND)) return "That name looks like Ferzan's own token. Pick another name.";
    }
  }
  return "";
}
