import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { track } from "@/lib/factory/analytics";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";

/** Loads Plausible in manual mode and counts a visit on each route. No script when the domain is unset. */
export function Analytics() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const account = useAccountWallets();
  const seen = useRef("");

  useEffect(() => {
    const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
    if (!domain || document.querySelector("script[data-ferzan-plausible]")) return;
    const script = document.createElement("script");
    script.defer = true;
    script.dataset.domain = domain;
    script.dataset.ferzanPlausible = "1";
    script.src = "https://plausible.io/js/script.manual.js";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (seen.current === path) return;
    seen.current = path;
    track("pageview");
  }, [path]);

  useEffect(() => {
    if (!account?.authenticated) return;
    try {
      if (window.sessionStorage.getItem("ferzan-wallet-tracked") === "1") return;
      window.sessionStorage.setItem("ferzan-wallet-tracked", "1");
    } catch {
      return;
    }
    track("wallet_connected");
  }, [account?.authenticated]);

  return null;
}
