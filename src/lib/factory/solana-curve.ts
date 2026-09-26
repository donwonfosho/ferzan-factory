import { createServerFn } from "@tanstack/react-start";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Buffer } from "buffer";
import { TREASURY } from "./catalog";
import { keypairFromSite, solanaRelay } from "./solana";
import { readSiteWallet } from "./site-wallet";
import { bufferReady } from "./buffer-polyfill";

void bufferReady;

export const SOLANA_PROGRAM_ID = new PublicKey("G7n5XBB7pjvKS7JfC6esgQGGAyPku5cposdiHfVAUxnJ");
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TREASURY_SOL = new PublicKey(TREASURY.sol);
const CHUNK = 700;
const CPMM = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const CPMM_CONFIG = new PublicKey("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");
const CPMM_FEE = new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8");
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

export async function migrateSolanaCurve(mintAddress: string): Promise<{ ok: true; signature: string; pool: string } | { ok: false; error: string }> {
  const who = payerOf();
  if ("error" in who) return { ok: false, error: who.error };
  try {
    const mint = new PublicKey(mintAddress);
    const curve = curveAddress(mint);
    const state = await readSolanaCurve(mintAddress);
    if (!state) return { ok: false, error: "This Solana mint has no curve." };
    if (!state.graduated) return { ok: false, error: "The curve has not filled yet." };
    if (state.pooled) return { ok: false, error: "This curve already opened a Raydium pool." };
    const [token0, token1] = mint.toBuffer().compare(WSOL.toBuffer()) < 0 ? [mint, WSOL] : [WSOL, mint];
    const pool = PublicKey.findProgramAddressSync([Buffer.from("pool"), CPMM_CONFIG.toBuffer(), token0.toBuffer(), token1.toBuffer()], CPMM)[0];
    const authority = PublicKey.findProgramAddressSync([Buffer.from("vault_and_lp_mint_auth_seed")], CPMM)[0];
    const lpMint = PublicKey.findProgramAddressSync([Buffer.from("pool_lp_mint"), pool.toBuffer()], CPMM)[0];
    const vault0 = PublicKey.findProgramAddressSync([Buffer.from("pool_vault"), pool.toBuffer(), token0.toBuffer()], CPMM)[0];
    const vault1 = PublicKey.findProgramAddressSync([Buffer.from("pool_vault"), pool.toBuffer(), token1.toBuffer()], CPMM)[0];
    const observation = PublicKey.findProgramAddressSync([Buffer.from("observation"), pool.toBuffer()], CPMM)[0];
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 })).add(
      new TransactionInstruction({
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: who.payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: curve, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: getAssociatedTokenAddressSync(mint, curve, true), isSigner: false, isWritable: true },
          { pubkey: WSOL, isSigner: false, isWritable: false },
          { pubkey: getAssociatedTokenAddressSync(WSOL, curve, true), isSigner: false, isWritable: true },
          { pubkey: CPMM_CONFIG, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: false, isWritable: false },
          { pubkey: pool, isSigner: false, isWritable: true },
          { pubkey: token0, isSigner: false, isWritable: false },
          { pubkey: token1, isSigner: false, isWritable: false },
          { pubkey: lpMint, isSigner: false, isWritable: true },
          { pubkey: getAssociatedTokenAddressSync(token0, curve, true), isSigner: false, isWritable: true },
          { pubkey: getAssociatedTokenAddressSync(token1, curve, true), isSigner: false, isWritable: true },
          { pubkey: getAssociatedTokenAddressSync(lpMint, curve, true), isSigner: false, isWritable: true },
          { pubkey: vault0, isSigner: false, isWritable: true },
          { pubkey: vault1, isSigner: false, isWritable: true },
          { pubkey: CPMM_FEE, isSigner: false, isWritable: true },
          { pubkey: observation, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey(state.creator), isSigner: false, isWritable: false },
          { pubkey: getAssociatedTokenAddressSync(lpMint, new PublicKey(state.creator), true), isSigner: false, isWritable: true },
        ],
        data: Buffer.from([3]),
      }),
    );
    const signature = await send(tx, who.payer);
    return { ok: true, signature, pool: pool.toBase58() };
  } catch (err) {
    return { ok: false, error: solanaError(err, who.address) };
  }
}

export type SolanaCurve = {
  creator: string;
  mint: string;
  virtualSol: bigint;
  virtualToken: bigint;
  graduation: bigint;
  maxBuy: bigint;
  startAt: bigint;
  realSol: bigint;
  raisedSol: bigint;
  tokensSold: bigint;
  graduated: boolean;
  pooled: boolean;
  decimals: number;
};

type Block = { blockhash: string; lastValidBlockHeight: number };

export function curveAddress(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("curve"), mint.toBuffer()], SOLANA_PROGRAM_ID)[0];
}

function boughtAddress(curve: PublicKey, buyer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("bought"), curve.toBuffer(), buyer.toBuffer()], SOLANA_PROGRAM_ID)[0];
}

function u64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function readU64(buf: Buffer, at: number): bigint {
  return buf.readBigUInt64LE(at);
}

async function block(): Promise<Block> {
  const row = await solanaRelay({ data: { method: "block" } });
  if (!("blockhash" in row) || typeof row.blockhash !== "string" || typeof row.lastValidBlockHeight !== "number") {
    throw new Error("Solana did not return a block.");
  }
  return { blockhash: row.blockhash, lastValidBlockHeight: row.lastValidBlockHeight };
}

async function send(tx: Transaction, payer: Keypair, extra: Keypair[] = []): Promise<string> {
  const recent = await block();
  tx.recentBlockhash = recent.blockhash;
  tx.lastValidBlockHeight = recent.lastValidBlockHeight;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, ...extra);
  const sent = await solanaRelay({
    data: {
      method: "send",
      raw: Buffer.from(tx.serialize()).toString("base64"),
      blockhash: recent.blockhash,
      lastValidBlockHeight: recent.lastValidBlockHeight,
    },
  });
  if (!("signature" in sent) || typeof sent.signature !== "string") throw new Error("Solana did not take the transaction.");
  return sent.signature;
}

async function account(address: PublicKey): Promise<{ empty: true } | { empty: false; data: Buffer; executable: boolean; owner: string }> {
  const row = await solanaRelay({ data: { method: "account", address: address.toBase58() } });
  if ("empty" in row && row.empty === true) return { empty: true };
  if (!("data" in row) || typeof row.data !== "string") throw new Error("Solana did not return the account.");
  return {
    empty: false,
    data: Buffer.from(row.data, "base64"),
    executable: "executable" in row && row.executable === true,
    owner: "owner" in row && typeof row.owner === "string" ? row.owner : "",
  };
}

export async function readSolanaCurve(mint: string): Promise<SolanaCurve | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  const curve = curveAddress(new PublicKey(mint));
  const info = await account(curve);
  if (info.empty || info.data.length < 172 || info.data[0] !== 1) return null;
  const raw = info.data;
  return {
    creator: new PublicKey(raw.subarray(1, 33)).toBase58(),
    mint: new PublicKey(raw.subarray(65, 97)).toBase58(),
    virtualSol: readU64(raw, 97),
    virtualToken: readU64(raw, 105),
    graduation: readU64(raw, 113),
    maxBuy: readU64(raw, 121),
    startAt: readU64(raw, 129),
    realSol: readU64(raw, 137),
    raisedSol: readU64(raw, 145),
    tokensSold: readU64(raw, 153),
    graduated: raw[161] !== 0,
    pooled: raw[161] === 2,
    decimals: raw[163],
  };
}

export async function readSolanaHeld(mint: string, owner: string): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true);
  const info = await account(ata);
  if (info.empty || info.data.length < 72) return 0n;
  return readU64(info.data, 64);
}

function createAtaIx(payer: PublicKey, owner: PublicKey, mint: PublicKey) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  return {
    ata,
    ix: new TransactionInstruction({
      programId: ATA_PROGRAM,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    }),
  };
}

function payerOf(): { payer: Keypair; address: string } | { error: string } {
  const site = readSiteWallet();
  if (!site) return { error: "Create a wallet on Account before you use Solana." };
  const payer = keypairFromSite(site.privateKey);
  return { payer, address: payer.publicKey.toBase58() };
}

export async function launchSolanaCurve(input: {
  name: string;
  symbol: string;
  supplyRaw: bigint;
  decimals: number;
  virtualSol: bigint;
  virtualToken: bigint;
  graduation: bigint;
  maxBuy: bigint;
  delaySeconds: bigint;
  devBuy: bigint;
  onStatus?: (message: string) => void;
}): Promise<{ ok: true; mint: string; signature: string } | { ok: false; error: string }> {
  const who = payerOf();
  if ("error" in who) return { ok: false, error: who.error };
  try {
    input.onStatus?.("Checking the Solana curve program.");
    const ready = await ensureProgram(who.payer, input.onStatus);
    if (!ready.ok) return ready;
    if (input.supplyRaw <= 0n || input.supplyRaw >= 2n ** 64n) return { ok: false, error: "That supply does not fit a Solana mint." };
    const mint = Keypair.generate();
    const curve = curveAddress(mint.publicKey);
    const vault = getAssociatedTokenAddressSync(mint.publicKey, curve, true);
    const creatorAta = getAssociatedTokenAddressSync(mint.publicKey, who.payer.publicKey, true);
    const data = Buffer.concat([
      Buffer.from([0]),
      u64(input.virtualSol),
      u64(input.virtualToken),
      u64(input.graduation),
      u64(input.maxBuy),
      u64(input.delaySeconds),
      u64(input.supplyRaw),
      Buffer.from([input.decimals]),
    ]);
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })).add(
      new TransactionInstruction({
      programId: SOLANA_PROGRAM_ID,
      keys: [
        { pubkey: who.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: curve, isSigner: false, isWritable: true },
        { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: creatorAta, isSigner: false, isWritable: true },
        { pubkey: TREASURY_SOL, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
      ],
      data,
    }),
    );
    input.onStatus?.("Signing the Solana coin.");
    const signature = await send(tx, who.payer, [mint]);
    if (input.devBuy > 0n) {
      input.onStatus?.("Buying the first slice.");
      const bought = await buySolanaCurve({ mint: mint.publicKey.toBase58(), solIn: input.devBuy, minOut: 0n, referrer: "" });
      if (!bought.ok) return { ok: false, error: `The coin exists at ${mint.publicKey.toBase58()}, but the first buy failed. ${bought.error}` };
    }
    return { ok: true, mint: mint.publicKey.toBase58(), signature };
  } catch (err) {
    return { ok: false, error: solanaError(err, who.address) };
  }
}

export async function buySolanaCurve(input: {
  mint: string;
  solIn: bigint;
  minOut: bigint;
  referrer: string;
}): Promise<{ ok: true; signature: string } | { ok: false; error: string }> {
  const who = payerOf();
  if ("error" in who) return { ok: false, error: who.error };
  try {
    const mint = new PublicKey(input.mint);
    const curve = curveAddress(mint);
    const state = await readSolanaCurve(input.mint);
    if (!state) return { ok: false, error: "This Solana mint has no curve." };
    const creator = new PublicKey(state.creator);
    const referrer = input.referrer ? new PublicKey(input.referrer) : TREASURY_SOL;
    const ata = createAtaIx(who.payer.publicKey, who.payer.publicKey, mint);
    const data = Buffer.concat([Buffer.from([1]), u64(input.solIn), u64(input.minOut)]);
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })).add(ata.ix).add(
      new TransactionInstruction({
      programId: SOLANA_PROGRAM_ID,
      keys: [
        { pubkey: who.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: curve, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: getAssociatedTokenAddressSync(mint, curve, true), isSigner: false, isWritable: true },
        { pubkey: ata.ata, isSigner: false, isWritable: true },
        { pubkey: creator, isSigner: false, isWritable: true },
        { pubkey: TREASURY_SOL, isSigner: false, isWritable: true },
        { pubkey: referrer, isSigner: false, isWritable: true },
        { pubkey: boughtAddress(curve, who.payer.publicKey), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
    );
    const signature = await send(tx, who.payer);
    return { ok: true, signature };
  } catch (err) {
    return { ok: false, error: solanaError(err, who.address) };
  }
}

export async function sellSolanaCurve(input: {
  mint: string;
  tokenIn: bigint;
  minOut: bigint;
}): Promise<{ ok: true; signature: string } | { ok: false; error: string }> {
  const who = payerOf();
  if ("error" in who) return { ok: false, error: who.error };
  try {
    const mint = new PublicKey(input.mint);
    const curve = curveAddress(mint);
    const state = await readSolanaCurve(input.mint);
    if (!state) return { ok: false, error: "This Solana mint has no curve." };
    const data = Buffer.concat([Buffer.from([2]), u64(input.tokenIn), u64(input.minOut)]);
    const tx = new Transaction().add(
      new TransactionInstruction({
      programId: SOLANA_PROGRAM_ID,
      keys: [
        { pubkey: who.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: curve, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: getAssociatedTokenAddressSync(mint, curve, true), isSigner: false, isWritable: true },
        { pubkey: getAssociatedTokenAddressSync(mint, who.payer.publicKey, true), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(state.creator), isSigner: false, isWritable: true },
        { pubkey: TREASURY_SOL, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      ],
      data,
    }),
    );
    const signature = await send(tx, who.payer);
    return { ok: true, signature };
  } catch (err) {
    return { ok: false, error: solanaError(err, who.address) };
  }
}

async function ensureProgram(payer: Keypair, onStatus?: (message: string) => void): Promise<{ ok: true } | { ok: false; error: string }> {
  const info = await account(SOLANA_PROGRAM_ID);
  if (!info.empty && info.executable) return { ok: true };
  onStatus?.("Deploying the Solana curve once. This spends about 1 SOL and cannot be skipped.");
  const response = await fetch("/ferzan-curve.so");
  if (!response.ok) return { ok: false, error: "The Solana program file is missing." };
  const elf = Buffer.from(await response.arrayBuffer());
  const buffer = Keypair.generate();
  const space = 37 + elf.length;
  const rentRow = await solanaRelay({ data: { method: "rent", size: space } });
  if (!("lamports" in rentRow) || typeof rentRow.lamports !== "number") return { ok: false, error: "Solana did not return the rent." };
  await send(
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: buffer.publicKey,
        lamports: rentRow.lamports,
        space,
        programId: LOADER,
      }),
    ),
    payer,
    [buffer],
  );
  await send(
    new Transaction().add(
      new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([0, 0, 0, 0]),
    })),
    payer,
  );
  for (let offset = 0; offset < elf.length; offset += CHUNK) {
    const bytes = elf.subarray(offset, offset + CHUNK);
    const data = Buffer.alloc(16 + bytes.length);
    data.writeUInt32LE(1, 0);
    data.writeUInt32LE(offset, 4);
    data.writeBigUInt64LE(BigInt(bytes.length), 8);
    bytes.copy(data, 16);
    onStatus?.(`Writing the Solana program ${Math.min(elf.length, offset + CHUNK)} / ${elf.length}.`);
    await send(
      new Transaction().add(
        new TransactionInstruction({
        programId: LOADER,
        keys: [
          { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        ],
        data,
      })),
      payer,
    );
  }
  const signed = await signSolanaDeploy({ data: { buffer: buffer.publicKey.toBase58(), payer: payer.publicKey.toBase58() } });
  const tx = Transaction.from(Buffer.from(signed.raw, "base64"));
  tx.partialSign(payer);
  const sent = await solanaRelay({
    data: {
      method: "send",
      raw: Buffer.from(tx.serialize()).toString("base64"),
      blockhash: signed.blockhash,
      lastValidBlockHeight: signed.lastValidBlockHeight,
    },
  });
  if (!("signature" in sent)) return { ok: false, error: "Solana did not deploy the program." };
  const programData = PublicKey.findProgramAddressSync([SOLANA_PROGRAM_ID.toBuffer()], LOADER)[0];
  await send(
    new Transaction().add(
      new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([4, 0, 0, 0]),
    })),
    payer,
  );
  await send(
    new Transaction().add(
      new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([5, 0, 0, 0]),
    })),
    payer,
  );
  return { ok: true };
}

const signSolanaDeploy = createServerFn({ method: "POST" })
  .validator((data: unknown): { buffer: string; payer: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad deploy.");
    const row = data as Record<string, unknown>;
    if (typeof row.buffer !== "string" || typeof row.payer !== "string") throw new Error("Bad deploy.");
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.buffer) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.payer)) {
      throw new Error("Bad deploy.");
    }
    return { buffer: row.buffer, payer: row.payer };
  })
  .handler(async ({ data }) => {
    const { Connection, Keypair: SolKey, PublicKey: SolKeyPub, Transaction: SolTx, TransactionInstruction: SolIx, SystemProgram: SolSystem, SYSVAR_CLOCK_PUBKEY: Clock, SYSVAR_RENT_PUBKEY: Rent } =
      await import("@solana/web3.js");
    const { readFile } = await import("node:fs/promises");
    const secret = Uint8Array.from(JSON.parse(await readFile("contracts/solana/ferzan-curve-keypair.json", "utf8")) as number[]);
    const program = SolKey.fromSecretKey(secret);
    if (program.publicKey.toBase58() !== "G7n5XBB7pjvKS7JfC6esgQGGAyPku5cposdiHfVAUxnJ") {
      throw new Error("The program key does not match.");
    }
    const elf = await readFile("public/ferzan-curve.so");
    const rpc = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    const buffer = new SolKeyPub(data.buffer);
    const info = await rpc.getAccountInfo(buffer, "confirmed");
    if (!info || info.data.length !== 37 + elf.length || !info.data.subarray(37).equals(elf)) {
      throw new Error("The uploaded program does not match this site.");
    }
    const loader = new SolKeyPub("BPFLoaderUpgradeab1e11111111111111111111111");
    const [programData] = SolKeyPub.findProgramAddressSync([program.publicKey.toBuffer()], loader);
    const payer = new SolKeyPub(data.payer);
    const body = Buffer.alloc(12);
    body.writeUInt32LE(2, 0);
    body.writeBigUInt64LE(BigInt(elf.length), 4);
    const tx = new SolTx().add(
      new SolIx({
      programId: loader,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: program.publicKey, isSigner: true, isWritable: true },
        { pubkey: buffer, isSigner: false, isWritable: true },
        { pubkey: Rent, isSigner: false, isWritable: false },
        { pubkey: Clock, isSigner: false, isWritable: false },
        { pubkey: SolSystem.programId, isSigner: false, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: false },
      ],
      data: body,
    }),
    );
    const recent = await rpc.getLatestBlockhash();
    tx.recentBlockhash = recent.blockhash;
    tx.lastValidBlockHeight = recent.lastValidBlockHeight;
    tx.feePayer = payer;
    tx.partialSign(program);
    return {
      raw: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
      blockhash: recent.blockhash,
      lastValidBlockHeight: recent.lastValidBlockHeight,
    };
  });

function solanaError(err: unknown, address: string): string {
  const msg = err instanceof Error ? err.message : "Solana rejected that.";
  if (/insufficient|debit|lamports/i.test(msg)) {
    return `This Solana address needs more SOL. Send SOL to ${address}. It is not the ETH address.`;
  }
  if (/custom program error: 0x1/i.test(msg)) return "The curve amounts were rejected.";
  if (/custom program error: 0x2/i.test(msg)) return "Trading is not open yet.";
  if (/custom program error: 0x3/i.test(msg)) return "Buys are closed. This curve has graduated. Sells can still exit.";
  if (/custom program error: 0x4/i.test(msg)) return "That amount does not work.";
  if (/custom program error: 0x5/i.test(msg)) return "That buy is over the max for this coin.";
  if (/custom program error: 0x6/i.test(msg)) return "The curve is empty.";
  if (/custom program error: 0x7/i.test(msg)) return "The price moved past your slippage. Nothing was traded.";
  if (/custom program error: 0x8/i.test(msg)) return "The curve can only buy back tokens that were bought from it. Sell a smaller amount.";
  if (/custom program error: 0x9/i.test(msg)) return "The Raydium pool did not open. The curve is unchanged. Try again with about 0.5 SOL spare.";
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}
