export function parseWhole(text: string): bigint | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+$/.test(t) || t === "0" || t.length > 15) return null;
  return BigInt(t);
}

export function parseDecimal(text: string, decimals: number): bigint | null {
  let t = text.trim().replace(/,/g, "");
  if (t.startsWith(".")) t = `0${t}`;
  if (t.endsWith(".")) t = t.slice(0, -1);
  if (t === "" || t === "0" || /^0\.0+$/.test(t)) return 0n;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function formatUnits(value: bigint, decimals: number, maxFrac = 4): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFrac);
  frac = frac.replace(/0+$/, "");
  const body = frac ? `${whole.toString()}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function formatSmart(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const maxFrac = value > 0n && value < base / 100n ? 6 : 4;
  return formatUnits(value, decimals, maxFrac);
}

export function compactWhole(whole: string): string {
  const n = Number(whole);
  if (!Number.isFinite(n)) return whole;
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US");
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";

function sub(n: number): string {
  return String(n)
    .split("")
    .map((digit) => SUB[Number(digit)] ?? digit)
    .join("");
}

/** Plain number for storage and charts. Display still goes through formatPrice. */
export function priceWire(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toPrecision(12);
}

/** Read a stored price, including the older 0.0₈125 form. */
export function parsePrice(text: string): number | null {
  const t = text.trim();
  if (!t || t === "—") return null;
  const direct = Number(t.replace(/,/g, ""));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const mark = t.match(/^0\.0([₀₁₂₃₄₅₆₇₈₉]+)(\d+)$/);
  if (!mark) return null;
  const zeros = Number([...mark[1]].map((ch) => "₀₁₂₃₄₅₆₇₈₉".indexOf(ch)).join(""));
  if (!Number.isInteger(zeros) || zeros < 2 || zeros > 24) return null;
  const n = Number(`0.${"0".repeat(zeros)}${mark[2]}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function formatPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 0.0001) {
    const digits = n >= 0.01 ? 4 : 6;
    return n.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
  }
  const frac = n.toFixed(18).split(".")[1]?.replace(/0+$/, "") ?? "";
  const zeros = frac.match(/^0*/)?.[0].length ?? 0;
  const rest = frac.slice(zeros).slice(0, 4);
  if (!rest) return "—";
  if (zeros >= 2) return `0.0${sub(zeros)}${rest}`;
  return `0.${frac.slice(0, 6)}`;
}

/** Dollar price of one token, written like formatPrice (0.0₇28 style for tiny prices), never 2.8e-8. "" when unknown. */
export function formatUsdPrice(priceNative: number, nativeUsd: number): string {
  const n = priceNative * nativeUsd;
  if (!Number.isFinite(n) || n <= 0) return "";
  const text = formatPrice(n);
  return text === "—" ? "" : `$${text}`;
}

/** How many tokens one native unit buys at the spot price. */
export function formatTokensPerNative(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  const tokens = 1 / price;
  if (!Number.isFinite(tokens) || tokens <= 0) return "—";
  if (tokens >= 100) return Math.round(tokens).toLocaleString("en-US");
  if (tokens >= 1) return tokens.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return formatPrice(tokens);
}

export function formatWhen(ms: number): string {
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} · ${hh}:${mm} UTC`;
}

export function bpsLabel(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}
