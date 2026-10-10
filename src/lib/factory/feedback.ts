/**
 * Beta feedback and coin reports. Stored in our database.
 * Never stores a private key, a seed phrase, or a wallet address.
 * The coin field is the token being reported, which the report form asks for.
 * Server-only helpers are imported inside the handler so the browser can call this function.
 */
import { createServerFn } from "@tanstack/react-start";

const CATEGORY = new Set(["bug", "idea", "other", "scam", "impersonation", "offensive"]);
const COIN = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46}|T[1-9A-HJ-NP-Za-km-z]{33})$/;

function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function looksLikeSecret(text: string): boolean {
  if (/0x[a-fA-F0-9]{64}/.test(text)) return true;
  if (/\b[1-9A-HJ-NP-Za-km-z]{80,}\b/.test(text)) return true;
  const words = text.trim().toLowerCase().split(/\s+/);
  return words.length >= 12 && words.length <= 24 && words.every((word) => /^[a-z]{2,8}$/.test(word));
}

/** Drop wallet-shaped strings from free text. The coin field is stored separately. */
function redact(text: string): string {
  return text
    .replace(/0x[a-fA-F0-9]{40,64}/g, "[removed]")
    .replace(/[EUk]Q[A-Za-z0-9_-]{46}/g, "[removed]")
    .replace(/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g, "[removed]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,48}\b/g, "[removed]")
    .replace(/\s+/g, " ")
    .trim();
}

export const sendReport = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const kind = row.kind === "coin" ? "coin" : "feedback";
    const category = clean(row.category, 20);
    const message = clean(row.message, 1000);
    const contact = clean(row.contact, 40);
    const path = clean(row.path, 180);
    const version = clean(row.version, 40);
    const coin = clean(row.coin, 70);
    const company = clean(row.company, 80);
    if (!CATEGORY.has(category)) throw new Error("Pick a category.");
    if (kind === "coin" && !COIN.test(coin)) throw new Error("That coin address is not one we can send.");
    if (kind === "feedback" && coin) throw new Error("Pick a category.");
    return { kind, category, message, contact, path, version, coin, company };
  })
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { visitor } = await import("./guard.server");
    assertSameSiteRequest();
    if (data.company) return { ok: true as const };
    const blob = `${data.message}\n${data.contact}`;
    if (looksLikeSecret(blob)) throw new Error("Don't send keys or seed phrases.");
    const message = redact(data.message);
    const contact = redact(data.contact).replace(/\[removed\]/g, "").trim().slice(0, 40);
    if (message.length < 4) throw new Error("Write a short message.");
    const { createHash } = await import("node:crypto");
    const salt = process.env.FERZAN_INGEST_SECRET ?? "ferzan-feedback";
    const ip = visitor();
    const key = "fb:" + createHash("sha256").update(salt + "|" + (ip ?? "unknown")).digest("hex").slice(0, 32);
    const limit = ip ? 5 : 8;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const hour = Math.floor(Date.now() / 3_600_000);
    const rows = await sql<{ hits: number }>`
      insert into feedback_hits (key, hour, hits) values (${key}, ${hour}, 1)
      on conflict (key, hour) do update set hits = feedback_hits.hits + 1
      returning hits
    `;
    if (Math.random() < 0.02) await sql`delete from feedback_hits where hour < ${hour - 48}`;
    if ((rows[0]?.hits ?? 0) > limit) throw new Error("Too many reports from here. Wait and try again.");
    await sql`
      insert into feedback (kind, category, message, contact, path, version, coin)
      values (${data.kind}, ${data.category}, ${message}, ${contact}, ${redact(data.path).slice(0, 180)}, ${data.version}, ${data.kind === "coin" ? data.coin : ""})
    `;
    return { ok: true as const };
  });
