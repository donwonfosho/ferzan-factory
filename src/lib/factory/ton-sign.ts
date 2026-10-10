/**
 * Sends a TON Connect style request (messages with amount, stateInit, payload) from the account's
 * own TON wallet held by Privy.
 *
 * The wallet is a standard wallet V4R2 contract. The body cell is signed by Privy's raw-hash signer
 * (ed25519): the same 32-byte cell hash a normal wallet signs, passed as given (Privy's TON guide
 * does exactly this; sha256 in that guide is only for signing text messages). Nothing is sent until
 * the caller has the user's confirmation; this function only runs after the site's confirm click.
 */
import "@/lib/factory/buffer-polyfill";
import type { TonMessage } from "./bot-launch";
import type { AccountWallets } from "./wallet-bridge";
import { getTonWalletState, sendTonMessage } from "./site-chains";

const hexOf = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
/** Keeps this much for the wallet's own fees on top of what the messages carry. */
const FEE_RESERVE = 50_000_000n; // 0.05 TON
/** Mainnet V4R2 subwallet id. Workchain 0 does not add anything to it. */
const WALLET_ID = 698983191;

/** Unix seconds, about 5 minutes ahead. A millisecond timestamp is converted; a past or absurd value is replaced. */
function validUntilSeconds(value: number, now: number): number {
  let t = Number.isFinite(value) ? Math.floor(value) : 0;
  if (t > 10_000_000_000) t = Math.floor(t / 1000);
  if (t < now + 60 || t > now + 900 || t > 0xffffffff) return now + 300;
  return t;
}

export async function rawTonAddress(address: string): Promise<string> {
  const { Address } = await import("@ton/core");
  return Address.parse(address).toRawString();
}

export async function sendFromAccountTon(
  acc: AccountWallets,
  req: { validUntil: number; messages: TonMessage[] },
): Promise<string> {
  if (!acc.tonAddress) throw new Error("This account has no TON wallet yet.");
  if (req.messages.length < 1 || req.messages.length > 4) throw new Error("A TON wallet sends 1 to 4 messages at once.");
  const now = Math.floor(Date.now() / 1000);
  const validUntil = validUntilSeconds(req.validUntil, now);

  const [{ Address, SendMode, beginCell, external, internal, loadStateInit, storeMessage, Cell }, { WalletContractV4 }, { signVerify }] = await Promise.all([
    import("@ton/core"),
    import("@ton/ton"),
    import("@ton/crypto"),
  ]);

  const own = Address.parse(acc.tonAddress);
  const state0 = await getTonWalletState({ data: { address: own.toRawString() } });
  // Public key: from Privy; a deployed wallet can also tell us on chain.
  let keyHex = state0.publicKey;
  if (!keyHex) keyHex = await acc.tonPublicKey();
  const publicKeyHex = keyHex;
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: Buffer.from(publicKeyHex, "hex"), walletId: WALLET_ID });
  if (wallet.walletId !== WALLET_ID) throw new Error(`V4R2 wallet_id is ${wallet.walletId}, not ${WALLET_ID}. Nothing was sent.`);
  if (!wallet.address.equals(own)) {
    throw new Error("Your Privy TON wallet is not a V4R2 wallet, so the site cannot sign for it yet. Use Tonkeeper or another TON wallet.");
  }
  const chainSeqno = state0.seqno;
  const deploy = state0.state === "uninitialized" || (state0.state === "unknown" && chainSeqno === 0);
  const facts = `Wallet ${own.toRawString()} state ${state0.state}. Chain seqno ${chainSeqno}. Message seqno ${chainSeqno}. wallet_id ${wallet.walletId}. valid_until ${validUntil} (now ${now}, ${validUntil - now}s ahead).`;
  console.info(facts);

  const total = req.messages.reduce((sum, m) => sum + BigInt(m.amount), 0n);
  if (BigInt(state0.balance) < total + FEE_RESERVE) {
    throw new Error("Not enough TON in your account wallet. Add TON to the TON address on your account page first.");
  }

  const messages = req.messages.map((m) => {
    let bounce = true;
    try {
      bounce = Address.parseFriendly(m.address).isBounceable;
    } catch {
      /* raw address: bounceable */
    }
    return internal({
      to: Address.parse(m.address),
      value: BigInt(m.amount),
      bounce,
      init: m.stateInit ? loadStateInit(Cell.fromBase64(m.stateInit).beginParse()) : undefined,
      body: m.payload ? Cell.fromBase64(m.payload) : undefined,
    });
  });

  // Privy TON wallets are Wallet V4R2. signRawHash signs the 32-byte cell hash (ed25519); the contract checks that same hash.
  const transfer = wallet.createTransfer({
    seqno: chainSeqno,
    messages,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    timeout: validUntil,
    signer: async (cell) => {
      const hash = hexOf(cell.hash());
      const rawSig = String(await acc.tonSignHash(hash)).trim();
      const hex = rawSig.replace(/^0x/i, "");
      const sig = /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0 ? Buffer.from(hex, "hex") : Buffer.alloc(0);
      const pub = Buffer.from(publicKeyHex, "hex");
      const signed = sig.length === 64 ? sig : sig.length === 65 ? sig.subarray(0, 64) : sig;
      const matches = signed.length === 64 && signVerify(cell.hash(), signed, pub);
      if (!matches) {
        throw new Error(
          `${facts} The TON signature does not match this V4R2 wallet. Unsigned message hash ${hash}. Signature length ${sig.length} bytes. Nothing was sent.`,
        );
      }
      return signed;
    },
  });
  const signedBody = await transfer;

  if (deploy && !wallet.init?.code) {
    throw new Error("This wallet has never sent a transaction, and its deploy data is missing. Nothing was sent.");
  }
  const message = external({
    to: wallet.address,
    init: deploy ? wallet.init : null, // uninitialized: the first outgoing message carries the V4R2 code and key
    body: signedBody,
  });
  if (deploy && !message.init) throw new Error("This wallet has never sent a transaction, and its deploy data is missing. Nothing was sent.");
  const boc = beginCell().store(storeMessage(message)).endCell().toBoc().toString("base64");
  try {
    await sendTonMessage({ data: { boc } });
  } catch (err) {
    const msg = (err instanceof Error ? err.message : "").replace(/\s+/g, " ").trim();
    console.error("TON relay send failed", facts, msg);
    throw new Error(msg && !msg.startsWith("{") ? msg : "The TON network is busy, try again in a minute.");
  }
  return boc;
}
