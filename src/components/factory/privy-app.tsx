import { useEffect } from "react";
import { PrivyProvider, useExportWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
  useExportWallet as useExportSolanaWallet,
  useSignAndSendTransaction,
  useSignTransaction,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { base, bsc, mainnet } from "viem/chains";
import { defineChain } from "viem";
import { useFactory } from "@/lib/factory/store";
import { PRIVY_APP_ID, base58, setAccountWallets, type Eip1193 } from "@/lib/factory/wallet-bridge";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

/** Mirrors the Privy account into the wallet bridge. */
function Bridge() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solWallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { signTransaction } = useSignTransaction();
  const { exportWallet } = useExportWallet();
  const { exportWallet: exportSolanaWallet } = useExportSolanaWallet();
  const setWallet = useFactory((s) => s.setWallet);

  // Prefer the account's own (embedded) wallet; fall back to a wallet the user linked at sign-in.
  const evm = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0] ?? null;
  const sol = solWallets[0] ?? null;
  const who =
    user?.email?.address ?? user?.google?.email ?? (user?.twitter?.username ? `@${user.twitter.username}` : "");

  useEffect(() => {
    setAccountWallets({
      ready,
      authenticated,
      evmAddress: authenticated && evm ? evm.address : null,
      solAddress: authenticated && sol ? sol.address : null,
      evmProvider: async () => {
        if (!evm) throw new Error("This account has no EVM wallet yet.");
        return (await evm.getEthereumProvider()) as Eip1193;
      },
      solSignAndSend: async (tx: Uint8Array) => {
        if (!sol) throw new Error("This account has no Solana wallet yet.");
        const { signature } = await signAndSendTransaction({ transaction: tx, wallet: sol, chain: "solana:mainnet" });
        return base58(signature);
      },
      solSign: async (tx: Uint8Array) => {
        if (!sol) throw new Error("This account has no Solana wallet yet.");
        const { signedTransaction } = await signTransaction({ transaction: tx, wallet: sol });
        return signedTransaction;
      },
      login,
      logout,
      who: authenticated ? who : "",
      evmEmbedded: evm?.walletClientType === "privy",
      exportEvm: async () => {
        if (evm) await exportWallet({ address: evm.address });
      },
      exportSol: async () => {
        if (sol) await exportSolanaWallet({ address: sol.address });
      },
    });
    // The rest of the site (threads, profile, portfolio) keys on this address.
    if (authenticated && evm) setWallet(evm.address);
  }, [ready, authenticated, evm, sol, who, login, logout, signAndSendTransaction, signTransaction, exportWallet, exportSolanaWallet, setWallet]);

  useEffect(() => () => setAccountWallets(null), []);
  return null;
}

export default function PrivyApp() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "twitter", "wallet"],
        appearance: { theme: "dark", accentColor: "#39F3C3", walletChainType: "ethereum-and-solana" },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: base,
        supportedChains: [base, bsc, mainnet, robinhood],
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
