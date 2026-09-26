import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { publishCoin, recordTrade } from "@/lib/factory/board";
import { deployCurve, deployFixedToken, explorerTx } from "@/lib/factory/deploy";
import { launchSolanaMint, solanaAddress, solanaExplorerTx } from "@/lib/factory/solana";
import { launchSolanaCurve } from "@/lib/factory/solana-curve";
import { useFactory, rememberLaunched } from "@/lib/factory/store";
import { keySaved, siteMatches } from "@/lib/factory/site-wallet";
import type { Mode } from "@/lib/factory/types";
import { parseDecimal, parseWhole } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { GasStep } from "./gas-step";
import { ShareCard } from "./share-card";
import { Button, Label, TextInput } from "./ui";
import { termsAccepted } from "@/lib/factory/terms";
import { TermsGate } from "./terms";
import { KeyLock } from "./key-gate";

const LAUNCH_CHAINS: MarkChain[] = ["solana", "base", "bsc", "ethereum", "robinhood", "arc"];

const CHAIN_NOTE: Record<MarkChain, string> = {
  solana: "Creates the curve. You pay SOL. The first program deploy costs about 1 SOL.",
  base: "Usually confirms in seconds.",
  bsc: "Fast. You pay BNB gas.",
  robinhood: "You pay ETH gas.",
  ethereum: "Can take a minute. You pay ETH gas.",
  arc: "Gas is USDC. Same contract as Base. Chain 5042.",
};

export function LaunchForm({ initialMode = "curve", initialChain = "base" }: { initialMode?: Mode; initialChain?: MarkChain }) {
  const stamp = useFactory((s) => s.stampPrimary);
  const wallet = useFactory((s) => s.wallet);
  const nav = useNavigate();
  const [chain, setChain] = useState<MarkChain>(initialChain);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [graduation, setGraduation] = useState("");
  const [virtualNative, setVirtualNative] = useState("");
  const [virtualToken, setVirtualToken] = useState("");
  const [devBuy, setDevBuy] = useState("");
  const [delayMin, setDelayMin] = useState("0");
  const [maxBuy, setMaxBuy] = useState("");
  const [blurb, setBlurb] = useState("");
  const [telegram, setTelegram] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [image, setImage] = useState("");
  const [allocs, setAllocs] = useState<{ label: string; percent: string }[]>([]);
  const [error, setError] = useState("");
  const [needTerms, setNeedTerms] = useState(false);
  const [busy, setBusy] = useState("");
  const [tx, setTx] = useState("");
  const [launched, setLaunched] = useState<{
    id: string;
    contract: string;
    name: string;
    symbol: string;
    image: string;
    chain: MarkChain;
    hash: string;
  } | null>(null);

  const meta = CHAINS[chain];
  const evmWallet = wallet.startsWith("0x");
  const sol = evmWallet ? solanaAddress() : null;

  useEffect(() => {
    setMode(initialMode);
    setChain(initialChain);
  }, [initialMode, initialChain]);

  function pick(next: Mode) {
    setMode(next);
    void nav({
      to: "/launch",
      search: { kind: next === "plain" ? "pool" : "curve" },
      replace: true,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTx("");
    if (!termsAccepted()) {
      setNeedTerms(true);
      return;
    }
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    if (cleanName.length < 2 || cleanName.length > 32) {
      setError("Name needs 2–32 characters.");
      return;
    }
    if (!/^[A-Z0-9]{2,8}$/.test(cleanSymbol)) {
      setError("Ticker is 2–8 letters or numbers.");
      return;
    }
    const whole = parseWhole(supply);
    if (!whole) {
      setError("Supply has to be a whole number.");
      return;
    }

    let owner = evmWallet ? wallet : "";
    if (!owner) {
      setError("Create a wallet on Account before you launch. Opening the site does not create one.");
      return;
    }
    if (owner.startsWith("0x") && siteMatches(owner) && !keySaved(owner)) {
      setError("Copy the key on your profile first. That key is how this wallet comes back.");
      return;
    }
    let contract = "";
    let boardCreator = owner;
    let hash = "";
    if (chain === "solana") {
      if (mode === "plain") {
        setBusy("Signing here. One signature creates the Solana mint and revokes mint authority.");
        const deployed = await launchSolanaMint({
          supplyWhole: whole,
          decimals: CHAINS.solana.tokenDecimals,
        });
        setBusy("");
        if (!deployed.ok) {
          setError(deployed.error);
          return;
        }
        contract = deployed.mint;
        hash = deployed.signature;
        setTx(deployed.signature);
      } else {
        const dec = CHAINS.solana.nativeDecimals;
        const tokenDec = CHAINS.solana.tokenDecimals;
        const grad = parseDecimal(graduation.trim() || "50", dec);
        const virt = parseDecimal(virtualNative.trim() || "1", dec);
        const depthWhole = virtualToken.trim() ? parseWhole(virtualToken) : (whole * 80n) / 100n;
        const cap = maxBuy.trim() ? parseDecimal(maxBuy.trim(), dec) : 0n;
        const delayNum = delayMin.trim() === "" ? 0 : Number(delayMin);
        const dev = devBuy.trim() ? parseDecimal(devBuy.trim(), dec) : 0n;
        if (!grad || !virt || !depthWhole || cap == null || dev == null || !Number.isInteger(delayNum) || delayNum < 0 || delayNum > 10080) {
          setError("Check the curve amounts. Delay is whole minutes, up to a week.");
          return;
        }
        if (delayNum > 0 && dev > 0n) {
          setError("The first buy is the first trade, so the curve has to open now. Clear the delay or the buy.");
          return;
        }
        const depth = depthWhole * 10n ** BigInt(tokenDec);
        const supplyRaw = whole * 10n ** BigInt(tokenDec);
        if (depth > supplyRaw) {
          setError("The curve inventory cannot be larger than the supply.");
          return;
        }
        const deployed = await launchSolanaCurve({
          name: cleanName,
          symbol: cleanSymbol,
          supplyRaw,
          decimals: tokenDec,
          virtualSol: virt,
          virtualToken: depth,
          graduation: grad,
          maxBuy: cap,
          delaySeconds: BigInt(delayNum) * 60n,
          devBuy: dev,
          onStatus: (message) => setBusy(message),
        });
        setBusy("");
        if (!deployed.ok) {
          setError(deployed.error);
          return;
        }
        contract = deployed.mint;
        hash = deployed.signature;
        setTx(deployed.signature);
      }
      boardCreator = solanaAddress() || owner;
    } else if (mode === "plain") {
      setBusy("Approve the create. You pay gas.");
      const deployed = await deployFixedToken({
        chain,
        name: cleanName,
        symbol: cleanSymbol,
        supplyWhole: whole,
        owner,
      });
      setBusy("");
      if (!deployed.ok) {
        setError(deployed.error);
        return;
      }
      contract = deployed.address;
      hash = deployed.hash;
      setTx(deployed.hash);
    } else {
      const dec = CHAINS[chain].nativeDecimals;
      const grad = parseDecimal(graduation.trim() || "5", dec);
      const virt = parseDecimal(virtualNative.trim() || "1", dec);
      const depth = virtualToken.trim() ? parseWhole(virtualToken) : (whole * 80n) / 100n;
      const cap = maxBuy.trim() ? parseDecimal(maxBuy.trim(), dec) : 0n;
      const delayNum = delayMin.trim() === "" ? 0 : Number(delayMin);
      if (!Number.isInteger(delayNum) || delayNum < 0 || delayNum > 10080) {
        setError("Delay is whole minutes, up to a week.");
        return;
      }
      const delay = BigInt(delayNum);
      const dev = devBuy.trim() ? parseDecimal(devBuy.trim(), dec) : 0n;
      if (!grad || !virt || !depth || cap == null || dev == null || delay < 0n || delay > 10080n) {
        setError("Check the curve amounts. Delay is whole minutes, up to a week.");
        return;
      }
      if (delay > 0n && dev > 0n) {
        setError("The first buy is the first trade, so the curve has to open now. Clear the delay or the buy.");
        return;
      }
      setBusy(
        dev > 0n
          ? "Signing here. One signature creates the coin, opens the curve, and buys the first slice."
          : "Signing here. One signature creates the coin and opens the curve.",
      );
      const deployed = await deployCurve({
        chain,
        name: cleanName,
        symbol: cleanSymbol,
        supplyWhole: whole,
        virtualNativeWei: virt,
        virtualTokenWhole: depth,
        graduationWei: grad,
        maxBuyWei: cap,
        delaySeconds: delay * 60n,
        owner,
        devBuyWei: dev,
        onStatus: (message, hash) => {
          setBusy(message);
          if (hash) setTx(hash);
        },
      });
      setBusy("");
      if (!deployed.ok) {
        setError(deployed.error);
        return;
      }
      contract = deployed.address;
      hash = deployed.hash;
      setTx(deployed.hash);
    }

    const res = stamp({
      chain,
      mode,
      name,
      symbol,
      supplyWhole: supply,
      graduation,
      virtualNative,
      virtualTokenWhole: virtualToken,
      devBuy: mode === "curve" ? devBuy : "",
      delayMin: mode === "curve" ? delayMin : "0",
      maxBuy: mode === "curve" ? maxBuy : "",
      allocs,
      blurb,
      telegram,
      xHandle,
      image,
      creator: "",
      contract,
    });
    if (!res.ok) setError(`${res.error} The token was still created at ${contract}.`);
    try {
      await publishCoin({
        data: {
          chain,
          mode,
          name: cleanName,
          symbol: cleanSymbol,
          supply,
          contract,
          creator: boardCreator,
          image,
          blurb,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} The token exists on chain, but other people will not see it on the floor.`
          : "The token exists on chain, but other people will not see it on the floor.",
      );
    }
    rememberLaunched({
      id: res.ok ? (res.id ?? "") : "",
      chain,
      contract,
      name: cleanName,
      symbol: cleanSymbol,
      image,
      creator: owner,
    });
    if (chain !== "solana" && mode === "curve" && devBuy.trim()) {
      const first = parseDecimal(devBuy.trim(), CHAINS[chain].nativeDecimals);
      if (first && first > 0n) {
        void recordTrade({
          data: { contract, side: "buy", amountWei: first.toString(), who: owner, price: "" },
        }).catch(() => undefined);
      }
    }
    setLaunched({
      id: res.ok ? (res.id ?? "") : "",
      contract,
      name: cleanName,
      symbol: cleanSymbol,
      image,
      chain,
      hash,
    });
  }

  if (launched) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-4xl">It's on the board</h1>
        <p className="mt-3 text-muted">Copy the link, or the line for Telegram and X. Then trade it here.</p>
        {needTerms ? <div className="mt-4"><TermsGate onAccept={() => setNeedTerms(false)} /></div> : null}
        {error ? <p className="mt-3 text-sm text-sell">{error}</p> : null}
        <div className="mt-6">
          <ShareCard
            chain={launched.chain}
            contract={launched.contract}
            symbol={launched.symbol}
            name={launched.name}
            image={launched.image}
            ticketId={launched.id || undefined}
          />
        </div>
        {launched.hash ? (
          <a
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cyan"
            href={launched.chain === "solana" ? solanaExplorerTx(launched.hash) : explorerTx(launched.chain, launched.hash)}
          >
            View transaction
          </a>
        ) : null}
        <button type="button" className="btn-line mt-4" onClick={() => setLaunched(null)}>
          Launch another
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-medium text-cyan">
        {mode === "plain" ? "Regular pool" : "Curve"}
      </p>
      <h1 className="mt-2 text-4xl">Launch a coin</h1>
      {!wallet ? (
        <p className="mt-3 text-sm text-muted">
          <Link to="/login" className="font-semibold text-cyan">Create your profile</Link> first. Then this page can sign.
        </p>
      ) : null}
      <p className="mt-3 text-muted">
        {mode === "plain"
          ? "Name, ticker, a project picture, one signature. The supply is minted to your wallet."
          : "Name, ticker, a project picture, one signature. The curve is tradable when the chain confirms. You keep 30% of the 1% fee, and 30% of the pool after it graduates."}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" className={cn("w-full", mode === "curve" ? "btn-cyan" : "btn-line")} onClick={() => pick("curve")}>
          Curve
        </button>
        <button type="button" className={cn("w-full", mode === "plain" ? "btn-cyan" : "btn-line")} onClick={() => pick("plain")}>
          Regular pool
        </button>
      </div>

      <KeyLock address={wallet}>
      <form onSubmit={submit} className="ticket mt-6 space-y-5">
        <ProjectPicture image={image} onChange={setImage} onError={setError} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Forged Rail" required />
          </div>
          <div>
            <Label>Ticker</Label>
            <TextInput
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="FORGE"
              required
            />
          </div>
        </div>

        <div>
          <Label>Chain</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {LAUNCH_CHAINS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={chain === id}
                onClick={() => setChain(id)}
                className={cn(
                  "min-h-11 px-2 py-3 text-center",
                  chain === id ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border",
                )}
              >
                <ChainMark id={id} className="mx-auto h-8 w-8" />
                <span className="mt-2 block text-xs font-extrabold">{CHAINS[id].label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{CHAIN_NOTE[chain]}</p>
          {chain === "arc" ? (
            <p className="mt-2 text-xs text-muted">
              Send USDC on Arc to the same address as Base. The chain counts that balance in 18 decimals. The 6-decimal ERC-20 view is the same money, and this launch does not use it. Fees under 20 gwei are dropped.
            </p>
          ) : null}
          {chain === "solana" ? (
            <p className="mt-2 text-xs text-muted">
              The mint is a real SPL token. A curve launch holds the inventory on Solana, so buys and sells move SOL. The first deploy of the program costs about 1 SOL. Name and ticker stay on this board.
            </p>
          ) : null}
        </div>

        <div>
          <Label>Note</Label>
          <TextInput value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Optional" />
        </div>

        {mode === "curve" ? (
          <div>
            <Label>First buy ({meta.native})</Label>
            <TextInput
              value={devBuy}
              onChange={(e) => setDevBuy(e.target.value)}
              placeholder="0 — skip it"
              inputMode="decimal"
            />
            <p className="mt-1.5 text-xs text-muted">Optional. On Solana it is the next signature. On the other chains it rides in the same one.</p>
          </div>
        ) : null}
        {mode === "plain" ? (
          <div>
            <Label>Supply</Label>
            <TextInput value={supply} onChange={(e) => setSupply(e.target.value)} inputMode="numeric" />
            <p className="mt-1.5 text-xs text-muted">Minted once, to your wallet. No mint after that.</p>
          </div>
        ) : null}

        <details className="bg-bg px-3 py-2 shadow-border">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            {mode === "curve" ? "Curve settings" : "More"}
          </summary>
          <div className="space-y-4 pb-3">
            {mode === "curve" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Graduate at ({meta.native})</Label>
                  <TextInput
                    value={graduation}
                    onChange={(e) => setGraduation(e.target.value)}
                    placeholder={chain === "solana" ? "50" : "5"}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <Label>Start reserve ({meta.native})</Label>
                  <TextInput
                    value={virtualNative}
                    onChange={(e) => setVirtualNative(e.target.value)}
                    placeholder="1"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <Label>Curve depth (tokens)</Label>
                  <TextInput
                    value={virtualToken}
                    onChange={(e) => setVirtualToken(e.target.value)}
                    placeholder="80% of supply"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label>Supply</Label>
                  <TextInput value={supply} onChange={(e) => setSupply(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <Label>Open delay (minutes)</Label>
                  <TextInput value={delayMin} onChange={(e) => setDelayMin(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <Label>Max buy ({meta.native})</Label>
                  <TextInput value={maxBuy} onChange={(e) => setMaxBuy(e.target.value)} placeholder="No cap" inputMode="decimal" />
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Telegram</Label>
                <TextInput value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@yourgroup" />
              </div>
              <div>
                <Label>X</Label>
                <TextInput value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="@yourhandle" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Page labels</Label>
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm font-semibold text-cyan"
                  onClick={() => setAllocs((rows) => [...rows, { label: "", percent: "" }])}
                >
                  Add label
                </button>
              </div>
              <p className="mb-2 text-xs text-muted">
                These stay on the coin page. They are not extra wallets on the contract.
              </p>
              <div className="space-y-2">
                {allocs.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                    <TextInput
                      value={row.label}
                      placeholder="Label"
                      onChange={(e) =>
                        setAllocs((rows) => rows.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))
                      }
                    />
                    <TextInput
                      value={row.percent}
                      placeholder="%"
                      inputMode="decimal"
                      onChange={(e) =>
                        setAllocs((rows) => rows.map((item, i) => (i === index ? { ...item, percent: e.target.value } : item)))
                      }
                    />
                    <button
                      type="button"
                      className="min-h-11 px-3 text-sm text-muted"
                      onClick={() => setAllocs((rows) => rows.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        <p className="text-sm text-muted">
          {evmWallet
            ? `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}. It was created in this browser.`
            : "Create a wallet on Account before you launch. Opening the site does not create one."}
        </p>
        {evmWallet && chain === "solana" && sol ? <GasStep address={sol} chain="solana" /> : null}
        {evmWallet && chain !== "solana" ? <GasStep address={wallet} chain={chain} /> : null}
        {error ? (
          <p role="alert" className="text-sm text-sell">
            {error}
          </p>
        ) : null}
        {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
        {tx && chain === "solana" ? (
          <a className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan" href={solanaExplorerTx(tx)}>
            View transaction
          </a>
        ) : null}
        {tx && chain !== "solana" ? (
          <a className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan" href={explorerTx(chain, tx)}>
            View transaction
          </a>
        ) : null}
        <Button type="submit" className="w-full" disabled={Boolean(busy)}>
          {chain === "solana" ? "Launch on Solana" : mode === "plain" ? "Launch pool" : "Launch curve"}
        </Button>
        <p className="text-sm text-muted">{launchRisk(chain, mode)}</p>
      </form>
      </KeyLock>
    </div>
  );
}

function launchRisk(chain: string, mode: string): string {
  if (chain === "solana" && mode === "plain") {
    return "This mints a fixed supply to your Solana address. There is no curve and nowhere on this site to sell it. Unaudited.";
  }
  if (chain === "solana") {
    return "This creates a Solana curve. Buys spend SOL and receive tokens. Sells return SOL. The first time, the program itself is deployed and that costs about 1 SOL. Unaudited.";
  }
  if (mode === "plain") {
    return "This mints a fixed supply to your wallet. There is no curve and nowhere on this site to sell it. Unaudited.";
  }
  return "Unaudited. The buy that fills a new curve opens a pool. You keep 30% of the LP and earn fees on that market. The other 70% is burned. Ethereum, Robinhood, and Arc use Uniswap. Base uses Aerodrome. BNB Chain uses PancakeSwap. Arc pairs the coin with USDC. Coins launched before this update burn the whole LP.";
}

function ProjectPicture({
  image,
  onChange,
  onError,
}: {
  image: string;
  onChange: (next: string) => void;
  onError: (message: string) => void;
}) {
  function take(file: File | undefined) {
    if (!file) return;
    void readMark(file).then(
      (next) => {
        onChange(next);
        onError("");
      },
      (err: unknown) => onError(err instanceof Error ? err.message : "Could not read that picture."),
    );
  }

  return (
    <div>
      <Label>Project picture</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className="grid h-32 w-32 shrink-0 cursor-pointer place-items-center overflow-hidden bg-bg shadow-border"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            take(e.dataTransfer.files?.[0]);
          }}
        >
          {image ? (
            <img src={image} alt="Project picture" className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-xs font-semibold text-muted">Add a picture</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="text-sm text-muted">
          <p>PNG or JPG. People see this on the floor and on the coin page.</p>
          {image ? (
            <button type="button" className="mt-2 min-h-11 font-semibold text-cyan" onClick={() => onChange("")}>
              Remove picture
            </button>
          ) : (
            <p className="mt-2">Click the square or drop a file on it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function readMark(file: File): Promise<string> {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  if (!type.startsWith("image/") && !/\.(png|jpe?g|webp)$/.test(name)) {
    return Promise.reject(new Error("Use a PNG or JPG."));
  }
  if (file.size > 12_000_000) return Promise.reject(new Error("That picture is too large. Try one under 12 MB."));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that picture."));
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      let quality = 0.82;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 180_000 && quality > 0.45) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (!data.startsWith("data:image/") || data.length > 180_000) {
        reject(new Error("That picture is still too heavy. Try a simpler image."));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that picture. Use a PNG or JPG."));
    };
    img.src = url;
  });
}