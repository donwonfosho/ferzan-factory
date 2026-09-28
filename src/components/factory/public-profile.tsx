import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listLaunched, loadProfile, type BoardCoin } from "@/lib/factory/board";
import { CHAINS } from "@/lib/factory/catalog";
import { creatorVerdict } from "./creator-health";
import type { ChainId } from "@/lib/factory/types";
import { Mark } from "./ui";

function RecordLine({ coins }: { coins: BoardCoin[] }) {
  const verdict = creatorVerdict(coins);
  const tone = verdict.tone === "heavy" ? "text-sell" : verdict.tone === "clear" ? "text-cyan" : "text-fg";
  return (
    <p className={`mt-4 text-sm font-semibold ${tone}`}>
      {verdict.title}. {verdict.line}
    </p>
  );
}

export function PublicProfile({ address }: { address: string }) {
  const [coins, setCoins] = useState<BoardCoin[] | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [image, setImage] = useState("");
  const valid = /^0x[a-fA-F0-9]{40}$/.test(address) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);

  useEffect(() => {
    if (!valid) return;
    let stop = false;
    void listLaunched({ data: { creator: address } }).then(
      (rows) => {
        if (!stop) setCoins(rows);
      },
      () => {
        if (!stop) setCoins([]);
      },
    );
    void loadProfile({ data: { address } }).then(
      (row) => {
        if (stop || !row) return;
        setName(row.name);
        setBio(row.bio);
        setImage(row.image);
      },
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, [address, valid]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-4">
        {image ? <img src={image} alt="" className="h-16 w-16 object-cover shadow-border" /> : null}
        <div>
          <h1 className="text-4xl">{name || "Profile"}</h1>
          <a className="mt-1 inline-block text-sm text-cyan" href={`/creator/${address}`}>
            Full Ferzan launch record →
          </a>
          {bio ? <p className="mt-2 text-muted">{bio}</p> : null}
        </div>
      </div>
      <p className="mt-3 break-all text-sm text-muted">{address}</p>
      {coins ? <RecordLine coins={coins} /> : null}
      {!valid ? <p className="mt-6 text-sm text-sell">That wallet address looks wrong.</p> : null}
      {valid && coins === null ? <p className="mt-6 text-sm text-muted">Loading launches.</p> : null}
      {coins && coins.length === 0 ? <p className="mt-6 text-sm text-muted">No coins from this wallet are on the board yet.</p> : null}
      <div className="mt-4 divide-y divide-line border-y border-line">
        {coins?.map((coin) => (
          <Link key={coin.id} to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="flex items-center gap-3 py-3">
            <Mark symbol={coin.symbol} image={coin.image} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{coin.symbol}</span>
              <span className="block truncate text-sm text-muted">
                {coin.name} · {CHAINS[coin.chain as ChainId]?.label ?? coin.chain}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
