/**
 * Browser wallets for the two non-EVM, non-Solana launch chains:
 *   Tron -> TronLink (browser extension, or the TronLink app's built-in browser)
 *   TON  -> TON Connect (Tonkeeper, Telegram Wallet, MyTonWallet, ...)
 * Both sign what the Ferzan Launch Bot built; the site never sees a key.
 */
import type { TonMessage } from "./bot-launch";
import { WalletNeeded } from "./wallet-bridge";

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
