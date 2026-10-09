/**
 * TON writes the same wallet two ways. "EQ…" is the bounceable form: if the wallet has never received anything
 * (it is not active yet) a transfer to it is sent BACK. "UQ…" is the non-bounceable form: the same wallet, but the
 * transfer is kept and activates it. Anything we show a person so they can send TON to a WALLET must be the UQ form.
 * (Contracts and jettons stay EQ; do not run those through this.)
 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function crc16(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function decode(s: string): number[] | null {
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out;
}

function encode(bytes: number[]): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64[(acc >> bits) & 63];
    }
  }
  if (bits > 0) out += B64[(acc << (6 - bits)) & 63];
  return out;
}

/** The non-bounceable (UQ…) form of a user-friendly wallet address. Anything that is not a valid 48-character address is returned unchanged. */
export function tonWalletAddress(address: string): string {
  const s = (address ?? "").trim();
  if (!/^[A-Za-z0-9_-]{48}$/.test(s)) return address;
  const b = decode(s);
  if (!b || b.length !== 36) return address;
  const flag = b[0];
  if (flag === 0x51 || flag === 0xd1) return s; // already non-bounceable
  if (flag !== 0x11 && flag !== 0x91) return address; // not a plain address tag
  if (crc16(b.slice(0, 34)) !== ((b[34] << 8) | b[35])) return address; // checksum does not match: never "fix" a bad address
  const head = b.slice(0, 34);
  head[0] = flag === 0x11 ? 0x51 : 0xd1;
  const crc = crc16(head);
  return encode([...head, crc >> 8, crc & 0xff]);
}
