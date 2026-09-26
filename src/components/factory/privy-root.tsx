import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { PRIVY_APP_ID } from "@/lib/factory/wallet-bridge";

/**
 * Privy is a browser-only SDK. It is loaded as its own chunk after the page mounts, never during
 * server rendering, and it does not wrap the site: it only feeds the wallet bridge that the
 * launch, trade, profile and account pages read. Its sign-in and export windows render themselves.
 */
const PrivyApp = lazy(() => import("./privy-app"));

export function PrivyRoot({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      {children}
      {mounted && PRIVY_APP_ID ? (
        <Suspense fallback={null}>
          <PrivyApp />
        </Suspense>
      ) : null}
    </>
  );
}
