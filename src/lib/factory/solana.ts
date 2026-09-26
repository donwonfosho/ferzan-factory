import { bufferReady } from "@/lib/factory/buffer-polyfill";
import { createServerFn } from "@tanstack/react-start";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { readSiteWallet } from "./site-wallet";
import { Buffer } from "buffer";

const RPC = "https://api.mainnet-beta.solana.com";
void bufferReady;

type SolanaRequest =
  | { method: "balance"; address: string }
  | { method: "prepare" }
  | { method: "block" }
  | { method: "rent"; size: number }
  | { method: "account"; address: string }
  | { method: "send"; raw: string; blockhash: string; lastValidBlockHeight: number }
  | { method: "holders"; mint: string };

export const solanaRelay = createServerFn({ method: "POST" })
  .validator((data: unknown): SolanaRequest => {
    if (!data || typeof data !== "object") throw new Error("Bad Solana request.");
    const row = data as Record<string, unknown>;
    if (row.method === "balance") {
      if (typeof row.address !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.address)) {
        throw new Error("Solana address looks wrong.");
      }
      return { method: "balance", address: row.address };
    }
    if (row.method === "prepare") return { method: "prepare" };
    if (row.method === "block") return { method: "block" };
    if (row.method === "rent") {
      if (typeof row.size !== "number" || !Number.isInteger(row.size) || row.size < 0 || row.size > 2_000_000) {
        throw new Error("Rent size looks wrong.");
      }
      return { method: "rent", size: row.size };
    }
    if (row.method === "account") {
      if (typeof row.address !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.address)) {
        throw new Error("Solana address looks wrong.");
      }
      return { method: "account", address: row.address };
    }
    if (row.method === "holders") {
      if (typeof row.mint !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.mint)) throw new Error("Mint looks wrong.");
      return { method: "holders", mint: row.mint };
    }
    if (row.method === "send") {
      if (typeof row.raw !== "string" || row.raw.length < 20 || row.raw.length > 8_000) throw new Error("Transaction looks wrong.");
      if (typeof row.blockhash !== "string" || row.blockhash.length < 32 || row.blockhash.length > 50) {
        throw new Error("Blockhash looks wrong.");
      }
      if (typeof row.lastValidBlockHeight !== "number" || !Number.isFinite(row.lastValidBlockHeight)) {
        throw new Error("Block height looks wrong.");
      }
      return { method: "send", raw: row.raw, blockhash: row.blockhash, lastValidBlockHeight: row.lastValidBlockHeight };
    }
    throw new Error("Bad Solana request.");
  })
  .handler(async ({ data }) => {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const rpc = new Connection(RPC, "confirmed");
    if (data.method === "balance") {
      const lamports = await rpc.getBalance(new PublicKey(data.address));
      return { lamports: lamports.toString() };
    }
    if (data.method === "prepare") {
      const { MINT_SIZE: mintSize } = await import("@solana/spl-token");
      const rent = await rpc.getMinimumBalanceForRentExemption(mintSize);
      const block = await rpc.getLatestBlockhash();
      return { lamports: rent, blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight };
    }
    if (data.method === "block") {
      const block = await rpc.getLatestBlockhash();
      return { blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight };
    }
    if (data.method === "rent") {
      const lamports = await rpc.getMinimumBalanceForRentExemption(data.size);
      return { lamports };
    }
    if (data.method === "account") {
      const info = await rpc.getAccountInfo(new PublicKey(data.address), "confirmed");
      if (!info) return { empty: true };
      return {
        empty: false,
        lamports: info.lamports,
        owner: info.owner.toBase58(),
        executable: info.executable,
        data: Buffer.from(info.data).toString("base64"),
      };
    }
    if (data.method === "holders") {
      const largest = await rpc.getTokenLargestAccounts(new PublicKey(data.mint));
      const keys = largest.value.map((row) => row.address);
      const infos = keys.length ? await rpc.getMultipleAccountsInfo(keys) : [];
      const rows = largest.value.map((row, index) => {
        const info = infos[index];
        const owner = info && info.data.length >= 64 ? new PublicKey(info.data.subarray(32, 64)).toBase58() : row.address.toBase58();
        return { address: owner, amount: row.amount };
      });
      return { holders: rows };
    }
    const signature = await rpc.sendRawTransaction(Buffer.from(data.raw, "base64"), { skipPreflight: false });
    const confirmed = await rpc.confirmTransaction(
      { signature, blockhash: data.blockhash, lastValidBlockHeight: data.lastValidBlockHeight },
      "confirmed",
    );
    if (confirmed.value.err) throw new Error("The Solana transaction failed.");
    return { signature };
  });

export function solanaExplorerTx(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

export function solanaExplorerMint(mint: string) {
  return `https://solscan.io/account/${mint}`;
}

export function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function seedOf(privateKey: string): Uint8Array {
  return Uint8Array.from(Buffer.from(privateKey.slice(2), "hex"));
}

export function keypairFromSite(privateKey: string): Keypair {
  return Keypair.fromSeed(seedOf(privateKey));
}

export function solanaSecret(): string | null {
  const site = readSiteWallet();
  if (!site) return null;
  return base58(keypairFromSite(site.privateKey).secretKey);
}

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
  if (!site) return null;
  return keypairFromSite(site.privateKey).publicKey.toBase58();
}

export async function solBalance(address: string): Promise<bigint> {
  const result = await solanaRelay({ data: { method: "balance", address } });
  if (!("lamports" in result) || typeof result.lamports !== "string") throw new Error("Solana balance looks wrong.");
  return BigInt(result.lamports);
}

function launchError(err: unknown, address: string): string {
  const msg = err instanceof Error ? err.message : "";
  if (/insufficient|debit|no record of a prior credit|lamports/i.test(msg)) {
    return `This Solana address needs SOL before it can launch. Send SOL to ${address}. It is not the ETH address.`;
  }
  return msg || "Solana rejected the launch.";
}

/** One signature: create the mint, mint the supply to the site wallet, revoke mint authority. */
export async function launchSolanaMint(input: {
  supplyWhole: bigint;
  decimals: number;
}): Promise<{ ok: true; mint: string; signature: string } | { ok: false; error: string }> {
  const site = readSiteWallet();
  if (!site) return { ok: false, error: "The browser wallet is not ready yet." };
  const payer = keypairFromSite(site.privateKey);
  const address = payer.publicKey.toBase58();
  try {
    if (input.decimals < 0 || input.decimals > 9) throw new Error("Solana mint decimals look wrong.");
    const raw = input.supplyWhole * 10n ** BigInt(input.decimals);
    if (raw <= 0n || raw >= 2n ** 64n) throw new Error("That supply does not fit a Solana mint.");
    const prepared = await solanaRelay({ data: { method: "prepare" } });
    if (!("blockhash" in prepared) || typeof prepared.blockhash !== "string" || typeof prepared.lamports !== "number") {
      throw new Error("Solana did not return a block.");
    }
    if (!("lastValidBlockHeight" in prepared) || typeof prepared.lastValidBlockHeight !== "number") {
      throw new Error("Solana did not return a block.");
    }
    const mint = Keypair.generate();
    const ata = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey);
    const tx = new Transaction({
      feePayer: payer.publicKey,
      blockhash: prepared.blockhash,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
    }).add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: prepared.lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mint.publicKey, input.decimals, payer.publicKey, null),
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mint.publicKey),
      createMintToInstruction(mint.publicKey, ata, payer.publicKey, raw),
      createSetAuthorityInstruction(mint.publicKey, payer.publicKey, AuthorityType.MintTokens, null),
    );
    tx.sign(payer, mint);
    const sent = await solanaRelay({
      data: {
        method: "send",
        raw: Buffer.from(tx.serialize()).toString("base64"),
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
      },
    });
    if (!("signature" in sent) || typeof sent.signature !== "string") throw new Error("Solana did not take the transaction.");
    return { ok: true, mint: mint.publicKey.toBase58(), signature: sent.signature };
  } catch (err) {
    return { ok: false, error: launchError(err, address) };
  }
}
