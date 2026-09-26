import type { ChainId } from "@/lib/factory/types";
import { formatUsd, useNativeUsd } from "@/lib/factory/usd";

export function Dollar({ chain, nativePerToken }: { chain: ChainId; nativePerToken: number }) {
  const usd = useNativeUsd(chain);
  if (!usd || nativePerToken <= 0) return null;
  const text = formatUsd(nativePerToken * usd);
  if (!text) return null;
  return <span> · {text}</span>;
}
