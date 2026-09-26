import { createFileRoute } from "@tanstack/react-router";
import { LaunchForm } from "@/components/factory/launch-form";
import type { MarkChain } from "@/components/factory/chain-mark";

type LaunchSearch = { kind: "curve" | "pool"; chain?: MarkChain };

const CHAINS = new Set<MarkChain>(["ethereum", "bsc", "base", "robinhood", "solana", "arc"]);

export const Route = createFileRoute("/launch")({
  validateSearch: (search: Record<string, unknown>): LaunchSearch => ({
    kind: search.kind === "pool" ? "pool" : "curve",
    chain: typeof search.chain === "string" && CHAINS.has(search.chain as MarkChain) ? (search.chain as MarkChain) : undefined,
  }),
  component: function LaunchPage() {
    const { kind, chain } = Route.useSearch();
    return <LaunchForm initialMode={kind === "pool" ? "plain" : "curve"} initialChain={chain ?? "base"} />;
  },
});
