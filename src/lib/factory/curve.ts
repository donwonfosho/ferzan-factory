export const FEE_BPS = 100n;
export const PLATFORM_BPS = 6000n;
export const CREATOR_BPS = 3000n;

export type Curve = {
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

export type Split = { platform: bigint; creator: bigint; referrer: bigint };

export function splitFee(fee: bigint, payReferrer: boolean): Split {
  const platformBase = (fee * PLATFORM_BPS) / 10_000n;
  const creator = (fee * CREATOR_BPS) / 10_000n;
  let referrer = fee - platformBase - creator;
  let platform = platformBase;
  if (!payReferrer) {
    platform += referrer;
    referrer = 0n;
  }
  return { platform, creator, referrer };
}

export function ethReserve(c: Curve): bigint {
  return c.virtualEth + c.realEth;
}

export function tokenReserve(c: Curve): bigint {
  return c.virtualToken - c.tokensSold;
}

export function quoteBuy(c: Curve, ethIn: bigint): bigint {
  if (c.graduated) throw new Error("Curve has graduated");
  if (ethIn <= 0n) throw new Error("Amount is zero");
  const fee = (ethIn * FEE_BPS) / 10_000n;
  const net = ethIn - fee;
  const ethR = ethReserve(c);
  const tokR = tokenReserve(c);
  if (tokR <= 0n) throw new Error("Curve is empty");
  const k = ethR * tokR;
  const newEth = ethR + net;
  const newTok = k / newEth;
  if (tokR <= newTok) throw new Error("Curve is empty");
  return tokR - newTok;
}

export function quoteSell(c: Curve, tokenIn: bigint): { ethOut: bigint; fee: bigint; gross: bigint } {
  if (tokenIn <= 0n) throw new Error("Amount is zero");
  if (tokenIn > c.tokensSold) {
    throw new Error(
      c.tokensSold <= 0n
        ? "Nobody has bought from this curve yet, so it cannot buy any tokens back."
        : "That is more than the curve can buy back. Only tokens that were bought from the curve can be sold.",
    );
  }
  const ethR = ethReserve(c);
  const tokR = tokenReserve(c);
  const k = ethR * tokR;
  const newTok = tokR + tokenIn;
  const newEth = k / newTok;
  if (ethR <= newEth) throw new Error("Curve is empty");
  let gross = ethR - newEth;
  if (gross > c.realEth) gross = c.realEth;
  const fee = (gross * FEE_BPS) / 10_000n;
  return { ethOut: gross - fee, fee, gross };
}

export function spot(c: Curve, nativeDecimals: number, tokenDecimals: number): number {
  const tok = tokenReserve(c);
  if (tok <= 0n || ethReserve(c) <= 0n) return 0;
  const scale = 10n ** 18n;
  const ratio = Number((ethReserve(c) * scale) / tok) / Number(scale);
  return ratio * 10 ** (tokenDecimals - nativeDecimals);
}

export type Fill = {
  curve: Curve;
  tokensOut: bigint;
  ethOut: bigint;
  fee: bigint;
  split: Split;
  price: number;
  justGraduated: boolean;
};

export function fillBuy(
  c: Curve,
  ethIn: bigint,
  payReferrer: boolean,
  nativeDecimals: number,
  tokenDecimals: number,
): Fill {
  const tokensOut = quoteBuy(c, ethIn);
  const fee = (ethIn * FEE_BPS) / 10_000n;
  const net = ethIn - fee;
  let next: Curve = {
    ...c,
    tokensSold: c.tokensSold + tokensOut,
    realEth: c.realEth + net,
    raisedEth: c.raisedEth + net,
  };
  const split = splitFee(fee, payReferrer);
  next = {
    ...next,
    feePlatform: next.feePlatform + split.platform,
    feeCreator: next.feeCreator + split.creator,
    feeReferrer: next.feeReferrer + split.referrer,
  };
  const price = spot(next, nativeDecimals, tokenDecimals);
  const justGraduated = next.realEth >= next.graduation;
  if (justGraduated) next = { ...next, graduated: true, realEth: 0n };
  return { curve: next, tokensOut, ethOut: 0n, fee, split, price, justGraduated };
}

export function fillSell(
  c: Curve,
  tokenIn: bigint,
  nativeDecimals: number,
  tokenDecimals: number,
): Fill {
  const quoted = quoteSell(c, tokenIn);
  let next: Curve = {
    ...c,
    tokensSold: c.tokensSold - tokenIn,
    realEth: c.realEth - quoted.gross,
  };
  const split = splitFee(quoted.fee, false);
  next = {
    ...next,
    feePlatform: next.feePlatform + split.platform,
    feeCreator: next.feeCreator + split.creator,
    feeReferrer: next.feeReferrer + split.referrer,
  };
  const price = spot(next, nativeDecimals, tokenDecimals);
  return {
    curve: next,
    tokensOut: 0n,
    ethOut: quoted.ethOut,
    fee: quoted.fee,
    split,
    price,
    justGraduated: false,
  };
}
