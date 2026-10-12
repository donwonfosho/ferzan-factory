import { useCallback, useEffect, useState } from "react";
import { PrivyProvider, useExportWallet, useImportWallet, useLinkAccount, usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";
import {
  useCreateWallet as useCreateExtendedWallet,
  useExportWallet as useExportExtendedWallet,
  useSignRawHash,
} from "@privy-io/react-auth/extended-chains";
import {
  toSolanaWalletConnectors,
  useExportWallet as useExportSolanaWallet,
  useImportWallet as useImportSolanaWallet,
  useSignAndSendTransaction,
  useSignMessage as useSolanaSignMessage,
  useSignTransaction,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { base, bsc, mainnet } from "viem/chains";
import { defineChain } from "viem";
import { useFactory } from "@/lib/factory/store";
import { PRIVY_APP_ID, base58, setAccountWallets, type Eip1193 } from "@/lib/factory/wallet-bridge";

import { tr } from "@/lib/i18n";
const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

// Same id, RPC and explorer as EVM_CHAIN.arc in deploy.ts. Gas on Arc is USDC (switchChain adds it with 18 decimals).
const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

/** A wallet row in user.linkedAccounts. Tron and TON wallets are type "wallet" with chainType "tron" / "ton". */
type LinkedWallet = { type?: string; chainType?: string; address?: string; id?: string; publicKey?: string; public_key?: string };

function linkedWallet(user: unknown, chainType: "tron" | "ton"): LinkedWallet | null {
  const list = ((user as { linkedAccounts?: unknown[] } | null)?.linkedAccounts ?? []) as LinkedWallet[];
  return list.find((a) => a?.type === "wallet" && a.chainType === chainType && typeof a.address === "string") ?? null;
}

const clean = (hex: string) => hex.replace(/^0x/, "").toLowerCase();

/** Mirrors the Privy account into the wallet bridge. */
function Bridge() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { linkTelegram: openTelegramLink } = useLinkAccount();
  const { wallets } = useWallets();
  const { wallets: solWallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { signTransaction } = useSignTransaction();
  const { signMessage: signSolanaMessage } = useSolanaSignMessage();
  const { signMessage } = useSignMessage();
  const { exportWallet } = useExportWallet();
  const { exportWallet: exportSolanaWallet } = useExportSolanaWallet();
  const { createWallet: createExtended } = useCreateExtendedWallet();
  const { exportWallet: exportExtended } = useExportExtendedWallet();
  const { signRawHash } = useSignRawHash();
  const { importWallet: importEvmWallet } = useImportWallet();
  const { importWallet: importSolanaWallet } = useImportSolanaWallet();
  const setWallet = useFactory((s) => s.setWallet);
  // Wallets created in this session show at once, before the user object catches up.
  const [fresh, setFresh] = useState<{ tron?: LinkedWallet; ton?: LinkedWallet }>({});

  // Prefer the account's own (embedded) wallet; fall back to a wallet the user linked at sign-in.
  const evm = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0] ?? null;
  const sol = solWallets[0] ?? null;
  const who =
    user?.email?.address ?? user?.google?.email ?? (user?.twitter?.username ? `@${user.twitter.username}` : "");

  useEffect(() => {
    if (!authenticated) setFresh({});
  }, [authenticated]);

  const tronAcc = (authenticated ? linkedWallet(user, "tron") ?? fresh.tron : null) ?? null;
  const tonAcc = (authenticated ? linkedWallet(user, "ton") ?? fresh.ton : null) ?? null;
  const tronAddress = tronAcc?.address ?? null;
  const tonAddress = tonAcc?.address ?? null;

  const create = useCallback(
    async (chainType: "tron" | "ton") => {
      const out = (await createExtended({ chainType })) as unknown as { wallet?: LinkedWallet } | undefined;
      if (out?.wallet?.address) setFresh((f) => ({ ...f, [chainType]: { ...out.wallet, type: "wallet", chainType } }));
    },
    [createExtended],
  );

  const signHash = useCallback(
    async (chainType: "tron" | "ton", address: string | null, hashHex: string) => {
      if (!address) throw new Error(chainType === "tron" ? tr("This account has no Tron wallet yet.") : tr("This account has no TON wallet yet."));
      const hash = clean(hashHex);
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("Bad hash.");
      const { signature } = await signRawHash({ address, chainType, hash: `0x${hash}` as `0x${string}` });
      return signature as string;
    },
    [signRawHash],
  );

  const tonPublicKey = useCallback(async (): Promise<string> => {
    const fromAccount = clean(tonAcc?.publicKey ?? tonAcc?.public_key ?? "");
    const norm = (k: string) => (k.length === 66 && k.startsWith("00") ? k.slice(2) : k);
    if (/^[0-9a-f]{64}$/.test(norm(fromAccount))) return norm(fromAccount);
    // Privy's wallet API returns the public key (as in Privy's own TON guide).
    if (tonAcc?.id) {
      try {
        const token = await getAccessToken();
        const res = await fetch(`https://auth.privy.io/api/v1/wallets/${tonAcc.id}`, {
          headers: { Authorization: `Bearer ${token}`, "privy-app-id": PRIVY_APP_ID },
        });
        if (res.ok) {
          const row = (await res.json()) as { public_key?: string; publicKey?: string };
          const k = norm(clean(row.public_key ?? row.publicKey ?? ""));
          if (/^[0-9a-f]{64}$/.test(k)) return k;
        }
      } catch {
        /* reported below */
      }
    }
    throw new Error(tr("Could not read the public key of your TON wallet from Privy."));
  }, [tonAcc, getAccessToken]);

  useEffect(() => {
    setAccountWallets({
      ready,
      authenticated,
      evmAddress: authenticated && evm ? evm.address : null,
      solAddress: authenticated && sol ? sol.address : null,
      evmProvider: async () => {
        if (!evm) throw new Error(tr("This account has no EVM wallet yet."));
        return (await evm.getEthereumProvider()) as Eip1193;
      },
      signEvmMessage: async (message: string) => {
        if (!evm) throw new Error(tr("This account has no EVM wallet yet."));
        const { signature } = await signMessage({ message }, { address: evm.address, uiOptions: { showWalletUIs: false } });
        return signature;
      },
      solSignAndSend: async (tx: Uint8Array) => {
        if (!sol) throw new Error(tr("This account has no Solana wallet yet."));
        const { signature } = await signAndSendTransaction({ transaction: tx, wallet: sol, chain: "solana:mainnet" });
        return base58(signature);
      },
      solSign: async (tx: Uint8Array) => {
        if (!sol) throw new Error(tr("This account has no Solana wallet yet."));
        const { signedTransaction } = await signTransaction({ transaction: tx, wallet: sol });
        return signedTransaction;
      },
      signSolMessage: async (message: Uint8Array) => {
        if (!sol) throw new Error(tr("This account has no Solana wallet yet."));
        const { signature } = await signSolanaMessage({ message, wallet: sol, options: { uiOptions: { showWalletUIs: false } } });
        return signature;
      },
      login,
      logout,
      who: authenticated ? who : "",
      userId: authenticated && user?.id ? user.id : null,
      accessToken: async () => {
        if (!authenticated) return null;
        try {
          return await getAccessToken();
        } catch {
          return null;
        }
      },
      linkTelegram: () => {
        if (!authenticated) {
          login();
          return;
        }
        openTelegramLink();
      },
      evmEmbedded: evm?.walletClientType === "privy",
      exportEvm: async () => {
        if (evm) await exportWallet({ address: evm.address });
      },
      exportSol: async () => {
        if (sol) await exportSolanaWallet({ address: sol.address });
      },
      tronAddress,
      tonAddress,
      createTron: () => create("tron"),
      createTon: () => create("ton"),
      exportTron: async () => {
        if (tronAddress) await exportExtended({ address: tronAddress });
      },
      exportTon: async () => {
        if (tonAddress) await exportExtended({ address: tonAddress });
      },
      tronSignHash: (h: string) => signHash("tron", tronAddress, h),
      tonSignHash: (h: string) => signHash("ton", tonAddress, h),
      tonPublicKey,
      importEvm: async (privateKey: string) => {
        const w = (await importEvmWallet({ privateKey })) as unknown as { address: string };
        return w.address;
      },
      importSol: async (privateKey: string) => {
        const w = (await importSolanaWallet({ privateKey })) as unknown as { address: string };
        return w.address;
      },
    });
    // The rest of the site (threads, profile, portfolio) keys on this address.
    if (authenticated && evm) setWallet(evm.address);
  }, [ready, authenticated, evm, sol, who, user, login, logout, getAccessToken, openTelegramLink, signMessage, signSolanaMessage, signAndSendTransaction, signTransaction, exportWallet, exportSolanaWallet, setWallet, tronAddress, tonAddress, create, exportExtended, signHash, tonPublicKey, importEvmWallet, importSolanaWallet]);

  useEffect(() => () => setAccountWallets(null), []);
  return null;
}

export default function PrivyApp() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "twitter", "telegram", "wallet"],
        appearance: { theme: "dark", accentColor: "#39F3C3", walletChainType: "ethereum-and-solana" },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: base,
        supportedChains: [base, bsc, mainnet, robinhood, arc],
        externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
        solana: {
          rpcs: {
            "solana:mainnet": {
              // The public mainnet-beta endpoint often refuses browsers, which breaks Privy's transaction preview.
              rpc: createSolanaRpc("https://solana-rpc.publicnode.com"),
              rpcSubscriptions: createSolanaRpcSubscriptions("wss://solana-rpc.publicnode.com"),
            },
          },
        },
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}
