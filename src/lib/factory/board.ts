import { createServerFn } from "@tanstack/react-start";
import { coinExtras, coinProofFields, postBody, profileFields, readProof, type Proof } from "./proof";
import type { RelayChain } from "./relay";
import type { ChainPrint } from "./chain-verify.server";

export type BoardCoin = {
  id: string;
  chain: string;
  mode: string;
  name: string;
  symbol: string;
  supply: string;
  contract: string;
  creator: string;
  image: string;
  buys: number;
  volumeWei: string;
  createdAt: string;
};

export type BoardPrint = {
  side: string;
  nativeWei: string;
  who: string;
  createdAt: string;
  symbol: string;
  name: string;
  chain: string;
  contract: string;
  image: string;
  supply: string;
};

const CHAINS = new Set(["ethereum", "bsc", "base", "robinhood", "solana", "arc"]);

function mapCoin(row: {
  id: string;
  chain: string;
  mode: string;
  name: string;
  symbol: string;
  contract: string;
  creator: string;
  image: string;
  buys: number;
  volume_wei: string;
  created_at: string;
}): BoardCoin {
  return {
    id: row.id,
    chain: row.chain,
    mode: row.mode,
    name: row.name,
    symbol: row.symbol,
    supply: "supply" in row && typeof row.supply === "string" ? row.supply : "0",
    contract: row.contract,
    creator: row.creator,
    image: row.image,
    buys: row.buys,
    volumeWei: row.volume_wei,
    createdAt: row.created_at,
  };
}

function clean(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") throw new Error("Bad coin.");
  return data as Record<string, unknown>;
}

function text(row: Record<string, unknown>, key: string, max: number): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error("That coin is missing a field.");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error("That field is too long.");
  return trimmed;
}

function coinAddress(value: string): string {
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return value;
  throw new Error("Address looks wrong.");
}

export const listBoard = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; sort: "new" | "buys" | "volume"; q: string } => {
    const row = clean(data);
    const chain = typeof row.chain === "string" ? row.chain : "all";
    const sort = row.sort === "buys" || row.sort === "volume" || row.sort === "new" ? row.sort : "new";
    const q = typeof row.q === "string" ? row.q.trim().replace(/[%_\\]/g, "").slice(0, 66) : "";
    if (chain !== "all" && !CHAINS.has(chain)) throw new Error("That chain is not open.");
    return { chain, sort, q };
  })
  .handler(async ({ data }): Promise<BoardCoin[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const chain = data.chain === "all" ? "" : data.chain;
    const like = data.q ? `%${data.q}%` : "";
    const rows = await sql<{
      id: string;
      chain: string;
      mode: string;
      name: string;
      symbol: string;
      contract: string;
      creator: string;
      image: string;
      buys: number;
      volume_wei: string;
      created_at: string;
    }>`
      select id, chain, mode, name, symbol, supply, contract, creator, image, buys, volume_wei, created_at::text as created_at
      from coins
      where (${chain} = '' or chain = ${chain})
        and (${like} = '' or name ilike ${like} or symbol ilike ${like} or contract ilike ${like})
      order by
        case when ${data.sort} = 'buys' then buys else 0 end desc,
        case when ${data.sort} = 'volume' then volume_wei::numeric else 0 end desc,
        created_at desc
      limit 50
    `;
    return rows.map(mapCoin);
  });

export type BoardMark = {
  contract: string;
  price: number;
  mcap: number;
  change: number;
  spark: number[];
  progress: number;
  graduated: boolean;
};

export const quoteBoard = createServerFn({ method: "POST" })
  .validator((data: unknown): { rows: { chain: string; contract: string; supply: string }[] } => {
    if (!data || typeof data !== "object") throw new Error("Bad quote.");
    const row = data as Record<string, unknown>;
    if (!Array.isArray(row.rows) || row.rows.length > 24) throw new Error("Too many coins.");
    return {
      rows: row.rows.map((item) => {
        if (!item || typeof item !== "object") throw new Error("Bad coin.");
        const coin = item as Record<string, unknown>;
        const chain = typeof coin.chain === "string" ? coin.chain : "";
        const contract = typeof coin.contract === "string" ? coin.contract.trim() : "";
        const supply = typeof coin.supply === "string" && /^\d+$/.test(coin.supply) ? coin.supply : "0";
        if (!CHAINS.has(chain) || contract.length < 32) throw new Error("That coin looks wrong.");
        return { chain, contract, supply };
      }),
    };
  })
  .handler(async ({ data }): Promise<BoardMark[]> => {
    await (await import("./guard.server")).guardRelay("read");
    const { getSql } = await import("@/lib/db");
    const { readCurve } = await import("@/lib/factory/deploy");
    const { readSolanaCurve } = await import("@/lib/factory/solana-curve");
    const { spot } = await import("@/lib/factory/curve");
    const { CHAINS: meta } = await import("@/lib/factory/catalog");
    const sql = await getSql();
    const prints = await sql<{ contract: string; price: string }>`
      select contract, price from prints where price <> '' order by created_at asc limit 500
    `;
    const history = new Map<string, number[]>();
    for (const print of prints) {
      const price = Number(print.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const list = history.get(print.contract) ?? [];
      list.push(price);
      history.set(print.contract, list);
    }
    const marks: BoardMark[] = [];
    for (const coin of data.rows) {
      let price = 0;
      let progress = 0;
      let graduated = false;
      try {
        if (coin.chain === "solana") {
          const state = await readSolanaCurve(coin.contract);
          if (state) {
            price = spot(
              {
                virtualEth: state.virtualSol,
                virtualToken: state.virtualToken,
                graduation: state.graduation,
                realEth: state.realSol,
                raisedEth: state.raisedSol,
                tokensSold: state.tokensSold,
                graduated: state.graduated,
                feePlatform: 0n,
                feeCreator: 0n,
                feeReferrer: 0n,
              },
              9,
              state.decimals,
            );
            graduated = state.graduated || state.pooled;
            if (state.graduation > 0n) progress = Math.min(100, Number((state.realSol * 10_000n) / state.graduation) / 100);
          }
        } else {
          const chain = meta[coin.chain as keyof typeof meta];
          if (chain && coin.chain !== "solana") {
            const state = await readCurve(coin.chain as "ethereum" | "bsc" | "base" | "robinhood" | "arc", coin.contract);
            price = spot(state, chain.nativeDecimals, chain.tokenDecimals);
            graduated = state.graduated;
            if (state.graduation > 0n) progress = Math.min(100, Number((state.realEth * 10_000n) / state.graduation) / 100);
          }
        }
      } catch {
        price = 0;
      }
      if (graduated) progress = 100;
      const past = history.get(coin.contract) ?? history.get(coin.contract.toLowerCase()) ?? [];
      const supply = Number(coin.supply);
      const scale = Number.isFinite(supply) && supply > 0 ? supply : 0;
      const mcap = price > 0 ? price * scale : 0;
      const spark = (past.length ? past.slice(-16) : price > 0 ? [price] : []).map((point) => point * scale);
      if (spark.length === 1) spark.push(spark[0]);
      const first = spark[0] ?? 0;
      const last = spark.at(-1) ?? 0;
      const change = first > 0 ? ((last - first) / first) * 100 : 0;
      marks.push({ contract: coin.contract, price, mcap, change, spark, progress, graduated });
    }
    return marks;
  });

export const listHot = createServerFn({ method: "GET" }).handler(async (): Promise<BoardCoin[]> => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    chain: string;
    mode: string;
    name: string;
    symbol: string;
    contract: string;
    creator: string;
    image: string;
    buys: number;
    volume_wei: string;
    created_at: string;
  }>`
    select id, chain, mode, name, symbol, supply, contract, creator, image, buys, volume_wei, created_at::text as created_at
    from coins
    order by buys desc, created_at desc
    limit 20
  `;
  return rows.map(mapCoin);
});

export const listPrints = createServerFn({ method: "GET" }).handler(async (): Promise<BoardPrint[]> => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    side: string;
    native_wei: string;
    who: string;
    created_at: string;
    symbol: string;
    name: string;
    chain: string;
    contract: string;
    image: string;
    supply: string;
  }>`
    select p.side, p.native_wei, p.who, p.created_at::text as created_at, c.symbol, c.name, c.chain, c.contract, c.image, c.supply
    from prints p
    join coins c on c.contract = p.contract
    where p.side = 'buy'
    order by p.created_at desc
    limit 12
  `;
  return rows.map((row) => ({
    side: row.side,
    nativeWei: row.native_wei,
    who: row.who,
    createdAt: row.created_at,
    symbol: row.symbol,
    name: row.name,
    chain: row.chain,
    contract: row.contract,
    image: row.image,
    supply: row.supply,
  }));
});

export const getCoin = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; contract: string } => {
    const row = clean(data);
    const chain = text(row, "chain", 20);
    const contract = coinAddress(text(row, "contract", 48));
    if (!CHAINS.has(chain)) throw new Error("That chain is not open.");
    return { chain, contract };
  })
  .handler(async ({ data }): Promise<BoardCoin | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      chain: string;
      mode: string;
      name: string;
      symbol: string;
      contract: string;
      creator: string;
      image: string;
      buys: number;
      volume_wei: string;
      created_at: string;
    }>`
      select id, chain, mode, name, symbol, supply, contract, creator, image, buys, volume_wei, created_at::text as created_at
      from coins
      where contract = ${data.contract} and chain = ${data.chain}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return mapCoin(row);
  });

export const publishCoin = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const row = clean(data);
    const chain = text(row, "chain", 20);
    const mode = text(row, "mode", 12);
    const name = text(row, "name", 32);
    const symbol = text(row, "symbol", 8).toUpperCase();
    const supply = text(row, "supply", 40);
    const contract = coinAddress(text(row, "contract", 48));
    const creator = coinAddress(text(row, "creator", 48));
    const hash = text(row, "hash", 100);
    const { image, blurb } = coinExtras(row);
    if (!CHAINS.has(chain)) throw new Error("That chain is not open.");
    if (mode !== "curve" && mode !== "plain") throw new Error("Launch type looks wrong.");
    if (name.length < 2 || !/^[A-Z0-9]{2,8}$/.test(symbol)) throw new Error("Name or ticker looks wrong.");
    if (!/^\d+$/.test(supply)) throw new Error("Supply looks wrong.");
    if (chain === "solana" && contract.startsWith("0x")) throw new Error("Solana mint looks wrong.");
    if (chain !== "solana" && !contract.startsWith("0x")) throw new Error("Contract looks wrong.");
    if (chain === "solana" ? !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash) : !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error("Launch transaction looks wrong.");
    }
    return { chain, mode, name, symbol, supply, contract, creator, image, blurb, hash, proof: readProof(row.proof) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    // The creator signs what gets listed, and the chain proves that wallet created the coin.
    await (await import("./guard.server")).guardRelay("send");
    const { requireProof } = await import("./proof.server");
    await requireProof("coin", data.creator, coinProofFields(data), data.proof);
    const verify = await import("./chain-verify.server");
    if (data.chain === "solana") await verify.verifySolanaLaunch(data.hash, data.contract, data.creator);
    else await verify.verifyEvmLaunch(data.chain as RelayChain, data.hash, data.contract, data.creator);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const id = `${data.chain}-${data.contract}`;
    await sql`
      insert into coins (id, chain, mode, name, symbol, supply, contract, creator, image, blurb)
      values (${id}, ${data.chain}, ${data.mode}, ${data.name}, ${data.symbol}, ${data.supply}, ${data.contract}, ${data.creator}, ${data.image}, ${data.blurb})
      on conflict (contract) do nothing
    `;
    return { ok: true };
  });

/** Records the trades a transaction really made, read from the chain. The browser only sends the hash. */
export const recordTrade = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: string; hash: string } => {
    const row = clean(data);
    const chain = text(row, "chain", 20);
    const hash = text(row, "hash", 100);
    if (!CHAINS.has(chain)) throw new Error("That chain is not open.");
    if (chain === "solana" ? !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash) : !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error("Transaction looks wrong.");
    }
    return { chain, hash };
  })
  .handler(async ({ data }): Promise<{ ok: true; recorded: number }> => {
    await (await import("./guard.server")).guardRelay("send");
    const verify = await import("./chain-verify.server");
    const prints =
      data.chain === "solana"
        ? await verify.solanaTradePrints(data.hash)
        : await verify.evmTradePrints(data.chain as RelayChain, data.hash);
    let recorded = 0;
    for (const print of prints) if (await writePrint(data.chain, print)) recorded += 1;
    return { ok: true, recorded };
  });

async function writePrint(chain: string, data: ChainPrint): Promise<boolean> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const found = await sql<{ contract: string }>`
    select contract from coins where contract = ${data.contract} and chain = ${chain} limit 1
  `;
  if (!found[0]) return false;
  // (tx_hash, log_index) is unique, so the same trade can only be recorded once.
  const saved = await sql<{ id: string }>`
    insert into prints (contract, side, native_wei, who, price, tx_hash, log_index)
    values (${data.contract}, ${data.side}, ${data.amountWei}, ${data.who}, ${data.price}, ${data.txHash}, ${data.logIndex})
    on conflict do nothing
    returning id::text as id
  `;
  if (!saved[0]) return false;
  if (data.side === "buy") {
    await sql`
      update coins
      set buys = buys + 1,
          volume_wei = (volume_wei::numeric + ${data.amountWei}::numeric)::text
      where contract = ${data.contract}
    `;
  }
  return true;
}

export type BoardTrade = {
  side: string;
  amountWei: string;
  who: string;
  price: string;
  createdAt: string;
};

export const listCoinTrades = createServerFn({ method: "POST" })
  .validator((data: unknown): { contract: string } => {
    const row = clean(data);
    const contract = coinAddress(text(row, "contract", 48));
    return { contract };
  })
  .handler(async ({ data }): Promise<BoardTrade[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      side: string;
      native_wei: string;
      who: string;
      price: string;
      created_at: string;
    }>`
      select side, native_wei, who, price, created_at::text as created_at
      from prints
      where contract = ${data.contract}
      order by created_at asc
      limit 180
    `;
    return rows.map((row) => ({
      side: row.side,
      amountWei: row.native_wei,
      who: row.who,
      price: row.price,
      createdAt: row.created_at,
    }));
  });

export type BoardPost = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export const listPosts = createServerFn({ method: "POST" })
  .validator((data: unknown): { contract: string } => {
    const row = clean(data);
    const contract = coinAddress(text(row, "contract", 48));
    return { contract };
  })
  .handler(async ({ data }): Promise<BoardPost[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ id: string; author: string; body: string; created_at: string }>`
      select id::text as id, author, body, created_at::text as created_at
      from posts
      where contract = ${data.contract}
      order by created_at desc
      limit 40
    `;
    return rows.map((row) => ({
      id: row.id,
      author: row.author,
      body: row.body,
      createdAt: row.created_at,
    }));
  });

export const addPost = createServerFn({ method: "POST" })
  .validator((data: unknown): { contract: string; chain: string; author: string; body: string; proof: Proof } => {
    const row = clean(data);
    const contract = coinAddress(text(row, "contract", 48));
    const chain = text(row, "chain", 20);
    const author = coinAddress(text(row, "author", 48));
    const body = postBody(text(row, "body", 280));
    if (!CHAINS.has(chain)) throw new Error("That chain is not open.");
    if (body.length < 1) throw new Error("Write something.");
    return { contract, chain, author, body, proof: readProof(row.proof) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const { requireProof } = await import("./proof.server");
    await requireProof("post", data.author, { contract: data.contract, chain: data.chain, body: data.body }, data.proof);
    const coin = await sql<{ contract: string }>`
      select contract from coins where contract = ${data.contract} and chain = ${data.chain} limit 1
    `;
    if (!coin[0]) throw new Error("That coin is not on the board.");
    const recent = await sql<{ created_at: string }>`
      select created_at::text as created_at
      from posts
      where contract = ${data.contract} and author = ${data.author}
      order by created_at desc
      limit 1
    `;
    const last = recent[0] ? Date.parse(recent[0].created_at) : 0;
    if (last && Date.now() - last < 15_000) throw new Error("Wait a few seconds before the next reply.");
    await sql`
      insert into posts (contract, chain, author, body)
      values (${data.contract}, ${data.chain}, ${data.author}, ${data.body})
    `;
    return { ok: true };
  });

export const searchCoins = createServerFn({ method: "POST" })
  .validator((data: unknown): { q: string } => {
    const row = clean(data);
    const q = text(row, "q", 66).replace(/[%_\\]/g, "");
    if (q.length < 1) throw new Error("Type a ticker or a name.");
    return { q };
  })
  .handler(async ({ data }): Promise<BoardCoin[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const like = `%${data.q}%`;
    const rows = await sql<{
      id: string;
      chain: string;
      mode: string;
      name: string;
      symbol: string;
      contract: string;
      creator: string;
      image: string;
      buys: number;
      volume_wei: string;
      created_at: string;
    }>`
      select id, chain, mode, name, symbol, supply, contract, creator, image, buys, volume_wei, created_at::text as created_at
      from coins
      where name ilike ${like} or symbol ilike ${like} or contract ilike ${like}
      order by buys desc, created_at desc
      limit 12
    `;
    return rows.map(mapCoin);
  });

export const listLaunched = createServerFn({ method: "POST" })
  .validator((data: unknown): { creator: string } => {
    const row = clean(data);
    return { creator: coinAddress(text(row, "creator", 48)) };
  })
  .handler(async ({ data }): Promise<BoardCoin[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      chain: string;
      mode: string;
      name: string;
      symbol: string;
      contract: string;
      creator: string;
      image: string;
      buys: number;
      volume_wei: string;
      created_at: string;
    }>`
      select id, chain, mode, name, symbol, supply, contract, creator, image, buys, volume_wei, created_at::text as created_at
      from coins
      where lower(creator) = ${data.creator.toLowerCase()}
      order by created_at desc
      limit 24
    `;
    return rows.map(mapCoin);
  });

export type SavedProfile = { name: string; bio: string; image: string };

export const loadProfile = createServerFn({ method: "POST" })
  .validator((data: unknown): { address: string } => {
    const row = clean(data);
    return { address: coinAddress(text(row, "address", 48)) };
  })
  .handler(async ({ data }): Promise<SavedProfile | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ name: string; bio: string; image: string }>`
      select name, bio, image from profiles where lower(address) = ${data.address.toLowerCase()} limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { name: row.name, bio: row.bio, image: row.image };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .validator((data: unknown): { address: string; name: string; bio: string; image: string; proof: Proof } => {
    const row = clean(data);
    const address = coinAddress(text(row, "address", 48));
    const fields = profileFields({
      name: typeof row.name === "string" ? row.name : "",
      bio: typeof row.bio === "string" ? row.bio : "",
      image: typeof row.image === "string" ? row.image : "",
    });
    return { address, ...fields, proof: readProof(row.proof) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireProof } = await import("./proof.server");
    await requireProof("profile", data.address, { name: data.name, bio: data.bio, image: data.image }, data.proof);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into profiles (address, name, bio, image)
      values (${data.address}, ${data.name}, ${data.bio}, ${data.image})
      on conflict (address) do update
      set name = excluded.name, bio = excluded.bio, image = excluded.image, updated_at = now()
    `;
    return { ok: true };
  });

