import { PROOF_WINDOW_MS, proofDigest, proofMessage, type Proof, type ProofAction } from "./proof";

const SPKI_ED25519_PREFIX = "302a300506032b6570032100";

async function evmSigner(address: string, message: string, signature: string): Promise<boolean> {
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) return false;
  const { verifyMessage } = await import("viem");
  try {
    // Plain wallets only (ecrecover). Contract wallets would need an on-chain ERC-1271 call.
    return await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch {
    return false;
  }
}

async function solanaSigner(address: string, message: string, signature: string): Promise<boolean> {
  const { PublicKey } = await import("@solana/web3.js");
  const { createPublicKey, verify } = await import("node:crypto");
  try {
    const sig = Buffer.from(signature, "base64");
    if (sig.length !== 64) return false;
    const pub = Buffer.from(new PublicKey(address).toBytes());
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from(SPKI_ED25519_PREFIX, "hex"), pub]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(message, "utf8"), key, sig);
  } catch {
    return false;
  }
}

/**
 * Throws unless `proof` is a fresh, unused signature by `address` over exactly `fields`.
 * Call it in a handler before any write.
 */
export async function requireProof(
  action: ProofAction,
  address: string,
  fields: Record<string, string>,
  proof: Proof,
): Promise<void> {
  const age = Date.now() - proof.ts;
  if (age > PROOF_WINDOW_MS || age < -60_000) throw new Error("That signature expired. Try again.");
  const message = proofMessage(action, address, await proofDigest(fields), proof.ts);
  const ok = address.startsWith("0x")
    ? await evmSigner(address, message, proof.signature)
    : await solanaSigner(address, message, proof.signature);
  if (!ok) throw new Error("The signature does not match this wallet.");

  // One use per signature, so a captured request cannot be replayed.
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`delete from proof_sigs where created_at < now() - interval '15 minutes'`;
  const used = await sql<{ sig: string }>`
    insert into proof_sigs (sig) values (${proof.signature})
    on conflict (sig) do nothing
    returning sig
  `;
  if (!used[0]) throw new Error("That signature was already used. Try again.");
}
