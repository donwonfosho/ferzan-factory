/**
 * Site-wallet Solana address without @solana/web3.js.
 * Same derivation as Keypair.fromSeed: ed25519 public key of the 32-byte seed, base58.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { readSiteWallet } from "./site-wallet";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += BASE58[digits[i]] ?? "";
  return out;
}

export function solanaAddress(): string | null {
  const site = readSiteWallet();
  if (!site || !/^0x[a-fA-F0-9]{64}$/.test(site.privateKey)) return null;
  const hex = site.privateKey.slice(2);
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) seed[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return base58(ed25519.getPublicKey(seed));
}
