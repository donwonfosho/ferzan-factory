/**
 * Wallet proofs for writes that claim an address (profiles, thread posts).
 * The wallet signs a short readable message that binds the action, the address,
 * a hash of exactly what is being saved, and the time. Shared by browser and server.
 */

export type ProofAction = "profile" | "post";

export type Proof = { ts: number; signature: string };

/** How long a signature stays valid. */
export const PROOF_WINDOW_MS = 5 * 60 * 1000;

/** EVM addresses are case-insensitive, so both sides sign and check the lowercase spelling. */
export function proofAddress(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256 over the fields in a fixed key order, so browser and server get the same digest. */
export async function proofDigest(fields: Record<string, string>): Promise<string> {
  const ordered = Object.keys(fields)
    .sort()
    .map((key) => [key, fields[key]]);
  const bytes = new TextEncoder().encode(JSON.stringify(ordered));
  return hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

export function proofMessage(action: ProofAction, address: string, digest: string, ts: number): string {
  return [
    "Ferzan Factory",
    `Action: ${action}`,
    `Wallet: ${proofAddress(address)}`,
    `Content: ${digest}`,
    `Time: ${ts}`,
    "This signature only proves the wallet. It does not move funds.",
  ].join("\n");
}

/** Post body exactly as the server stores it. Client signs this same text. */
export function postBody(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Profile fields exactly as the server stores them. Client signs these same values. */
export function profileFields(input: { name: string; bio: string; image: string }): { name: string; bio: string; image: string } {
  const image = input.image.startsWith("data:image/") && input.image.length <= 200_000 ? input.image : "";
  return { name: input.name.trim().slice(0, 24), bio: input.bio.trim().slice(0, 80), image };
}

/** Validator helper: pull a proof out of a request body or throw. */
export function readProof(value: unknown): Proof {
  if (!value || typeof value !== "object") throw new Error("Sign with your wallet first.");
  const row = value as Record<string, unknown>;
  const ts = row.ts;
  const signature = row.signature;
  if (typeof ts !== "number" || !Number.isSafeInteger(ts)) throw new Error("Signature time looks wrong.");
  if (typeof signature !== "string" || signature.length < 40 || signature.length > 200) {
    throw new Error("Signature looks wrong.");
  }
  return { ts, signature };
}
