import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem/utils";
import { readSiteWallet } from "./site-wallet";
import { solanaAddress } from "./solana";
import { signWithAccount } from "./wallet-bridge";
import { proofAddress, proofDigest, proofMessage, type Proof, type ProofAction } from "./proof";

type EthProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
type SolProvider = {
  publicKey?: { toString: () => string } | null;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
};

const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";

function bytesFromHex(value: string): Uint8Array<ArrayBuffer> {
  const clean = value.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/** The site's Solana wallet is derived from the same seed as its EVM key (see solana.ts keypairFromSite). */
async function signWithSiteSolana(privateKey: string, message: string): Promise<string> {
  const pkcs8 = bytesFromHex(PKCS8_ED25519_PREFIX + privateKey.replace(/^0x/, ""));
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  } catch {
    throw new Error("This browser cannot sign with the Solana wallet. Update the browser and try again.");
  }
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(message));
  return base64(new Uint8Array(sig));
}

/** Sign a proof with whichever wallet owns `address`: the site wallet silently, an extension with a prompt. */
export async function signProof(action: ProofAction, address: string, fields: Record<string, string>): Promise<Proof> {
  const ts = Date.now();
  const message = proofMessage(action, address, await proofDigest(fields), ts);
  const site = readSiteWallet();
  const want = proofAddress(address);

  if (address.startsWith("0x")) {
    if (site && site.address.toLowerCase() === want) {
      const signature = await privateKeyToAccount(site.privateKey).signMessage({ message });
      return { ts, signature };
    }
    const viaAccount = await signWithAccount(address, message);
    if (viaAccount) return { ts, signature: viaAccount };
    const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
    if (!eth) throw new Error("Open the wallet that owns this address to sign.");
    const signature = await eth.request({ method: "personal_sign", params: [toHex(message), address] });
    if (typeof signature !== "string") throw new Error("The wallet did not sign.");
    return { ts, signature };
  }

  if (site && solanaAddress() === address) {
    return { ts, signature: await signWithSiteSolana(site.privateKey, message) };
  }
  const sol = (window as unknown as { solana?: SolProvider }).solana;
  if (!sol?.signMessage || sol.publicKey?.toString() !== address) {
    throw new Error("Open the Solana wallet that owns this address to sign.");
  }
  const res = await sol.signMessage(new TextEncoder().encode(message), "utf8");
  const bytes = res instanceof Uint8Array ? res : res.signature;
  return { ts, signature: base64(bytes) };
}
