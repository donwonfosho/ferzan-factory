type EthProvider = { request: (args: { method: string }) => Promise<string[]> };
type SolProvider = { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toString: () => string } }> };

export async function requestWallet(): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
  if (eth) {
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) return { ok: false, error: "The wallet returned no account." };
      return { ok: true, address };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "The wallet rejected the request." };
    }
  }
  const sol = (window as unknown as { solana?: SolProvider }).solana;
  if (sol?.connect) {
    try {
      const res = await sol.connect();
      return { ok: true, address: res.publicKey.toString() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "The wallet rejected the request." };
    }
  }
  return { ok: false, error: "No wallet in this browser. Install MetaMask, Rabby, or Phantom." };
}
