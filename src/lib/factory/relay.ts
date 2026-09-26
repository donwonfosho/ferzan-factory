import { createServerFn } from "@tanstack/react-start";

const CHAINS = {
  ethereum: { chainId: 1, rpc: ["https://ethereum.publicnode.com", "https://eth.llamarpc.com"] },
  bsc: { chainId: 56, rpc: ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com"] },
  base: { chainId: 8453, rpc: ["https://mainnet.base.org", "https://base.publicnode.com"] },
  robinhood: { chainId: 4663, rpc: ["https://rpc.mainnet.chain.robinhood.com"] },
  arc: { chainId: 5042, rpc: ["https://rpc.mainnet.arc.io"] },
} as const;

export type RelayChain = keyof typeof CHAINS;

export type PreparedTx = {
  chainId: number;
  nonce: string;
  gas: string;
  gasPrice: string;
  value: string;
  to: string;
};

export type ChainReceipt = { status: string; contractAddress: string | null; hash: string };

function asChain(value: unknown): RelayChain {
  if (value === "ethereum" || value === "bsc" || value === "base" || value === "robinhood" || value === "arc") return value;
  throw new Error("That chain is not open.");
}

function asAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error(`${label} looks wrong.`);
  return value;
}

function asHex(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]*$/.test(value) || value.length > max) {
    throw new Error(`${label} looks wrong.`);
  }
  return value;
}

function asWei(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value) || value.length > 78) throw new Error("Amount looks wrong.");
  return value;
}

async function rpc(chain: RelayChain, method: string, params: unknown[], timeout = 8000): Promise<unknown> {
  let last = "The chain did not answer.";
  for (const url of CHAINS[chain].rpc) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(timeout),
      });
      const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) {
        last = body.error.message || "The chain rejected that.";
        continue;
      }
      if (body.result === undefined) {
        last = "The chain did not answer.";
        continue;
      }
      return body.result;
    } catch (err) {
      last = err instanceof Error ? err.message : "The chain did not answer.";
    }
  }
  throw new Error(last);
}

export function chainRpc(chain: RelayChain, method: string, params: unknown[], timeout = 8000): Promise<unknown> {
  return rpc(chain, method, params, timeout);
}

export async function chainRpcBatch(
  chain: RelayChain,
  calls: { method: string; params: unknown[] }[],
): Promise<(unknown | null)[]> {
  let last = "The chain did not answer.";
  const payload = calls.map((call, id) => ({ jsonrpc: "2.0", id, method: call.method, params: call.params }));
  for (const url of CHAINS[chain].rpc) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(14000),
      });
      const body = (await res.json()) as { id?: number; result?: unknown }[];
      if (!Array.isArray(body)) {
        last = "The chain did not answer.";
        continue;
      }
      const out: (unknown | null)[] = calls.map(() => null);
      for (const row of body) {
        if (typeof row.id === "number" && row.id >= 0 && row.id < out.length) out[row.id] = row.result ?? null;
      }
      return out;
    } catch (err) {
      last = err instanceof Error ? err.message : "The chain did not answer.";
    }
  }
  throw new Error(last);
}

function hexToDec(hex: unknown): string {
  if (typeof hex !== "string" || !/^0x[a-fA-F0-9]+$/.test(hex)) throw new Error("The chain answered in a shape we cannot use.");
  return BigInt(hex).toString();
}

export const prepareTx = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; from: string; to: string; data: string; value: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad transaction.");
    const row = data as Record<string, unknown>;
    const to = typeof row.to === "string" && row.to === "" ? "" : asAddress(row.to, "Contract");
    return {
      chain: asChain(row.chain),
      from: asAddress(row.from, "Wallet"),
      to,
      data: asHex(row.data, "Transaction", 160_000),
      value: asWei(typeof row.value === "string" ? row.value : "0"),
    };
  })
  .handler(async ({ data }): Promise<PreparedTx> => {
    const guard = await import("./guard.server");
    await guard.guardRelay("send");
    await guard.assertAllowedEvmTx(data.chain, data.to || null, data.data);
    const tx: { from: string; data: string; value: string; to?: string } = {
      from: data.from,
      data: data.data,
      value: "0x" + BigInt(data.value).toString(16),
    };
    if (data.to) tx.to = data.to;
    const [nonceHex, priceHex, gasHex] = await Promise.all([
      rpc(data.chain, "eth_getTransactionCount", [data.from, "pending"]),
      rpc(data.chain, "eth_gasPrice", []),
      rpc(data.chain, "eth_estimateGas", [tx]),
    ]);
    const estimate = BigInt(hexToDec(gasHex));
    const gas = estimate + estimate / 5n;
    return {
      chainId: CHAINS[data.chain].chainId,
      nonce: hexToDec(nonceHex),
      gas: gas.toString(),
      gasPrice: hexToDec(priceHex),
      value: data.value,
      to: data.to,
    };
  });

export const broadcastSigned = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; raw: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad transaction.");
    const row = data as Record<string, unknown>;
    return { chain: asChain(row.chain), raw: asHex(row.raw, "Signed transaction", 200_000) };
  })
  .handler(async ({ data }): Promise<{ hash: string }> => {
    const guard = await import("./guard.server");
    await guard.guardRelay("send");
    const { parseTransaction } = await import("viem");
    let parsed: { to?: string | null; data?: string; chainId?: number };
    try {
      parsed = parseTransaction(data.raw as `0x${string}`);
    } catch {
      throw new Error("Signed transaction looks wrong.");
    }
    if (parsed.chainId !== CHAINS[data.chain].chainId) throw new Error("That transaction is for another chain.");
    await guard.assertAllowedEvmTx(data.chain, parsed.to ?? null, parsed.data ?? "0x");
    const hash = await rpc(data.chain, "eth_sendRawTransaction", [data.raw]);
    if (typeof hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error("The chain did not take the transaction.");
    return { hash };
  });

export const getReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; hash: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad receipt request.");
    const row = data as Record<string, unknown>;
    const hash = row.hash;
    if (typeof hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error("Transaction hash looks wrong.");
    return { chain: asChain(row.chain), hash };
  })
  .handler(async ({ data }): Promise<ChainReceipt | null> => {
    await (await import("./guard.server")).guardRelay("read");
    const receipt = await rpc(data.chain, "eth_getTransactionReceipt", [data.hash]);
    if (!receipt || typeof receipt !== "object") return null;
    const row = receipt as { status?: string; contractAddress?: string | null };
    return {
      hash: data.hash,
      status: typeof row.status === "string" ? row.status : "0x0",
      contractAddress: typeof row.contractAddress === "string" ? row.contractAddress : null,
    };
  });

export const readBalance = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; address: string } => {
    if (!data || typeof data !== "object") throw new Error("Bad balance request.");
    const row = data as Record<string, unknown>;
    return { chain: asChain(row.chain), address: asAddress(row.address, "Wallet") };
  })
  .handler(async ({ data }): Promise<{ wei: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    const hex = await rpc(data.chain, "eth_getBalance", [data.address, "latest"]);
    return { wei: hexToDec(hex) };
  });

const BALANCE_OF = "0x70a08231";

export const readTokenBalances = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: RelayChain; wallet: string; tokens: { address: string; symbol: string }[] } => {
    if (!data || typeof data !== "object") throw new Error("Bad token balance request.");
    const row = data as Record<string, unknown>;
    if (!Array.isArray(row.tokens) || row.tokens.length > 24) throw new Error("Too many tokens.");
    const tokens = row.tokens.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Token looks wrong.");
      const token = item as Record<string, unknown>;
      const symbol = typeof token.symbol === "string" ? token.symbol.slice(0, 12) : "";
      if (!symbol) throw new Error("Token looks wrong.");
      return { address: asAddress(token.address, "Token"), symbol };
    });
    return { chain: asChain(row.chain), wallet: asAddress(row.wallet, "Wallet"), tokens };
  })
  .handler(async ({ data }): Promise<{ address: string; symbol: string; raw: string }[]> => {
    await (await import("./guard.server")).guardRelay("read");
    const who = data.wallet.slice(2).toLowerCase().padStart(64, "0");
    const dataWord = BALANCE_OF + who;
    const rows = await Promise.all(
      data.tokens.map(async (token) => {
        try {
          const hex = await rpc(data.chain, "eth_call", [{ to: token.address, data: dataWord }, "latest"]);
          return { address: token.address, symbol: token.symbol, raw: hexToDec(hex) };
        } catch {
          return { address: token.address, symbol: token.symbol, raw: "0" };
        }
      }),
    );
    return rows.filter((row) => row.raw !== "0");
  });
