import { getSql } from "@/lib/db";
import { readCurve, readErc20String, type EvmChainId } from "@/lib/factory/deploy";

const EVM = new Set<EvmChainId>(["ethereum", "bsc", "base", "robinhood", "arc"]);
const NAME = "0x06fdde03";
const SYMBOL = "0x95d89b41";

type Ingest = {
  chain: string;
  contract: string;
  name?: string;
  symbol?: string;
  creator?: string;
  mode?: string;
  supply?: string;
  blurb?: string;
};

export async function ingestLaunch(body: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the chain and the contract." };
  const row = body as Record<string, unknown>;
  const chain = typeof row.chain === "string" ? row.chain.trim().toLowerCase() : "";
  const contract = typeof row.contract === "string" ? row.contract.trim() : "";
  const givenName = typeof row.name === "string" ? row.name.trim().slice(0, 32) : "";
  const givenSymbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase().slice(0, 8) : "";
  const creator = typeof row.creator === "string" ? row.creator.trim() : "";
  const supply = typeof row.supply === "string" && /^\d+$/.test(row.supply) ? row.supply : "1000000000";
  const blurb = typeof row.blurb === "string" && row.blurb.trim() ? row.blurb.trim().slice(0, 160) : "Launched in Telegram.";

  if (chain === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract)) return { ok: false, error: "Solana mint looks wrong." };
    if (givenName.length < 2 || !/^[A-Z0-9]{2,8}$/.test(givenSymbol)) {
      return { ok: false, error: "Send the name and ticker with a Solana mint." };
    }
    const live = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [contract, { encoding: "base64" }] }),
    });
    const info = (await live.json()) as { result?: { value?: { owner?: string } | null } };
    if (!info.result?.value) return { ok: false, error: "That mint is not on Solana." };
    return save({ chain, contract, name: givenName, symbol: givenSymbol, creator: creator || contract, mode: "curve", supply, blurb });
  }

  if (!EVM.has(chain as EvmChainId)) return { ok: false, error: "That chain is not open." };
  if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) return { ok: false, error: "Contract address looks wrong." };
  const evm = chain as EvmChainId;
  let mode: "curve" | "plain" = "plain";
  try {
    await readCurve(evm, contract);
    mode = "curve";
  } catch {
    mode = "plain";
  }
  let name = givenName;
  let symbol = givenSymbol;
  if (name.length < 2 || !/^[A-Z0-9]{2,8}$/.test(symbol)) {
    try {
      if (name.length < 2) name = (await readErc20String(evm, contract, NAME)).slice(0, 32);
      if (!/^[A-Z0-9]{2,8}$/.test(symbol)) symbol = (await readErc20String(evm, contract, SYMBOL)).toUpperCase().slice(0, 8);
    } catch {
      return { ok: false, error: "That contract did not answer with a name and ticker." };
    }
  }
  if (name.length < 2 || !/^[A-Z0-9]{2,8}$/.test(symbol)) {
    return { ok: false, error: "That contract did not answer with a name and ticker." };
  }
  if (mode === "plain") {
    try {
      await readCurve(evm, contract);
      mode = "curve";
    } catch {
      /* a plain token can still be listed */
    }
  }
  return save({
    chain,
    contract,
    name,
    symbol,
    creator: /^0x[a-fA-F0-9]{40}$/.test(creator) ? creator : contract,
    mode,
    supply,
    blurb,
  });
}

async function save(data: Required<Ingest>): Promise<{ ok: true; id: string }> {
  const sql = await getSql();
  const id = `${data.chain}-${data.contract.toLowerCase()}`;
  await sql`
    insert into coins (id, chain, mode, name, symbol, supply, contract, creator, image, blurb)
    values (${id}, ${data.chain}, ${data.mode}, ${data.name}, ${data.symbol}, ${data.supply}, ${data.contract}, ${data.creator}, ${""}, ${data.blurb})
    on conflict (contract) do update set
      name = excluded.name,
      symbol = excluded.symbol,
      blurb = case when coins.blurb = '' then excluded.blurb else coins.blurb end
  `;
  return { ok: true, id };
}
