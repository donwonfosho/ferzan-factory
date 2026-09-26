/**
 * Server-side checks that read the chain instead of trusting the browser.
 * Used by publishCoin (did this wallet really create this coin?) and
 * recordTrade (what did this transaction really trade?).
 */
import { chainRpc, type RelayChain } from "./relay";

/** keccak256("Trade(address,bool,uint256,uint256,address)"), emitted by the site curve (contracts/FerzanCurve.sol). */
const TRADE_TOPIC = "0xffbf3942a32ceb2aabfe4f2596228deead369ce3b97102bb8734075fe3510af5";

/** Solana programs whose transactions count as trades: the site curve and Meteora DBC. */
const SOLANA_TRADE_PROGRAMS = new Set([
  "G7n5XBB7pjvKS7JfC6esgQGGAyPku5cposdiHfVAUxnJ",
  "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
]);

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

export const EVM_CHAINS = new Set<RelayChain>(["ethereum", "bsc", "base", "robinhood", "arc"]);

export type ChainPrint = {
  contract: string;
  side: "buy" | "sell";
  /** buy: native spent (wei / lamports). sell: tokens sold (raw units). Same meaning as before. */
  amountWei: string;
  who: string;
  price: string;
  txHash: string;
  logIndex: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function priceText(native: bigint, nativeDecimals: number, tokens: bigint, tokenDecimals: number): string {
  if (native <= 0n || tokens <= 0n) return "";
  const n = Number(native) / 10 ** nativeDecimals / (Number(tokens) / 10 ** tokenDecimals);
  return Number.isFinite(n) && n > 0 ? n.toPrecision(12) : "";
}

type EvmReceipt = {
  status?: string;
  from?: string;
  contractAddress?: string | null;
  logs?: { address?: string; topics?: string[]; data?: string; logIndex?: string }[];
};

async function evmReceipt(chain: RelayChain, hash: string): Promise<EvmReceipt> {
  for (let i = 0; i < 4; i += 1) {
    const receipt = (await chainRpc(chain, "eth_getTransactionReceipt", [hash]).catch(() => null)) as EvmReceipt | null;
    if (receipt && typeof receipt === "object") {
      if (receipt.status !== "0x1") throw new Error("That transaction failed on chain.");
      return receipt;
    }
    await sleep(1500);
  }
  throw new Error("That transaction is not on chain yet. Try again in a moment.");
}

/** EVM: the deploy tx succeeded, created `contract`, and was sent by `creator`. */
export async function verifyEvmLaunch(chain: RelayChain, hash: string, contract: string, creator: string): Promise<void> {
  const receipt = await evmReceipt(chain, hash);
  if ((receipt.contractAddress ?? "").toLowerCase() !== contract.toLowerCase()) {
    throw new Error("That transaction did not create this contract.");
  }
  let from = receipt.from;
  if (!from) {
    const tx = (await chainRpc(chain, "eth_getTransactionByHash", [hash])) as { from?: string } | null;
    from = tx?.from;
  }
  if (!from || from.toLowerCase() !== creator.toLowerCase()) throw new Error("That coin was created by another wallet.");
}

/** EVM: every site-curve Trade event in the tx. The caller keeps only coins on the board. */
export async function evmTradePrints(chain: RelayChain, hash: string): Promise<ChainPrint[]> {
  const receipt = await evmReceipt(chain, hash);
  const out: ChainPrint[] = [];
  for (const log of receipt.logs ?? []) {
    const topics = log.topics ?? [];
    if ((topics[0] ?? "").toLowerCase() !== TRADE_TOPIC || topics.length < 2 || !log.address) continue;
    const data = (log.data ?? "").replace(/^0x/, "");
    if (data.length < 64 * 3) continue;
    const word = (i: number) => BigInt("0x" + data.slice(i * 64, i * 64 + 64));
    const isBuy = word(0) !== 0n;
    const native = word(1);
    const tokens = word(2);
    out.push({
      contract: log.address.toLowerCase(),
      side: isBuy ? "buy" : "sell",
      amountWei: (isBuy ? native : tokens).toString(),
      who: "0x" + topics[1].slice(-40).toLowerCase(),
      price: priceText(native, 18, tokens, 18),
      txHash: hash.toLowerCase(),
      logIndex: log.logIndex ? Number(BigInt(log.logIndex)) : out.length,
    });
  }
  return out;
}

type ParsedIx = { program?: string; programId?: { toBase58(): string }; parsed?: { type?: string; info?: Record<string, unknown> } };

async function solanaTx(signature: string) {
  const { Connection } = await import("@solana/web3.js");
  const rpc = new Connection(SOLANA_RPC, "confirmed");
  for (let i = 0; i < 4; i += 1) {
    const tx = await rpc.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (tx) {
      if (!tx.meta || tx.meta.err) throw new Error("That transaction failed on chain.");
      return tx;
    }
    await sleep(1500);
  }
  throw new Error("That transaction is not on chain yet. Try again in a moment.");
}

function allInstructions(tx: Awaited<ReturnType<typeof solanaTx>>): ParsedIx[] {
  const outer = tx.transaction.message.instructions as unknown as ParsedIx[];
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((row) => row.instructions as unknown as ParsedIx[]);
  return [...outer, ...inner];
}

/** Solana: the tx succeeded, was paid by `creator`, and initialized the `mint`. */
export async function verifySolanaLaunch(signature: string, mint: string, creator: string): Promise<void> {
  const tx = await solanaTx(signature);
  const payer = tx.transaction.message.accountKeys[0]?.pubkey.toBase58();
  if (payer !== creator) throw new Error("That coin was created by another wallet.");
  const made = allInstructions(tx).some(
    (ix) =>
      ix.program === "spl-token" &&
      (ix.parsed?.type === "initializeMint" || ix.parsed?.type === "initializeMint2") &&
      ix.parsed?.info?.mint === mint,
  );
  if (!made) throw new Error("That transaction did not create this mint.");
}

/** Solana: the signer's token and SOL balance changes in a curve or DBC trade. */
export async function solanaTradePrints(signature: string): Promise<ChainPrint[]> {
  const tx = await solanaTx(signature);
  const keys = tx.transaction.message.accountKeys;
  const programs = new Set(allInstructions(tx).map((ix) => ix.programId?.toBase58() ?? ""));
  if (![...programs].some((id) => SOLANA_TRADE_PROGRAMS.has(id))) return [];
  const who = keys[0]?.pubkey.toBase58();
  const meta = tx.meta;
  if (!who || !meta) return [];
  const fee = BigInt(meta.fee);
  const solDelta = BigInt(meta.postBalances[0]) - BigInt(meta.preBalances[0]) + fee;
  const pre = new Map<string, { raw: bigint; dec: number }>();
  const post = new Map<string, { raw: bigint; dec: number }>();
  for (const row of meta.preTokenBalances ?? []) {
    if (row.owner === who) pre.set(row.mint, { raw: BigInt(row.uiTokenAmount.amount), dec: row.uiTokenAmount.decimals });
  }
  for (const row of meta.postTokenBalances ?? []) {
    if (row.owner === who) post.set(row.mint, { raw: BigInt(row.uiTokenAmount.amount), dec: row.uiTokenAmount.decimals });
  }
  const out: ChainPrint[] = [];
  // A sell that empties the wallet can close the token account, so it only shows in `pre`.
  for (const mint of new Set([...pre.keys(), ...post.keys()])) {
    if (mint === "So11111111111111111111111111111111111111112") continue;
    const dec = (post.get(mint) ?? pre.get(mint))!.dec;
    const delta = (post.get(mint)?.raw ?? 0n) - (pre.get(mint)?.raw ?? 0n);
    if (delta === 0n) continue;
    const isBuy = delta > 0n;
    const tokens = isBuy ? delta : -delta;
    const lamports = isBuy ? -solDelta : solDelta;
    if (lamports <= 0n) continue;
    out.push({
      contract: mint,
      side: isBuy ? "buy" : "sell",
      amountWei: (isBuy ? lamports : tokens).toString(),
      who,
      price: priceText(lamports, 9, tokens, dec),
      txHash: signature,
      logIndex: out.length,
    });
  }
  return out;
}
