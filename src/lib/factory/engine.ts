import { fillBuy, fillSell, quoteBuy, quoteSell, spot, type Curve } from "./curve";
import { CHAINS } from "./catalog";
import type {
  AttachInput,
  ChainId,
  Desk,
  Floor,
  Launch,
  PrimaryInput,
  TradeInput,
} from "./types";
import { formatSmart, parseDecimal, parseWhole } from "./units";

const SUPPLY = "1000000000";

function emptyDesk(): Desk {
  const balances = {} as Record<ChainId, string>;
  (Object.keys(CHAINS) as ChainId[]).forEach((id) => {
    const start: Record<ChainId, string> = {
      ethereum: "6",
      bsc: "20",
      base: "6",
      robinhood: "12",
      solana: "40",
      arc: "0",
    };
    const dec = CHAINS[id].nativeDecimals;
    balances[id] = (parseDecimal(start[id], dec) ?? 0n).toString();
  });
  return { balances, tokens: {}, bought: {} };
}

function curveOf(l: Launch): Curve {
  return {
    virtualEth: BigInt(l.virtualEth),
    virtualToken: BigInt(l.virtualToken),
    graduation: BigInt(l.graduation),
    realEth: BigInt(l.realEth),
    raisedEth: BigInt(l.raisedEth),
    tokensSold: BigInt(l.tokensSold),
    graduated: l.graduated,
    feePlatform: BigInt(l.feePlatform),
    feeCreator: BigInt(l.feeCreator),
    feeReferrer: BigInt(l.feeReferrer),
  };
}

function writeCurve(l: Launch, c: Curve, price: number): Launch {
  return {
    ...l,
    virtualEth: c.virtualEth.toString(),
    virtualToken: c.virtualToken.toString(),
    graduation: c.graduation.toString(),
    realEth: c.realEth.toString(),
    raisedEth: c.raisedEth.toString(),
    tokensSold: c.tokensSold.toString(),
    graduated: c.graduated,
    feePlatform: c.feePlatform.toString(),
    feeCreator: c.feeCreator.toString(),
    feeReferrer: c.feeReferrer.toString(),
    lastPrice: price,
  };
}

function pushTape(l: Launch, tick: Launch["tape"][number]): Launch {
  return { ...l, tape: [tick, ...l.tape].slice(0, 14) };
}

function replace(list: Launch[], next: Launch): Launch[] {
  return list.map((item) => (item.id === next.id ? next : item));
}

export function creatorLabel(name: string): string {
  if (name === "you") return "Your desk";
  if (/^0x[a-fA-F0-9]{40}$/.test(name)) return `${name.slice(0, 6)}…${name.slice(-4)}`;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(name)) return `${name.slice(0, 4)}…${name.slice(-4)}`;
  return name;
}

export function owns(creator: string, wallet: string): boolean {
  if (creator === "you") return true;
  return Boolean(wallet) && creator.toLowerCase() === wallet.toLowerCase();
}

function blank(partial: Pick<Launch, "id" | "kind" | "chain" | "mode" | "name" | "symbol" | "creator" | "blurb" | "createdAt"> & Partial<Launch>): Launch {
  const chain = CHAINS[partial.chain];
  const supplyWhole = partial.supplyWhole ?? SUPPLY;
  const supplyRaw =
    partial.supplyRaw ??
    ((parseWhole(supplyWhole) ?? 0n) * 10n ** BigInt(chain.tokenDecimals)).toString();
  return {
    id: partial.id,
    kind: partial.kind,
    chain: partial.chain,
    mode: partial.mode,
    name: partial.name,
    symbol: partial.symbol,
    supplyRaw,
    supplyWhole,
    creator: partial.creator,
    blurb: partial.blurb,
    telegram: partial.telegram ?? "",
    xHandle: partial.xHandle ?? "",
    image: partial.image ?? "",
    contract: partial.contract ?? "",
    devBuy: partial.devBuy ?? "0",
    createdAt: partial.createdAt,
    virtualEth: partial.virtualEth ?? "0",
    virtualToken: partial.virtualToken ?? "0",
    graduation: partial.graduation ?? "0",
    realEth: partial.realEth ?? "0",
    raisedEth: partial.raisedEth ?? "0",
    tokensSold: partial.tokensSold ?? "0",
    graduated: partial.graduated ?? false,
    startAt: partial.startAt ?? partial.createdAt,
    maxBuy: partial.maxBuy ?? "0",
    allocs: partial.allocs ?? [],
    feePlatform: partial.feePlatform ?? "0",
    feeCreator: partial.feeCreator ?? "0",
    feeReferrer: partial.feeReferrer ?? "0",
    lastPrice: partial.lastPrice ?? 0,
    primaryId: partial.primaryId ?? null,
    bots: partial.bots ?? [],
    group: partial.group ?? "",
    tape: partial.tape ?? [],
  };
}

function handleOf(raw: string, label: string): { ok: true; value: string } | { ok: false; error: string } {
  let value = raw.trim();
  if (!value) return { ok: true, value: "" };
  value = value.replace(/^https?:\/\/(www\.)?(t\.me|x\.com|twitter\.com)\//i, "");
  value = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{4,32}$/.test(value)) return { ok: false, error: `${label} handle looks wrong.` };
  return { ok: true, value };
}

function nativeOf(chain: ChainId, human: string): bigint | null {
  return parseDecimal(human, CHAINS[chain].nativeDecimals);
}

type BuyResult = { ok: true; floor: Floor; out: bigint; price: number } | { ok: false; error: string };

function applyBuy(
  floor: Floor,
  launchId: string,
  ethIn: bigint,
  who: string,
  at: number,
  attachId: string | null,
  fromDesk: boolean,
): BuyResult {
  const launch = floor.launches.find((item) => item.id === launchId);
  if (!launch || launch.kind !== "primary") return { ok: false, error: "That coin is not a primary." };
  if (launch.mode !== "curve") return { ok: false, error: "This is a fixed mint. There is no curve to trade." };
  if (launch.graduated) return { ok: false, error: "Curve has graduated. LP is marked burned." };
  if (at < launch.startAt) return { ok: false, error: "Trading is not open yet." };
  if (ethIn <= 0n) return { ok: false, error: "Amount is zero." };
  const chain = CHAINS[launch.chain];
  const maxBuy = BigInt(launch.maxBuy);
  const bought = BigInt(floor.desk.bought[launch.id] ?? "0");
  if (maxBuy > 0n && bought + ethIn > maxBuy) return { ok: false, error: "Over the max buy for this desk." };
  const balance = BigInt(floor.desk.balances[launch.chain] ?? "0");
  if (fromDesk && balance < ethIn) return { ok: false, error: "Not enough desk balance." };

  let payReferrer = false;
  let attach = null as Launch | null;
  if (attachId) {
    attach = floor.launches.find((item) => item.id === attachId && item.kind === "attached" && item.primaryId === launch.id) ?? null;
    if (!attach) return { ok: false, error: "That attach is not on this coin." };
    if (attach.creator === "you" && fromDesk) {
      payReferrer = false;
    } else {
      payReferrer = true;
    }
  }

  let fill;
  try {
    fill = fillBuy(curveOf(launch), ethIn, payReferrer, chain.nativeDecimals, chain.tokenDecimals);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Quote failed." };
  }

  let next = writeCurve(launch, fill.curve, fill.price);
  const detail = `${formatSmart(ethIn, chain.nativeDecimals)} ${chain.native} → ${formatSmart(fill.tokensOut, chain.tokenDecimals)} ${launch.symbol}`;
  next = pushTape(next, { t: at, side: "buy", who, detail, price: fill.price });
  if (fill.justGraduated) {
    next = pushTape(next, {
      t: at + 1,
      side: "grad",
      who: "Factory",
      detail: "Graduated. Buys are closed. Sells can still exit.",
      price: fill.price,
    });
  }

  let launches = replace(floor.launches, next);
  if (attach && fill.split.referrer > 0n) {
    const earned = BigInt(attach.feeReferrer) + fill.split.referrer;
    launches = replace(launches, { ...attach, feeReferrer: earned.toString() });
  }

  const desk: Desk = {
    balances: { ...floor.desk.balances },
    tokens: { ...floor.desk.tokens },
    bought: { ...floor.desk.bought },
  };
  if (fromDesk) {
    desk.balances[launch.chain] = (balance - ethIn).toString();
    desk.tokens[launch.id] = (BigInt(desk.tokens[launch.id] ?? "0") + fill.tokensOut).toString();
    desk.bought[launch.id] = (bought + ethIn).toString();
  }
  return { ok: true, floor: { launches, desk }, out: fill.tokensOut, price: fill.price };
}

export function stampPrimary(floor: Floor, input: PrimaryInput, now = Date.now()): { ok: true; floor: Floor; id: string } | { ok: false; error: string } {
  const chain = CHAINS[input.chain];
  if (!chain || chain.status !== "live") return { ok: false, error: "That chain is not open yet." };
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  if (name.length < 2 || name.length > 32) return { ok: false, error: "Name needs 2–32 characters." };
  if (!/^[A-Z0-9]{2,8}$/.test(symbol)) return { ok: false, error: "Ticker is 2–8 letters or numbers." };
  const supply = parseWhole(input.supplyWhole);
  if (!supply) return { ok: false, error: "Supply has to be a whole number." };
  const blurb = input.blurb.trim();
  if (blurb.length > 160) return { ok: false, error: "Description is too long." };
  const telegram = handleOf(input.telegram, "Telegram");
  if (!telegram.ok) return telegram;
  const xHandle = handleOf(input.xHandle, "X");
  if (!xHandle.ok) return xHandle;
  const image = input.image.trim();
  if (image && (!image.startsWith("data:image/") || image.length > 200_000)) {
    return { ok: false, error: "Artwork has to be a small PNG or JPG." };
  }
  const who = input.creator.trim() || "you";
  const contract = input.contract.trim();
  if (input.chain === "solana") {
    if (contract && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract)) {
      return { ok: false, error: "Mint address looks wrong." };
    }
  } else if (contract && !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
    return { ok: false, error: "Contract address looks wrong." };
  }

  const allocs: Launch["allocs"] = [];
  let bpsSum = 0;
  for (const row of input.allocs) {
    const label = row.label.trim();
    const pct = row.percent.trim();
    if (!label && !pct) continue;
    if (label.length < 2) return { ok: false, error: "Each allocation needs a label." };
    if (!/^\d+(\.\d{1,2})?$/.test(pct)) return { ok: false, error: "Allocation percent looks wrong." };
    const bps = Math.round(Number(pct) * 100);
    if (bps <= 0 || bps > 2000) return { ok: false, error: "Each allocation is capped at 20%." };
    bpsSum += bps;
    allocs.push({ label, bps });
  }
  if (bpsSum >= 10_000) return { ok: false, error: "Allocations would consume the whole supply." };

  const delay = input.delayMin.trim() === "" ? 0 : Number(input.delayMin);
  if (!Number.isInteger(delay) || delay < 0 || delay > 10_080) {
    return { ok: false, error: "Delay is whole minutes, up to a week." };
  }
  const devHuman = input.devBuy.trim() === "" ? "0" : input.devBuy.trim();
  const devBuy = nativeOf(input.chain, devHuman);
  if (devBuy == null) return { ok: false, error: "Dev buy amount looks wrong." };
  if (delay > 0 && devBuy > 0n) {
    return {
      ok: false,
      error: "Dev buy is the first trade inside the launch, so the curve has to open now. Clear the delay or the dev buy.",
    };
  }

  const supplyRaw = supply * 10n ** BigInt(chain.tokenDecimals);
  let virtualEth = 0n;
  let virtualToken = 0n;
  let graduation = 0n;
  let maxBuy = 0n;
  if (input.mode === "curve") {
    const gradHuman = input.graduation.trim() || (input.chain === "solana" ? "50" : "5");
    const virtHuman = input.virtualNative.trim() || "1";
    graduation = nativeOf(input.chain, gradHuman) ?? -1n;
    virtualEth = nativeOf(input.chain, virtHuman) ?? -1n;
    if (graduation <= 0n || virtualEth <= 0n) return { ok: false, error: "Graduation and starting reserve have to be above zero." };
    const virtWhole = input.virtualTokenWhole.trim();
    const virtTokens = virtWhole ? parseWhole(virtWhole) : (supply * 80n) / 100n;
    if (!virtTokens || virtTokens <= 0n) return { ok: false, error: "Curve depth looks wrong." };
    if (virtTokens > supply * 5n) return { ok: false, error: "Curve depth is too deep for that supply." };
    virtualToken = virtTokens * 10n ** BigInt(chain.tokenDecimals);
    const capHuman = input.maxBuy.trim() === "" ? "0" : input.maxBuy.trim();
    const cap = nativeOf(input.chain, capHuman);
    if (cap == null) return { ok: false, error: "Max buy looks wrong." };
    maxBuy = cap;
  }

  const id = crypto.randomUUID().slice(0, 8);
  const curve: Curve = {
    virtualEth,
    virtualToken,
    graduation,
    realEth: 0n,
    raisedEth: 0n,
    tokensSold: 0n,
    graduated: false,
    feePlatform: 0n,
    feeCreator: 0n,
    feeReferrer: 0n,
  };
  const price = input.mode === "curve" ? spot(curve, chain.nativeDecimals, chain.tokenDecimals) : 0;
  let launch = blank({
    id,
    kind: "primary",
    chain: input.chain,
    mode: input.mode,
    name,
    symbol,
    creator: who,
    blurb: blurb || (input.mode === "curve" ? "Primary curve. You keep the creator cut." : "Regular pool. Fixed supply. No curve fee."),
    telegram: telegram.value,
    xHandle: xHandle.value,
    image,
    contract,
    devBuy: devHuman,
    createdAt: now,
    supplyWhole: supply.toString(),
    supplyRaw: supplyRaw.toString(),
    virtualEth: virtualEth.toString(),
    virtualToken: virtualToken.toString(),
    graduation: graduation.toString(),
    startAt: now + delay * 60_000,
    maxBuy: maxBuy.toString(),
    allocs,
    lastPrice: price,
    tape: [
      {
        t: now,
        side: "stamp",
        who: "You",
        detail: input.mode === "curve" ? "Primary stamped on a curve." : "Primary stamped as a fixed mint.",
        price,
      },
    ],
  });

  let nextFloor: Floor = { launches: [launch, ...floor.launches], desk: floor.desk };
  if (devBuy > 0n && !contract) {
    const bought = applyBuy(nextFloor, id, devBuy, "You", now, null, true);
    if (!bought.ok) return bought;
    nextFloor = bought.floor;
  }
  return { ok: true, floor: nextFloor, id };
}

export function armAttach(floor: Floor, input: AttachInput, now = Date.now()): { ok: true; floor: Floor; id: string } | { ok: false; error: string } {
  const primary = floor.launches.find((item) => item.id === input.primaryId && item.kind === "primary");
  if (!primary) return { ok: false, error: "Pick a primary coin." };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 32) return { ok: false, error: "Attach name needs 2–32 characters." };
  const dup = floor.launches.some(
    (item) => item.kind === "attached" && item.primaryId === primary.id && item.name.toLowerCase() === name.toLowerCase(),
  );
  if (dup) return { ok: false, error: "That attach is already on this coin." };
  if (input.bots.length === 0) return { ok: false, error: "Arm at least one bot." };
  let group = input.group.trim();
  if (group && !group.startsWith("@")) group = `@${group}`;
  if (group && !/^@[A-Za-z0-9_]{4,32}$/.test(group)) return { ok: false, error: "Group handle looks wrong." };
  const blurb = input.blurb.trim();
  if (blurb.length > 160) return { ok: false, error: "Note is too long." };
  const who = input.creator.trim() || "you";
  const id = crypto.randomUUID().slice(0, 8);
  const attach = blank({
    id,
    kind: "attached",
    chain: primary.chain,
    mode: primary.mode,
    name,
    symbol: primary.symbol,
    creator: who,
    blurb: blurb || `Attached to ${primary.symbol}. Bots armed. Referrer cut when a buyer picks you.`,
    createdAt: now,
    supplyWhole: primary.supplyWhole,
    supplyRaw: primary.supplyRaw,
    primaryId: primary.id,
    bots: input.bots,
    group,
    tape: [{ t: now, side: "arm", who: "You", detail: `Armed on ${primary.symbol}.`, price: primary.lastPrice }],
  });
  return { ok: true, floor: { ...floor, launches: [attach, ...floor.launches] }, id };
}

export function trade(floor: Floor, input: TradeInput, now = Date.now()): { ok: true; floor: Floor } | { ok: false; error: string } {
  const launch = floor.launches.find((item) => item.id === input.launchId);
  if (!launch) return { ok: false, error: "Coin missing." };
  const chain = CHAINS[launch.chain];
  if (input.side === "buy") {
    const amt = nativeOf(launch.chain, input.amount);
    if (amt == null) return { ok: false, error: "Amount looks wrong." };
    const res = applyBuy(floor, launch.id, amt, "You", now, input.attachId, true);
    if (!res.ok) return res;
    return { ok: true, floor: res.floor };
  }
  if (launch.kind !== "primary" || launch.mode !== "curve") return { ok: false, error: "Nothing to sell on this listing." };
  if (launch.graduated) return { ok: false, error: "Curve has graduated." };
  if (now < launch.startAt) return { ok: false, error: "Trading is not open yet." };
  const tokenIn = parseDecimal(input.amount, chain.tokenDecimals);
  if (tokenIn == null || tokenIn <= 0n) return { ok: false, error: "Amount looks wrong." };
  const held = BigInt(floor.desk.tokens[launch.id] ?? "0");
  if (held < tokenIn) return { ok: false, error: "Not enough tokens on this desk." };
  let fill;
  try {
    fill = fillSell(curveOf(launch), tokenIn, chain.nativeDecimals, chain.tokenDecimals);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Quote failed." };
  }
  let next = writeCurve(launch, fill.curve, fill.price);
  next = pushTape(next, {
    t: now,
    side: "sell",
    who: "You",
    detail: `${formatSmart(tokenIn, chain.tokenDecimals)} ${launch.symbol} → ${formatSmart(fill.ethOut, chain.nativeDecimals)} ${chain.native}`,
    price: fill.price,
  });
  const desk: Desk = {
    balances: { ...floor.desk.balances },
    tokens: { ...floor.desk.tokens },
    bought: { ...floor.desk.bought },
  };
  desk.tokens[launch.id] = (held - tokenIn).toString();
  desk.balances[launch.chain] = (BigInt(desk.balances[launch.chain] ?? "0") + fill.ethOut).toString();
  return { ok: true, floor: { launches: replace(floor.launches, next), desk } };
}

export function previewTrade(floor: Floor, input: TradeInput, now = Date.now()): { ok: true; line: string; price: number } | { ok: false; error: string } {
  const launch = floor.launches.find((item) => item.id === input.launchId);
  if (!launch || launch.kind !== "primary" || launch.mode !== "curve") return { ok: false, error: "No curve on this coin." };
  if (launch.graduated) return { ok: false, error: "Curve has graduated." };
  if (now < launch.startAt) return { ok: false, error: "Trading is not open yet." };
  const chain = CHAINS[launch.chain];
  try {
    if (input.side === "buy") {
      const amt = nativeOf(launch.chain, input.amount);
      if (amt == null || amt <= 0n) return { ok: false, error: "Enter an amount." };
      const tokens = quoteBuy(curveOf(launch), amt);
      const fee = (amt * 100n) / 10_000n;
      const price = spot(
        { ...curveOf(launch), realEth: curveOf(launch).realEth + (amt - fee), tokensSold: curveOf(launch).tokensSold + tokens },
        chain.nativeDecimals,
        chain.tokenDecimals,
      );
      return {
        ok: true,
        line: `${formatSmart(tokens, chain.tokenDecimals)} ${launch.symbol} · fee ${formatSmart(fee, chain.nativeDecimals)} ${chain.native}`,
        price,
      };
    }
    const tokenIn = parseDecimal(input.amount, chain.tokenDecimals);
    if (tokenIn == null || tokenIn <= 0n) return { ok: false, error: "Enter an amount." };
    const quoted = quoteSell(curveOf(launch), tokenIn);
    return {
      ok: true,
      line: `${formatSmart(quoted.ethOut, chain.nativeDecimals)} ${chain.native} · fee ${formatSmart(quoted.fee, chain.nativeDecimals)} ${chain.native}`,
      price: launch.lastPrice,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Quote failed." };
  }
}

function market(floor: Floor, id: string, human: string, who: string, at: number, attachId: string | null): Floor {
  const launch = floor.launches.find((item) => item.id === id);
  if (!launch) throw new Error(`missing ${id}`);
  const amt = nativeOf(launch.chain, human);
  if (amt == null) throw new Error("bad amount");
  const res = applyBuy(floor, id, amt, who, at, attachId, false);
  if (!res.ok) throw new Error(res.error);
  return res.floor;
}

export function initialFloor(): Floor {
  const t = Date.UTC(2026, 8, 12, 16, 0, 0);
  const forge = blank({
    id: "forge",
    kind: "primary",
    chain: "ethereum",
    mode: "curve",
    name: "Forged Rail",
    symbol: "FORGE",
    creator: "Floor",
    blurb: "House primary. Curve is open. Attaches can take the referrer cut.",
    telegram: "forgedrail",
    xHandle: "forgedrail",
    createdAt: t,
    virtualEth: nativeOf("ethereum", "1")!.toString(),
    virtualToken: (800_000_000n * 10n ** 18n).toString(),
    graduation: nativeOf("ethereum", "5")!.toString(),
    lastPrice: 0,
  });
  forge.lastPrice = spot(curveOf(forge), 18, 18);
  const billet = blank({
    id: "billet",
    kind: "primary",
    chain: "base",
    mode: "curve",
    name: "Billet Works",
    symbol: "BILLET",
    creator: "Floor",
    blurb: "Base curve. Same 1% fee, same 60/30/10 split.",
    telegram: "billetworks",
    xHandle: "billetworks",
    createdAt: t + 86_400_000,
    virtualEth: nativeOf("base", "1")!.toString(),
    virtualToken: (800_000_000n * 10n ** 18n).toString(),
    graduation: nativeOf("base", "4")!.toString(),
  });
  billet.lastPrice = spot(curveOf(billet), 18, 18);
  const kettle = blank({
    id: "kettle",
    kind: "primary",
    chain: "bsc",
    mode: "curve",
    name: "Kettle Supply",
    symbol: "KETTLE",
    creator: "Floor",
    blurb: "BNB primary with a small team allocation set aside.",
    telegram: "kettlesupply",
    createdAt: t + 2 * 86_400_000,
    allocs: [{ label: "Kettle desk", bps: 400 }],
    virtualEth: nativeOf("bsc", "1")!.toString(),
    virtualToken: (800_000_000n * 10n ** 18n).toString(),
    graduation: nativeOf("bsc", "8")!.toString(),
  });
  kettle.lastPrice = spot(curveOf(kettle), 18, 18);
  const latch = blank({
    id: "latch",
    kind: "primary",
    chain: "robinhood",
    mode: "curve",
    name: "Hood Latch",
    symbol: "LATCH",
    creator: "Floor",
    blurb: "Robinhood Chain curve. Max buy is on, so one desk cannot clear it.",
    createdAt: t + 3 * 86_400_000,
    virtualEth: nativeOf("robinhood", "1")!.toString(),
    virtualToken: (800_000_000n * 10n ** 18n).toString(),
    graduation: nativeOf("robinhood", "6")!.toString(),
    maxBuy: nativeOf("robinhood", "1")!.toString(),
  });
  latch.lastPrice = spot(curveOf(latch), 18, 18);
  const splint = blank({
    id: "splint",
    kind: "primary",
    chain: "solana",
    mode: "curve",
    name: "Splint",
    symbol: "SPLINT",
    creator: "Floor",
    blurb: "Solana curve. Meteora’s pool instruction is still wiring — graduation here closes the curve.",
    xHandle: "splintsol",
    createdAt: t + 4 * 86_400_000,
    supplyWhole: SUPPLY,
    supplyRaw: (1_000_000_000n * 10n ** 6n).toString(),
    virtualEth: nativeOf("solana", "1")!.toString(),
    virtualToken: (800_000_000n * 10n ** 6n).toString(),
    graduation: nativeOf("solana", "40")!.toString(),
  });
  splint.lastPrice = spot(curveOf(splint), 9, 6);
  const yard = blank({
    id: "yard",
    kind: "primary",
    chain: "ethereum",
    mode: "plain",
    name: "Yard Mint",
    symbol: "YARD",
    creator: "Floor",
    blurb: "Fixed supply. No curve, no trade fee. Bots can still attach.",
    createdAt: t + 5 * 86_400_000,
    allocs: [{ label: "Yard", bps: 500 }],
    lastPrice: 0,
  });
  const anvil = blank({
    id: "anvil",
    kind: "primary",
    chain: "ethereum",
    mode: "curve",
    name: "Anvil",
    symbol: "ANVIL",
    creator: "Floor",
    blurb: "Already graduated. The curve is closed.",
    telegram: "anvilheat",
    xHandle: "anvilheat",
    createdAt: t + 6 * 86_400_000,
    virtualEth: nativeOf("ethereum", "1")!.toString(),
    virtualToken: (800_000_000n * 10n ** 18n).toString(),
    graduation: nativeOf("ethereum", "1")!.toString(),
  });
  anvil.lastPrice = spot(curveOf(anvil), 18, 18);

  const night = blank({
    id: "night",
    kind: "attached",
    chain: "ethereum",
    mode: "curve",
    name: "Night Shift",
    symbol: "FORGE",
    creator: "Night Shift",
    blurb: "Attached to FORGE. Trade desk, buy alerts, and Guardian are armed.",
    createdAt: t + 7 * 86_400_000,
    primaryId: "forge",
    bots: ["trade", "buy", "guardian"],
    group: "@nightshift_desk",
  });
  const harbor = blank({
    id: "harbor",
    kind: "attached",
    chain: "base",
    mode: "curve",
    name: "Harbor Desk",
    symbol: "BILLET",
    creator: "Harbor",
    blurb: "Attached to BILLET. Trade desk and buy alerts are armed.",
    createdAt: t + 8 * 86_400_000,
    primaryId: "billet",
    bots: ["trade", "buy"],
    group: "@harbor_desk",
  });

  let floor: Floor = {
    launches: [harbor, night, anvil, yard, splint, latch, kettle, billet, forge],
    desk: emptyDesk(),
  };
  floor = market(floor, "forge", "0.8", "Early desk", t + 3_600_000, null);
  floor = market(floor, "forge", "0.45", "Night Shift", t + 7_200_000, "night");
  floor = market(floor, "billet", "0.6", "Harbor", t + 86_400_000 + 7_200_000, "harbor");
  floor = market(floor, "kettle", "1.2", "Floor bid", t + 2 * 86_400_000 + 7_200_000, null);
  floor = market(floor, "latch", "0.35", "Hood desk", t + 3 * 86_400_000 + 7_200_000, null);
  floor = market(floor, "splint", "6", "Sol desk", t + 4 * 86_400_000 + 7_200_000, null);
  floor = market(floor, "anvil", "0.7", "First heat", t + 6 * 86_400_000 + 3_600_000, null);
  floor = market(floor, "anvil", "0.5", "Last heat", t + 6 * 86_400_000 + 7_200_000, null);
  return floor;
}
