import "@/lib/factory/buffer-polyfill";
/**
 * Browser wallets for the two non-EVM, non-Solana launch chains:
 *   Tron -> TronLink (browser extension, or the TronLink app's built-in browser)
 *   TON  -> TON Connect (Tonkeeper, Telegram Wallet, MyTonWallet, ...)
 * Both sign what the Ferzan Launch Bot built; the site never sees a key.
 */
import type { TonMessage } from "./bot-launch";
import { WalletNeeded, accountWallets } from "./wallet-bridge";
import { broadcastTronTx } from "./site-chains";

/**
 * Which signer Tron / TON use. Default: the Ferzan account's own wallet when the user is signed in and has one;
 * TronLink / TON Connect stay available as the visible alternative (Account page and the launch form).
 */
const PREF_KEY = "ferzan-signer-";
export type ExtendedChain = "tron" | "ton";

export function prefersExternal(chain: ExtendedChain): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PREF_KEY + chain) === "external";
  } catch {
    return false;
  }
}

export function setPrefersExternal(chain: ExtendedChain, external: boolean) {
  try {
    if (external) window.localStorage.setItem(PREF_KEY + chain, "external");
    else window.localStorage.removeItem(PREF_KEY + chain);
    window.dispatchEvent(new Event("ferzan-signer"));
  } catch {
    /* private mode: the choice just does not stick */
  }
}

/** The account's Privy wallet for `chain`, or null when signed out / not created / the user chose the external wallet. */
function accountFor(chain: ExtendedChain) {
  const acc = accountWallets();
  if (!acc?.authenticated || prefersExternal(chain)) return null;
  return (chain === "tron" ? acc.tronAddress : acc.tonAddress) ? acc : null;
}

const hexOf = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const bytesOf = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

/** Signs a Tron transaction with the account wallet: Privy signs the txID (sha256 of raw_data_hex), then the site broadcasts. */
async function signAndSendTronWithAccount(transactionJson: string): Promise<string> {
  const acc = accountWallets();
  if (!acc?.tronAddress) throw new Error("This account has no Tron wallet yet.");
  const tx = JSON.parse(transactionJson) as { txID?: string; raw_data_hex?: string; signature?: string[] };
  const txID = String(tx.txID ?? "");
  const rawHex = String(tx.raw_data_hex ?? "");
  if (!/^[0-9a-f]{64}$/.test(txID) || !/^([0-9a-f]{2})+$/.test(rawHex)) throw new Error("The transaction looks wrong.");
  // Never sign an id we did not derive from the bytes ourselves.
  const digest = hexOf(new Uint8Array(await crypto.subtle.digest("SHA-256", bytesOf(rawHex))));
  if (digest !== txID) throw new Error("The transaction looks wrong (its id does not match its content).");

  const sig = (await acc.tronSignHash(txID)).replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(sig) || (sig.length !== 130 && sig.length !== 128)) throw new Error("Privy returned a signature of an unexpected size.");
  // r || s || recovery id. A 65-byte answer carries v as 0/1 or 27/28; a 64-byte one has none, so both are tried (a wrong one is refused, nothing is sent).
  const rs = sig.slice(0, 128);
  let candidates: string[];
  if (sig.length === 130) {
    let v = parseInt(sig.slice(128), 16);
    if (v >= 27) v -= 27;
    if (v > 1) throw new Error("Privy returned a signature of an unexpected shape.");
    candidates = [rs + "0" + v];
  } else {
    candidates = [rs + "00", rs + "01"];
  }
  let lastError: unknown = null;
  for (const signature of candidates) {
    try {
      const { txid } = await broadcastTronTx({ data: { txJson: JSON.stringify({ ...tx, signature: [signature] }) } });
      return txid;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Tron did not take the transaction.");
}

type TronWebLike = {
  ready?: boolean;
  defaultAddress?: { base58?: string | false };
  trx: {
    sign: (tx: unknown) => Promise<unknown>;
    sendRawTransaction: (tx: unknown) => Promise<{ result?: boolean; txid?: string; code?: string; message?: string }>;
  };
};
type TronLinkLike = { request: (args: { method: string }) => Promise<unknown>; tronWeb?: TronWebLike };

type TronHost = { tronLink?: TronLinkLike; tronWeb?: TronWebLike };

/** TronLink, or another wallet that offers the same Tron interface (OKX, Bitget, Trust). */
function tronGlobals(): TronHost {
  if (typeof window === "undefined") return {};
  const w = window as unknown as TronHost & Record<string, { tronLink?: TronLinkLike } | undefined>;
  if (w.tronLink || w.tronWeb) return { tronLink: w.tronLink, tronWeb: w.tronWeb };
  for (const k of ["okxwallet", "bitkeep", "trustwallet"]) {
    const link = w[k]?.tronLink;
    if (link) return { tronLink: link, tronWeb: link.tronWeb };
  }
  return {};
}

/** Wallets add their Tron object a moment after the page loads: wait up to ~3 seconds for it. */
async function waitForTron(): Promise<TronHost> {
  let g = tronGlobals();
  if (g.tronLink || g.tronWeb || typeof window === "undefined") return g;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener("tronLink#initialized", done);
      clearInterval(timer);
      clearTimeout(stop);
      resolve();
    };
    window.addEventListener("tronLink#initialized", done);
    const timer = setInterval(() => {
      if (tronGlobals().tronLink || tronGlobals().tronWeb) done();
    }, 250);
    const stop = setTimeout(done, 3000);
  });
  g = tronGlobals();
  return g;
}

/** Opens this page inside the TronLink phone app (its built-in browser has the wallet). */
export function tronLinkAppLink(): string {
  if (typeof window === "undefined") return "https://www.tronlink.org/";
  const param = { url: window.location.href, action: "open", protocol: "tronlink", version: "1.0" };
  return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(param))}`;
}

/** Connects TronLink and returns the visitor's Tron address. */
export async function tronWallet(): Promise<{ address: string; signAndSend: (transactionJson: string) => Promise<string> }> {
  const own = accountFor("tron");
  if (own?.tronAddress) return { address: own.tronAddress, signAndSend: signAndSendTronWithAccount };
  const g = await waitForTron();
  if (!g.tronLink && !g.tronWeb) {
    throw new WalletNeeded("No Tron wallet found in this browser. Use one of the options below.");
  }
  if (g.tronLink) {
    const res = (await g.tronLink.request({ method: "tron_requestAccounts" }).catch(() => null)) as { code?: number } | null;
    if (res && typeof res === "object" && res.code !== undefined && res.code !== 200) {
      throw new Error("TronLink did not connect. Unlock it and approve this site, then try again.");
    }
  }
  const tw = g.tronLink?.tronWeb || g.tronWeb;
  const address = tw?.defaultAddress?.base58 || "";
  if (!tw || !address) throw new Error("Unlock TronLink and pick an account, then try again.");
  return {
    address,
    signAndSend: async (transactionJson) => {
      const tx: unknown = JSON.parse(transactionJson);
      const signed = await tw.trx.sign(tx);
      const out = await tw.trx.sendRawTransaction(signed);
      const txid = out?.txid || (signed as { txID?: string } | null)?.txID || "";
      if (!out?.result || !txid) throw new Error(`Tron did not take the launch (${out?.code || out?.message || "rejected"}).`);
      return txid;
    },
  };
}

type TonUi = {
  account: { address: string } | null;
  connectionRestored: Promise<boolean>;
  openModal: () => Promise<void>;
  onStatusChange: (cb: (wallet: unknown) => void) => () => void;
  onModalStateChange: (cb: (state: { status: string; closeReason?: string | null }) => void) => () => void;
  sendTransaction: (req: { validUntil: number; network?: string; messages: TonMessage[] }) => Promise<{ boc: string }>;
};

let tonUi: TonUi | null = null;

async function ui(): Promise<TonUi> {
  if (!tonUi) {
    const { TonConnectUI } = await import("@tonconnect/ui");
    tonUi = new TonConnectUI({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json` }) as unknown as TonUi;
  }
  return tonUi;
}

/** Connects a TON wallet (opens the TON Connect picker if needed) and returns its raw address (0:…). */
export async function tonWallet(): Promise<{ address: string; send: (req: { validUntil: number; network: string; messages: TonMessage[] }) => Promise<string> }> {
  const own = accountFor("ton");
  if (own?.tonAddress) {
    const { rawTonAddress, sendFromAccountTon } = await import("./ton-sign");
    return {
      address: await rawTonAddress(own.tonAddress), // raw form (0:…), the same shape TON Connect gives
      send: (req) => sendFromAccountTon(own, { validUntil: req.validUntil, messages: req.messages }),
    };
  }
  const u = await ui();
  await u.connectionRestored.catch(() => false); // a wallet connected earlier reconnects by itself first
  if (!u.account) {
    await new Promise<void>((resolve, reject) => {
      const stopStatus = u.onStatusChange((w) => {
        if (w) {
          stopStatus();
          stopModal();
          resolve();
        }
      });
      const stopModal = u.onModalStateChange((state) => {
        if (state.status === "closed" && state.closeReason === "action-cancelled" && !u.account) {
          stopStatus();
          stopModal();
          reject(new WalletNeeded("Connect a TON wallet (Tonkeeper, Telegram Wallet, …) to launch on TON."));
        }
      });
      void u.openModal();
    });
  }
  const address = u.account?.address || "";
  if (!address) throw new WalletNeeded("Connect a TON wallet to launch on TON.");
  return {
    address,
    send: async (req) => {
      const out = await u.sendTransaction({ validUntil: req.validUntil, network: req.network, messages: req.messages });
      return out.boc;
    },
  };
}
