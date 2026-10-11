import type { EvmChainId } from "./deploy";
import { broadcastSigned, getReceipt, prepareTx, readBalance, type ChainReceipt } from "./relay";

const KEY = "ferzan-site-wallet-v1";
const ADDR = "ferzan-site-wallet-addr-v1";
const ACK = "ferzan-key-ack-v1";
let memoryKey: `0x${string}` | null = null;
let memoryAddress: `0x${string}` | null = null;
let hydrating: Promise<SiteWallet | null> | null = null;

export type SiteWallet = { address: `0x${string}`; privateKey: `0x${string}` };

function remember(address: string) {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) memoryAddress = address as `0x${string}`;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADDR, address);
  } catch {
    /* The address is still on the wallet this visit. */
  }
}

function savedKey(): `0x${string}` | null {
  if (memoryKey) return memoryKey;
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(KEY) || window.sessionStorage.getItem(KEY);
    if (!saved || !/^0x[a-fA-F0-9]{64}$/.test(saved)) return null;
    memoryKey = saved as `0x${string}`;
    return memoryKey;
  } catch {
    return null;
  }
}

function storeKey(privateKey: `0x${string}`, address: `0x${string}`) {
  memoryKey = privateKey;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, privateKey);
    window.sessionStorage.setItem(KEY, privateKey);
    remember(address);
  } catch {
    /* The key still works for this visit and is shown on Account. */
  }
}

export function knownSiteAddress(): string | null {
  if (memoryAddress) return memoryAddress;
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(ADDR);
    return saved && /^0x[a-fA-F0-9]{40}$/.test(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function readSiteWallet(): SiteWallet | null {
  const privateKey = savedKey();
  if (!privateKey) return null;
  const address = knownSiteAddress();
  if (!address) return null;
  return { privateKey, address: address as `0x${string}` };
}

async function deriveAddress(privateKey: `0x${string}`): Promise<`0x${string}`> {
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(privateKey).address;
}

/** Fills in the saved address the first time a key has no address stored yet. viem loads only then. */
export function hydrateSiteWallet(): Promise<SiteWallet | null> {
  if (!hydrating) {
    hydrating = fillSiteWallet().finally(() => {
      hydrating = null;
    });
  }
  return hydrating;
}

async function fillSiteWallet(): Promise<SiteWallet | null> {
  const ready = readSiteWallet();
  if (ready) return ready;
  const privateKey = savedKey();
  if (!privateKey) return null;
  const address = await deriveAddress(privateKey);
  remember(address);
  return { privateKey, address };
}

export async function openSiteWallet(): Promise<SiteWallet | null> {
  const existing = await hydrateSiteWallet();
  if (existing) return existing;
  if (knownSiteAddress()) return null;
  const { generatePrivateKey } = await import("viem/accounts");
  const privateKey = generatePrivateKey();
  const address = await deriveAddress(privateKey);
  storeKey(privateKey, address);
  return { privateKey, address };
}

export async function importSiteWallet(privateKey: string): Promise<SiteWallet | null> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) return null;
  const key = privateKey as `0x${string}`;
  const address = await deriveAddress(key);
  storeKey(key, address);
  return { privateKey: key, address };
}

export function keySaved(address: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${ACK}:${address.toLowerCase()}`) === "1";
  } catch {
    return false;
  }
}

export function markKeySaved(address: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${ACK}:${address.toLowerCase()}`, "1");
}

export function siteMatches(address: string): boolean {
  const site = readSiteWallet();
  return Boolean(site && site.address.toLowerCase() === address.toLowerCase());
}

export async function siteBalance(chain: EvmChainId, address: string): Promise<bigint> {
  const res = await readBalance({ data: { chain, address } });
  return BigInt(res.wei);
}

export async function sendWithSiteWallet(input: {
  chain: EvmChainId;
  from: string;
  to?: string;
  data: string;
  value?: bigint;
}): Promise<ChainReceipt> {
  const site = readSiteWallet();
  if (!site || site.address.toLowerCase() !== input.from.toLowerCase()) {
    throw new Error("Open the wallet on this site first.");
  }
  const { getAddress } = await import("viem/utils");
  const { signTransaction } = await import("viem/accounts");
  const to = input.to ? getAddress(input.to) : undefined;
  const prepared = await prepareTx({
    data: {
      chain: input.chain,
      from: site.address,
      to: to ?? "",
      data: input.data,
      value: (input.value ?? 0n).toString(),
    },
  });
  const raw = await signTransaction({
    privateKey: site.privateKey,
    transaction: {
      type: "legacy",
      chainId: prepared.chainId,
      nonce: Number(prepared.nonce),
      gasPrice: BigInt(prepared.gasPrice),
      gas: BigInt(prepared.gas),
      value: BigInt(prepared.value),
      data: input.data as `0x${string}`,
      ...(to ? { to } : {}),
    },
  });
  const sent = await broadcastSigned({ data: { chain: input.chain, raw } });
  for (let i = 0; i < 90; i += 1) {
    const receipt = await getReceipt({ data: { chain: input.chain, hash: sent.hash } });
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Still confirming. The coin exists once this transaction lands.");
}

export function fundMessage(err: unknown, address: string): string | null {
  const msg = err instanceof Error ? err.message : "";
  if (/insufficient funds/i.test(msg)) {
    return `This wallet is on the site, not in an extension. It needs gas before it can launch or trade. Send the chain coin to ${address}. The key stays in this browser.`;
  }
  return null;
}

/**
 * Moves the old browser wallet's whole coin balance on `chain` to `to` (the account wallet),
 * keeping back the network fee plus a 20% cushion in case the gas price moves before it lands.
 */
export async function sweepSiteWallet(chain: EvmChainId, to: string): Promise<{ hash: string; sent: bigint }> {
  const site = readSiteWallet();
  if (!site) throw new Error("This browser has no old wallet key.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(to) || to.toLowerCase() === site.address.toLowerCase()) throw new Error("Pick a different wallet to move to.");
  const balance = await siteBalance(chain, site.address);
  const probe = await prepareTx({ data: { chain, from: site.address, to, data: "0x", value: "0" } });
  const fee = BigInt(probe.gas) * BigInt(probe.gasPrice);
  const value = balance - fee - fee / 5n;
  if (value <= 0n) throw new Error("Not enough on this chain to cover the network fee.");
  const receipt = await sendWithSiteWallet({ chain, from: site.address, to, data: "0x", value });
  if (receipt.status === "0x0") throw new Error("The move failed on chain. The coins are still in the old wallet.");
  return { hash: receipt.hash, sent: value };
}
