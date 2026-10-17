/**
 * The visitor's Privy access token, for desk calls only. The Trade Desk reads the session id inside it
 * (signed by Privy) so it can tell the person in Telegram about a new website sign-in and let them close
 * every website session from there. Registered by the Privy provider; "" when signed out.
 */
let getter: (() => Promise<string | null>) | null = null;

export function setDeskAccess(fn: (() => Promise<string | null>) | null): void {
  getter = fn;
}

export async function deskAccess(): Promise<string> {
  try {
    const token = getter ? await getter() : null;
    return typeof token === "string" && token.length <= 16_000 ? token : "";
  } catch {
    return "";
  }
}
