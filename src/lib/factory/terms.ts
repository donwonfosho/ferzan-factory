const KEY = "ferzan-terms-v1";

export function termsAccepted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptTerms() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, "1");
}
