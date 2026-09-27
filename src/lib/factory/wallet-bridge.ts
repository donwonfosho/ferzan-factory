/**
 * One place every page asks for a wallet.
 * Signed in with Privy -> the account's own EVM / Solana wallets.
 * Not signed in -> a browser extension (MetaMask, Rabby, Phantom) if there is one,
 * otherwise the Privy sign-in opens.
 */
import { useSyncExternalStore } from "react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { provider as injectedProvider, switchChain, type EvmChainId } from "./deploy";
import { sendSignedSolana } from "./sol-coin";

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/** Public Privy app id (not a secret). The deploy server builds without .grok/app-env.json, so it is the fallback here; a VITE_PRIVY_APP_ID in the build environment still wins. */
export const PRIVY_APP_ID: string = import.meta.env.VITE_PRIVY_APP_ID || "cmuitovv501qx0cl6wnj2qvvt";

export type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export type AccountWallets = {
  ready: boolean;
  authenticated: boolean;
  evmAddress: string | null;
  solAddress: string | null;
  evmProvider: () => Promise<Eip1193>;
  /** Signs and sends serialized Solana transaction bytes; returns the base58 signature. */
  solSignAndSend: (tx: Uint8Array) => Promise<string>;
  /** Signs serialized Solana transaction bytes without sending them; returns the signed bytes. */
  solSign: (tx: Uint8Array) => Promise<Uint8Array>;
  login: () => void;
  logout: () => Promise<void>;
  /** Email, Google address or @handle of the signed-in user, for display only. */
  who: string;
  /** True when the EVM wallet is the account's own (exportable) wallet, not a linked extension. */
  evmEmbedded: boolean;
  exportEvm: () => Promise<void>;
  exportSol: () => Promise<void>;
};

let account: AccountWallets | null = null;
const listeners = new Set<() => void>();

/** Set by the Privy bridge component whenever the account state changes. */
export function setAccountWallets(next: AccountWallets | null) {
  account = next;
  for (const fn of listeners) fn();
}

export function accountWallets(): AccountWallets | null {
  return account;
}

export function onAccountChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React view of the account (null until the Privy chunk has loaded in the browser). */
export function useAccountWallets(): AccountWallets | null {
  return useSyncExternalStore(onAccountChange, accountWallets, () => null);
}

export class WalletNeeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletNeeded";
  }
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits: number[] = [];
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

function needSignIn(what: string): never {
  if (account?.ready) account.login();
  throw new WalletNeeded(`Sign in to use your ${what} wallet, then press again. You can also use a browser wallet extension.`);
}

/** The EVM wallet to sign with, already on `chain`. */
export async function evmWallet(chain: EvmChainId): Promise<{ address: string; provider: Eip1193 }> {
  if (account?.authenticated && account.evmAddress) {
    const p = await account.evmProvider();
    await switchChain(p, chain);
    return { address: account.evmAddress.toLowerCase(), provider: p };
  }
  const eth = injectedProvider();
  if (!eth) needSignIn("account");
  await switchChain(eth, chain);
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0]?.toLowerCase();
  if (!address) throw new Error("The wallet returned no account.");
  return { address, provider: eth };
}

type PhantomLike = {
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction?: (tx: Transaction | VersionedTransaction) => Promise<{ signature: string }>;
};

function phantom(): PhantomLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: PhantomLike }; solana?: PhantomLike };
  return w.phantom?.solana ?? w.solana ?? null;
}

/** The Solana wallet to sign with. */
export async function solanaWallet(): Promise<{ address: string; signAndSend: (tx: Uint8Array) => Promise<string> }> {
  if (account?.authenticated && account.solAddress) {
    const signer = account;
    // The account wallet signs; the Launch Bot's RPC sends. Privy's own send leans on the public RPC.
    return {
      address: account.solAddress,
      signAndSend: async (bytes) => {
        const signed = await signer.solSign(bytes);
        return (await sendSignedSolana({ data: { signedB64: toBase64(signed) } })).signature;
      },
    };
  }
  const sol = phantom();
  if (!sol?.signAndSendTransaction) needSignIn("Solana");
  const res = await sol.connect();
  const send = sol.signAndSendTransaction.bind(sol);
  return {
    address: res.publicKey.toString(),
    signAndSend: async (bytes) => {
      let tx: Transaction | VersionedTransaction;
      try {
        tx = Transaction.from(bytes);
      } catch {
        tx = VersionedTransaction.deserialize(bytes);
      }
      const { signature } = await send(tx);
      return signature;
    },
  };
}

/** Signs a plain-text message with the account's EVM wallet if it owns `address`; null otherwise. */
export async function signWithAccount(address: string, message: string): Promise<string | null> {
  if (!account?.authenticated || !account.evmAddress || account.evmAddress.toLowerCase() !== address.toLowerCase()) return null;
  const p = await account.evmProvider();
  const hex = "0x" + Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, "0")).join("");
  const signature = await p.request({ method: "personal_sign", params: [hex, account.evmAddress] });
  return typeof signature === "string" ? signature : null;
}
