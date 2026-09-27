import type { ChainId, LiveChainId } from "./types";
import { TREASURY } from "./catalog";
import { FERZAN_TOKEN_BYTECODE } from "./token-bytecode";
import { CURVE_SELECTOR, FERZAN_CURVE_BYTECODE } from "./curve-bytecode";
import { fundMessage, sendWithSiteWallet, siteMatches } from "./site-wallet";
import { accountWallets } from "./wallet-bridge";

export type EvmChainId = Exclude<LiveChainId, "solana">;

export const EVM_CHAIN: Record<
  EvmChainId,
  { chainId: number; name: string; rpc: string; explorer: string; symbol: string }
> = {
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    rpc: "https://ethereum.publicnode.com",
    explorer: "https://etherscan.io",
    symbol: "ETH",
  },
  bsc: {
    chainId: 56,
    name: "BNB Smart Chain",
    rpc: "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com",
    symbol: "BNB",
  },
  base: {
    chainId: 8453,
    name: "Base",
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    symbol: "ETH",
  },
  robinhood: {
    chainId: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    symbol: "ETH",
  },
  arc: {
    chainId: 5042,
    name: "Arc",
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    symbol: "USDC",
  },
};

const ZERO = "0x0000000000000000000000000000000000000000";

export const CURVE_POOL: Record<EvmChainId, { router: string; wrapped: string; kind: bigint; dex: string }> = {
  ethereum: {
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    wrapped: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    kind: 1n,
    dex: "Uniswap",
  },
  bsc: {
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    wrapped: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    kind: 1n,
    dex: "PancakeSwap",
  },
  base: {
    router: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    wrapped: "0x4200000000000000000000000000000000000006",
    kind: 2n,
    dex: "Aerodrome",
  },
  robinhood: {
    router: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
    wrapped: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    kind: 1n,
    dex: "Uniswap",
  },
  arc: {
    router: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
    wrapped: "0x3600000000000000000000000000000000000000",
    kind: 3n,
    dex: "Uniswap",
  },
};

export function isEvmChain(chain: ChainId): chain is EvmChainId {
  return chain !== "solana";
}

export function explorerTx(chain: EvmChainId, hash: string) {
  return `${EVM_CHAIN[chain].explorer}/tx/${hash}`;
}

export function explorerAddress(chain: EvmChainId, address: string) {
  return `${EVM_CHAIN[chain].explorer}/address/${address}`;
}

type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function provider(): Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Provider }).ethereum;
  return eth ?? null;
}

function word(value: bigint): string {
  if (value < 0n) throw new Error("negative");
  return value.toString(16).padStart(64, "0");
}

function encodeString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  return word(BigInt(bytes.length)) + padded;
}

/** ABI-encode (string, string, uint256, address) for the FerzanToken constructor. */
export function encodeTokenConstructor(name: string, symbol: string, supplyWhole: bigint, owner: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) throw new Error("Owner address looks wrong.");
  if (supplyWhole <= 0n || supplyWhole > 10n ** 15n) throw new Error("Supply has to be between 1 and 1,000,000,000,000,000.");
  const nameEnc = encodeString(name);
  const symbolEnc = encodeString(symbol);
  const headBytes = 32 * 4;
  const nameOffset = BigInt(headBytes);
  const symbolOffset = nameOffset + BigInt(nameEnc.length / 2);
  return (
    word(nameOffset) +
    word(symbolOffset) +
    word(supplyWhole) +
    word(BigInt(owner)) +
    nameEnc +
    symbolEnc
  );
}

export function tokenDeployData(name: string, symbol: string, supplyWhole: bigint, owner: string): string {
  return FERZAN_TOKEN_BYTECODE + encodeTokenConstructor(name, symbol, supplyWhole, owner);
}

export async function switchChain(eth: Provider, chain: EvmChainId) {
  const meta = EVM_CHAIN[chain];
  const hexId = "0x" + meta.chainId.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? Number((err as { code: number }).code) : 0;
    if (code !== 4902) {
      throw err instanceof Error ? err : new Error("The wallet did not switch chain.");
    }
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: meta.name,
          nativeCurrency: { name: meta.symbol, symbol: meta.symbol, decimals: 18 },
          rpcUrls: [meta.rpc],
          blockExplorerUrls: [meta.explorer],
        },
      ],
    });
  }
}

async function broadcast(input: {
  chain: EvmChainId;
  from: string;
  to?: string;
  data: string;
  value?: bigint;
}): Promise<{ hash: string; contractAddress: string | null; status: string }> {
  if (siteMatches(input.from)) {
    throw new Error("The old browser wallet is retired. Sign in, then move its coins on Manage account.");
  }
  // Signed in with a Ferzan account that owns `from`: its wallet signs (no extension needed).
  const account = accountWallets();
  if (account?.authenticated && account.evmAddress && account.evmAddress.toLowerCase() === input.from.toLowerCase()) {
    const own = (await account.evmProvider()) as Provider;
    await switchChain(own, input.chain);
    const tx: { from: string; data: string; to?: string; value?: string } = { from: account.evmAddress, data: input.data };
    if (input.to) tx.to = input.to;
    if (input.value && input.value > 0n) tx.value = "0x" + input.value.toString(16);
    const hash = (await own.request({ method: "eth_sendTransaction", params: [tx] })) as string;
    const receipt = await waitReceipt(own, hash);
    return { hash, contractAddress: receipt.contractAddress ?? null, status: receipt.status ?? "0x0" };
  }
  const eth = provider();
  if (!eth) throw new Error("Open a wallet on this site first.");
  await switchChain(eth, input.chain);
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error("The wallet returned no account.");
  if (from.toLowerCase() !== input.from.toLowerCase()) {
    throw new Error("That is an extension account. Open the wallet on this site, or switch the extension to it.");
  }
  const tx: { from: string; data: string; to?: string; value?: string } = { from, data: input.data };
  if (input.to) tx.to = input.to;
  if (input.value && input.value > 0n) tx.value = "0x" + input.value.toString(16);
  const hash = (await eth.request({ method: "eth_sendTransaction", params: [tx] })) as string;
  const receipt = await waitReceipt(eth, hash);
  return { hash, contractAddress: receipt.contractAddress ?? null, status: receipt.status ?? "0x0" };
}

function launchError(err: unknown, owner: string): string {
  const funded = fundMessage(err, owner);
  if (funded) return funded;
  const raw = err instanceof Error ? err.message : "The wallet rejected the trade.";
  const first = raw.split("\n").map((line) => line.trim()).find(Boolean) ?? raw;
  if (/insufficient funds/i.test(raw)) {
    return `Not enough gas in this wallet for that buy. Send more of the chain coin to ${owner}, then try again.`;
  }
  if (/checksum|invalid address/i.test(raw)) {
    return "The coin address could not be signed. Reload the coin and try the buy again.";
  }
  if (/execution reverted: early|reverted: early/i.test(raw)) return "Trading is not open yet.";
  if (/reverted: pooled|"pooled"/i.test(raw)) {
    return "This coin already graduated into a pool. Buy and sell on that pool, not the curve.";
  }
  if (/graduated/i.test(raw)) return "Buys are closed. This curve has graduated.";
  if (/reverted: max|"max"/i.test(raw)) return "That buy is over the max for this coin.";
  if (/reverted: sold|"sold"/i.test(raw)) {
    return "The curve can only buy back tokens that were bought from it. Sell a smaller amount. Tokens minted to the creator cannot be sold here.";
  }
  if (/reverted: slip|"slip"/i.test(raw)) {
    return "The price moved past your slippage. Nothing was traded. Raise the percent or try again.";
  }
  if (/user rejected|user denied|rejected the/i.test(raw)) return "The wallet closed the request. Press Buy to try again.";
  if (/extension account/i.test(raw)) return "Use the browser wallet on Account, then buy again. An extension account cannot sign this trade.";
  if (first.length > 220) return `${first.slice(0, 220)}…`;
  return first;
}

export async function deployFixedToken(input: {
  chain: EvmChainId;
  name: string;
  symbol: string;
  supplyWhole: bigint;
  owner: string;
}): Promise<{ ok: true; address: string; hash: string } | { ok: false; error: string }> {
  try {
    const receipt = await broadcast({
      chain: input.chain,
      from: input.owner,
      data: tokenDeployData(input.name, input.symbol, input.supplyWhole, input.owner),
    });
    if (!receipt.contractAddress || receipt.status === "0x0") {
      return { ok: false, error: "The transaction failed. Nothing was created." };
    }
    return { ok: true, address: receipt.contractAddress, hash: receipt.hash };
  } catch (err) {
    return { ok: false, error: launchError(err, input.owner) };
  }
}

export function encodeCurveConstructor(input: {
  name: string;
  symbol: string;
  supplyWhole: bigint;
  virtualNativeWei: bigint;
  virtualTokenWhole: bigint;
  graduationWei: bigint;
  maxBuyWei: bigint;
  delaySeconds: bigint;
  creator: string;
  treasury: string;
  router: string;
  wrapped: string;
  poolKind: bigint;
}): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.creator) || !/^0x[a-fA-F0-9]{40}$/.test(input.treasury)) {
    throw new Error("Creator address looks wrong.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.router) || !/^0x[a-fA-F0-9]{40}$/.test(input.wrapped)) {
    throw new Error("Pool address looks wrong.");
  }
  if (input.poolKind < 0n || input.poolKind > 3n) throw new Error("Pool kind looks wrong.");
  if (input.supplyWhole <= 0n || input.supplyWhole > 10n ** 15n) throw new Error("Supply looks wrong.");
  if (input.virtualNativeWei <= 0n || input.graduationWei <= 0n) throw new Error("Curve amounts have to be above zero.");
  const nameEnc = encodeString(input.name);
  const symbolEnc = encodeString(input.symbol);
  const headBytes = 32 * 13;
  const nameOffset = BigInt(headBytes);
  const symbolOffset = nameOffset + BigInt(nameEnc.length / 2);
  return (
    word(nameOffset) +
    word(symbolOffset) +
    word(input.supplyWhole) +
    word(input.virtualNativeWei) +
    word(input.virtualTokenWhole) +
    word(input.graduationWei) +
    word(input.maxBuyWei) +
    word(input.delaySeconds) +
    word(BigInt(input.creator)) +
    word(BigInt(input.treasury)) +
    word(BigInt(input.router)) +
    word(BigInt(input.wrapped)) +
    word(input.poolKind) +
    nameEnc +
    symbolEnc
  );
}

export async function deployCurve(input: {
  chain: EvmChainId;
  name: string;
  symbol: string;
  supplyWhole: bigint;
  virtualNativeWei: bigint;
  virtualTokenWhole: bigint;
  graduationWei: bigint;
  maxBuyWei: bigint;
  delaySeconds: bigint;
  owner: string;
  devBuyWei: bigint;
  onStatus?: (message: string, hash?: string) => void;
}): Promise<{ ok: true; address: string; hash: string } | { ok: false; error: string }> {
  try {
    const pool = CURVE_POOL[input.chain];
    const data =
      FERZAN_CURVE_BYTECODE +
      encodeCurveConstructor({
        name: input.name,
        symbol: input.symbol,
        supplyWhole: input.supplyWhole,
        virtualNativeWei: input.virtualNativeWei,
        virtualTokenWhole: input.virtualTokenWhole,
        graduationWei: input.graduationWei,
        maxBuyWei: input.maxBuyWei,
        delaySeconds: input.delaySeconds,
        creator: input.owner,
        treasury: TREASURY.evm,
        router: pool.router,
        wrapped: pool.wrapped,
        poolKind: pool.kind,
      });
    input.onStatus?.("Signing on this site.", undefined);
    const receipt = await broadcast({
      chain: input.chain,
      from: input.owner,
      data,
      value: input.devBuyWei,
    });
    input.onStatus?.("Waiting for the chain to confirm.", receipt.hash);
    if (!receipt.contractAddress || receipt.status === "0x0") {
      return { ok: false, error: "The transaction failed. Nothing was created." };
    }
    return { ok: true, address: receipt.contractAddress, hash: receipt.hash };
  } catch (err) {
    return { ok: false, error: launchError(err, input.owner) };
  }
}

export type ChainCurve = {
  virtualEth: bigint;
  virtualToken: bigint;
  graduation: bigint;
  realEth: bigint;
  raisedEth: bigint;
  tokensSold: bigint;
  graduated: boolean;
  feePlatform: bigint;
  feeCreator: bigint;
  feeReferrer: bigint;
};

function decodeState(raw: string): ChainCurve {
  const words = raw.replace(/^0x/, "").match(/.{64}/g);
  if (!words || words.length < 10) throw new Error("The curve did not answer.");
  const n = (i: number) => BigInt("0x" + words[i]);
  return {
    virtualEth: n(0),
    virtualToken: n(1),
    graduation: n(2),
    realEth: n(3),
    raisedEth: n(4),
    tokensSold: n(5),
    graduated: n(6) === 1n,
    feePlatform: n(7),
    feeCreator: n(8),
    feeReferrer: n(9),
  };
}

async function rpcCall(chain: EvmChainId, to: string, data: string): Promise<string> {
  const eth = provider();
  if (eth) {
    try {
      const out = (await eth.request({ method: "eth_call", params: [{ to, data }, "latest"] })) as string;
      if (out && out !== "0x") return out;
    } catch {
      /* public RPC next */
    }
  }
  const res = await fetch(EVM_CHAIN[chain].rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (!body.result) throw new Error(body.error?.message || "The chain did not answer.");
  return body.result;
}

export async function readCurve(chain: EvmChainId, address: string): Promise<ChainCurve> {
  return decodeState(await rpcCall(chain, address, CURVE_SELECTOR.state));
}

export async function readCurveWall(chain: EvmChainId, address: string): Promise<{ maxBuy: bigint; startAt: bigint } | null> {
  try {
    const [maxRaw, startRaw] = await Promise.all([
      rpcCall(chain, address, "0x70db69d6"),
      rpcCall(chain, address, "0xc7446565"),
    ]);
    if (!maxRaw || !startRaw) return null;
    return { maxBuy: BigInt(maxRaw), startAt: BigInt(startRaw) };
  } catch {
    return null;
  }
}

export async function readPool(chain: EvmChainId, address: string): Promise<string | null> {
  try {
    const raw = await rpcCall(chain, address, "0x16f0115b");
    const hex = raw.replace(/^0x/, "");
    if (hex.length < 64) return null;
    const pool = "0x" + hex.slice(24, 64);
    if (pool === ZERO) return null;
    return pool;
  } catch {
    return null;
  }
}

/** Where a graduated coin trades. Robinhood and Arc only have the pool address. */
export function dexSwapUrl(chain: EvmChainId, token: string): string | null {
  if (chain === "ethereum") {
    return `https://app.uniswap.org/swap?chain=ethereum&inputCurrency=NATIVE&outputCurrency=${token}`;
  }
  if (chain === "base") {
    return `https://aerodrome.finance/swap?from=eth&to=${token}`;
  }
  if (chain === "bsc") {
    return `https://pancakeswap.finance/swap?chain=bsc&outputCurrency=${token}`;
  }
  return null;
}

export function raydiumSwapUrl(mint: string): string {
  return `https://raydium.io/swap/?inputMint=sol&outputMint=${mint}`;
}

export async function readClaimable(chain: EvmChainId, curve: string, wallet: string): Promise<bigint> {
  const who = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const raw = await rpcCall(chain, curve, CURVE_SELECTOR.claimable + who);
  if (!raw || raw === "0x") return 0n;
  return BigInt(raw);
}

export async function readErc20String(chain: EvmChainId, address: string, selector: string): Promise<string> {
  const raw = await rpcCall(chain, address, selector);
  const hex = raw.replace(/^0x/, "");
  if (hex.length < 128) return "";
  const start = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2;
  const len = Number(BigInt(`0x${hex.slice(start, start + 64)}`));
  if (!Number.isFinite(len) || len <= 0 || len > 64) return "";
  const data = hex.slice(start + 64, start + 64 + len * 2);
  const bytes = data.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\u0000/g, "");
}

const BALANCE_OF = "0x70a08231";

export async function readHeld(chain: EvmChainId, token: string, wallet: string): Promise<bigint> {
  const who = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const raw = await rpcCall(chain, token, BALANCE_OF + who);
  if (!raw || raw === "0x") return 0n;
  return BigInt(raw);
}

export async function sendCurve(input: {
  chain: EvmChainId;
  address: string;
  data: string;
  value?: bigint;
  from: string;
}): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
  try {
    const receipt = await broadcast({
      chain: input.chain,
      from: input.from,
      to: input.address,
      data: input.data,
      value: input.value,
    });
    if (receipt.status === "0x0") return { ok: false, error: "The transaction failed." };
    return { ok: true, hash: receipt.hash };
  } catch (err) {
    return { ok: false, error: launchError(err, input.from) };
  }
}

export async function curveGuardsMin(chain: EvmChainId, token: string): Promise<boolean> {
  const code = (await getCode(chain, token)).toLowerCase();
  return code.includes(CURVE_SELECTOR.buyMin.slice(2));
}

async function getCode(chain: EvmChainId, token: string): Promise<string> {
  const eth = provider();
  if (eth) {
    try {
      const out = (await eth.request({ method: "eth_getCode", params: [token, "latest"] })) as string;
      if (out && out !== "0x") return out;
    } catch {
      /* public RPC next */
    }
  }
  const res = await fetch(EVM_CHAIN[chain].rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [token, "latest"] }),
  });
  const body = (await res.json()) as { result?: string };
  return body.result || "0x";
}

export function buyData(referrer: string, minTokens?: bigint): string {
  const who = referrer && /^0x[a-fA-F0-9]{40}$/.test(referrer) ? referrer : "0x0000000000000000000000000000000000000000";
  const addr = word(BigInt(who));
  if (minTokens != null) return CURVE_SELECTOR.buyMin + addr + word(minTokens);
  return CURVE_SELECTOR.buy + addr;
}

export function sellData(amount: bigint, minNative?: bigint): string {
  if (minNative != null) return CURVE_SELECTOR.sellMin + word(amount) + word(minNative);
  return CURVE_SELECTOR.sell + word(amount);
}

export function claimData(): string {
  return CURVE_SELECTOR.claim;
}

async function waitReceipt(eth: Provider, hash: string): Promise<{ status?: string; contractAddress?: string | null }> {
  for (let i = 0; i < 90; i += 1) {
    const receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] })) as {
      status?: string;
      contractAddress?: string | null;
    } | null;
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Still confirming. The coin exists once this transaction lands. Check the wallet for the hash.");
}
