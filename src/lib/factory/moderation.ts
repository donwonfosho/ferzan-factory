/**
 * Comment rules, the same spirit as Guardian in the Ferzan Telegram chats: no links, no contract
 * addresses (the classic fake-CA scam), no seed-phrase / "support" / airdrop-claim bait, no shouting.
 * Used by the page (to explain before sending) and by the server (to enforce).
 */
const LINK = /(https?:\/\/|www\.|t\.me\/|discord\.gg|\b[a-z0-9-]{2,}\.(com|io|xyz|net|org|app|fun|gg|me|co|finance|site|link|ly|pro|vip|top|live)\b)/i;
const ADDRESS = /0x[0-9a-fA-F]{16,}|\b[1-9A-HJ-NP-Za-km-z]{32,48}\b|\b[EUk]Q[A-Za-z0-9_-]{46}\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b/;
const SCAM =
  /(seed ?phrase|private ?key|recovery ?phrase|secret ?phrase|12 words|24 words|validate (your )?wallet|sync (your )?wallet|claim (your |the )?(airdrop|tokens|reward)|free airdrop|dm me|message me|inbox me|pm me|whats ?app|support team|customer support|help ?desk|double your|guaranteed|giveaway|send (me )?\d)/i;

export function moderate(body: string): string {
  const t = body.trim();
  if (!t) return "Write something.";
  if (t.length > 280) return "Keep it under 280 characters.";
  if (LINK.test(t)) return "Links are not allowed in comments.";
  if (ADDRESS.test(t)) return "Contract and wallet addresses are not allowed in comments (fake-address scams).";
  if (SCAM.test(t)) return "That looks like a scam phrase, so it can't be posted.";
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) return "Please don't write in all caps.";
  if (/(.)\1{9,}/.test(t)) return "That looks like spam.";
  return "";
}
