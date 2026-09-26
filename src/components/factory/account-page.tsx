import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { readRemembered, useFactory } from "@/lib/factory/store";
import { importSiteWallet, knownSiteAddress, markKeySaved, openSiteWallet, readSiteWallet } from "@/lib/factory/site-wallet";
import { listBoard, listLaunched, loadProfile, saveProfile, type BoardCoin } from "@/lib/factory/board";
import { profileFields } from "@/lib/factory/proof";
import { signProof } from "@/lib/factory/proof-client";
import { CHAINS } from "@/lib/factory/catalog";
import type { ChainId } from "@/lib/factory/types";
import { Button, Mark } from "./ui";
import { KeyLock } from "./key-gate";
import { WalletBalances } from "./gas-step";
import { CreatorFees } from "./creator-fees";
import { solanaAddress, solanaSecret } from "@/lib/factory/solana";
import { termsAccepted } from "@/lib/factory/terms";
import { TermsGate } from "./terms";
import { readSolanaHeld } from "@/lib/factory/solana-curve";
import { readTokenBalances } from "@/lib/factory/relay";
import { formatSmart } from "@/lib/factory/units";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  const wallet = useFactory((s) => s.wallet);
  const setWallet = useFactory((s) => s.setWallet);
  const profile = useFactory((s) => s.profile);
  const setProfile = useFactory((s) => s.setProfile);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [copied, setCopied] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [siteKey, setSiteKey] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [sol, setSol] = useState<string | null>(null);
  const usingSite = Boolean(wallet && siteAddress && wallet.toLowerCase() === siteAddress.toLowerCase());

  useEffect(() => {
    const site = readSiteWallet();
    if (site) {
      setSiteKey(site.privateKey);
      setSiteAddress(site.address);
      if (!useFactory.getState().wallet) setWallet(site.address);
    } else {
      setSiteKey("");
      setSiteAddress(knownSiteAddress() || "");
    }
    setSol(solanaAddress());
    const saved = useFactory.getState().profile;
    setName(saved?.name ?? "");
    setBio(saved?.bio ?? "");
    setAgreed(termsAccepted());
  }, [setWallet]);

  useEffect(() => {
    if (!siteAddress) return;
    let stop = false;
    void loadProfile({ data: { address: siteAddress } }).then(
      (row) => {
        if (stop || !row || (!row.name && !row.bio && !row.image)) return;
        setProfile(row);
        setName(row.name);
        setBio(row.bio);
      },
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, [siteAddress, setProfile]);

  function useBrowserWallet() {
    const opened = readSiteWallet();
    if (!opened) {
      setCopied("No wallet on this profile yet. Create one here, or paste a key.");
      return;
    }
    setSiteKey(opened.privateKey);
    setSiteAddress(opened.address);
    setWallet(opened.address);
    setCopied("This profile's wallet is the signer again.");
  }

  async function useExtension() {
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!eth) {
      setCopied("No extension in this browser. The key on this profile stays the signer.");
      return;
    }
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) {
        setCopied("The extension did not return an account.");
        return;
      }
      setWallet(address);
      setCopied("Extension is the signer. The key on this profile is still saved.");
    } catch {
      setCopied("The extension was closed. The profile wallet is unchanged.");
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">Profile</h1>
      <p className="mt-3 text-muted">
        The key is the login. Paste it on another phone and the name, picture, and every coin this wallet launched come back. Those coins also sit on the floor so anyone can trade them.
      </p>

      <div className="ticket mt-6">
        <div className="flex items-center gap-4">
          <label className="grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden bg-bg shadow-border">
            {profile?.image ? <img src={profile.image} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-muted">Photo</span>}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void squarePhoto(file).then(
                  (image) => setProfile({ image }),
                  (err) => setCopied(err instanceof Error ? err.message : "That picture did not load."),
                );
              }}
            />
          </label>
          <div className="min-w-0 flex-1">
            <label className="block text-sm text-muted">
              Name
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} className="mt-1 min-h-11 w-full bg-bg px-3 text-fg shadow-border outline-none" />
            </label>
          </div>
        </div>
        <label className="mt-4 block text-sm text-muted">
          Bio
          <input value={bio} onChange={(e) => setBio(e.target.value.slice(0, 80))} className="mt-1 min-h-11 w-full bg-bg px-3 text-fg shadow-border outline-none" />
        </label>
        <Button
          type="button"
          className="mt-4"
          onClick={() => {
            const next = profileFields({ name, bio, image: useFactory.getState().profile.image ?? "" });
            setProfile(next);
            const jobs = [siteAddress, sol].filter((address): address is string => Boolean(address));
            void Promise.all(
              jobs.map(async (address) => {
                const proof = await signProof("profile", address, next);
                return saveProfile({ data: { address, ...next, proof } });
              }),
            ).then(
              () => setCopied("Saved to this wallet. Paste the key on another phone and it comes back."),
              (err) =>
                setCopied(
                  err instanceof Error
                    ? `Saved on this phone only. ${err.message}`
                    : "Saved on this phone. The site could not store the profile.",
                ),
            );
          }}
        >
          Save profile
        </Button>
        {profile?.bio ? <p className="mt-3 text-sm text-muted">{profile.bio}</p> : null}
      </div>

      <div className="ticket mt-4">
        <p className="text-lg font-semibold">Wallets</p>
        {!siteAddress && !siteKey ? (
          agreed ? (
            <Button
              type="button"
              className="mt-4"
              onClick={() => {
                if (!termsAccepted()) {
                  setAgreed(false);
                  return;
                }
                const opened = openSiteWallet();
                if (!opened) return;
                setSiteKey(opened.privateKey);
                setSiteAddress(opened.address);
                setWallet(opened.address);
                setSol(solanaAddress());
                setCopied("Wallets are on this profile.");
              }}
            >
              Create wallets
            </Button>
          ) : (
            <div className="mt-4">
              <TermsGate onAccept={() => setAgreed(true)} />
            </div>
          )
        ) : (
          <KeyLock address={siteAddress}>
          <div className="mt-4 space-y-3">
            <WalletCard title="Solana wallet" address={sol} secret={sol ? solanaSecret() : null} onNote={setCopied} />
            <WalletCard
              title="EVM wallet"
              address={siteAddress}
              secret={siteKey || null}
              onNote={setCopied}
            />
          </div>
          </KeyLock>
        )}
        {!siteKey && siteAddress ? (
          <p className="mt-3 text-sm text-sell">This browser does not have the key for {shortAddress(siteAddress)}. Import the exported key below.</p>
        ) : null}
        <ReplaceWallet
          onImported={(imported) => {
            markKeySaved(imported.address);
            setWallet(imported.address);
            setSiteKey(imported.privateKey);
            setSiteAddress(imported.address);
            const nextSol = solanaAddress();
            setSol(nextSol);
            void loadProfile({ data: { address: imported.address } }).then((row) => {
              if (!row || (!row.name && !row.bio && !row.image)) return;
              setProfile(row);
              setName(row.name);
              setBio(row.bio);
            });
            setCopied("Wallet imported. Launched coins for this key load below.");
          }}
          onFail={() => setCopied("That is not a key. Paste the exported private key, starting with 0x.")}
        />
        <p className="mt-3 text-sm text-muted">Send chain coins to the matching address. Base ETH is not Ethereum ETH.</p>
        {siteAddress ? (
          <div className="mt-4">
            <WalletBalances evm={siteAddress} sol={sol} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {!usingSite && siteAddress ? (
            <Button type="button" variant="ghost" onClick={useBrowserWallet}>
              Use profile wallet
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => void useExtension()}>
            Use an extension
          </Button>
        </div>
        {copied ? <p className="mt-2 text-sm text-muted">{copied}</p> : null}
      </div>

      {siteAddress ? <Holding evm={siteAddress} sol={sol} /> : null}
      {siteAddress ? <Launched creator={siteAddress} sol={sol} /> : null}
      {siteAddress ? <CreatorFees evm={siteAddress} sol={sol} /> : null}

      {siteAddress ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/p/$address" params={{ address: siteAddress }} className="btn-line">
            Public profile
          </Link>
          {sol ? (
            <Link to="/p/$address" params={{ address: sol }} className="btn-line">
              Solana profile
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="ticket mt-4">
        <p className="text-sm font-medium text-cyan">Sign in</p>
        <p className="mt-2 text-sm text-muted">Sign in does not hold the wallets. Export stays on this page.</p>
        {isPending ? <p className="mt-2 text-sm text-muted">Checking the session.</p> : null}
        {!isPending && user && !user.isDevFallback ? (
          <div className="mt-2">
            <p className="font-extrabold">{user.displayName ?? user.primaryEmail}</p>
            <button type="button" className="btn-line mt-4" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : null}
        {!isPending && authEnabled && (!user || user.isDevFallback) ? (
          <div className="mt-3 flex flex-col gap-2">
            {GROK_PROVIDERS.map((provider) => (
              <button key={provider.providerId} type="button" className="btn-line" onClick={() => void signIn(provider.providerId, { callbackURL: "/login" })}>
                Continue with {provider.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function shortAddress(value: string) {
  if (value.length < 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function WalletCard({
  title,
  address,
  secret,
  onNote,
}: {
  title: string;
  address: string | null;
  secret: string | null;
  onNote: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-bg p-3 shadow-border">
      <p className="font-semibold">{title}</p>
      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface px-3 text-sm">
        <span className="text-muted">Address</span>
        <span className="flex items-center gap-2 font-medium">
          {address ? shortAddress(address) : "—"}
          {address ? (
            <button
              type="button"
              className="text-cyan"
              onClick={() => {
                void navigator.clipboard.writeText(address).then(
                  () => onNote("Address copied."),
                  () => onNote("Copy was blocked."),
                );
              }}
            >
              Copy
            </button>
          ) : null}
        </span>
      </div>
      <button type="button" className="btn-line mt-2 w-full" disabled={!secret} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide private key" : "Export private key"}
      </button>
      {open && secret ? (
        <textarea readOnly value={secret} rows={3} spellCheck={false} className="mt-2 w-full bg-surface px-3 py-3 text-xs break-all shadow-border outline-none" />
      ) : null}
    </div>
  );
}

function ReplaceWallet({
  onImported,
  onFail,
}: {
  onImported: (wallet: { address: `0x${string}`; privateKey: `0x${string}` }) => void;
  onFail: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [needTerms, setNeedTerms] = useState(false);
  if (needTerms) return <TermsGate onAccept={() => setNeedTerms(false)} />;
  return (
    <div className="mt-4">
      <button type="button" className="btn-line w-full" onClick={() => setOpen((current) => !current)}>
        Import wallet
      </button>
      {open ? (
        <div className="mt-2">
          <p className="text-sm text-muted">Paste the exported private key. The name, picture, and coins launched by that wallet come back.</p>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
            placeholder="Exported key"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 w-full bg-surface px-3 text-fg shadow-border outline-none"
          />
          <Button
            type="button"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              if (!termsAccepted()) {
                setNeedTerms(true);
                return;
              }
              const imported = importSiteWallet(value);
              if (!imported) {
                onFail();
                return;
              }
              setValue("");
              setOpen(false);
              onImported(imported);
            }}
          >
            Import
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Holding({ evm, sol }: { evm: string; sol: string | null }) {
  const [rows, setRows] = useState<{ chain: string; address: string; symbol: string; name: string; amount: string }[]>([]);

  useEffect(() => {
    let stop = false;
    void listBoard({ data: { chain: "all", sort: "new", q: "" } }).then(async (coins) => {
      const found: { chain: string; address: string; symbol: string; name: string; amount: string }[] = [];
      const chains = ["base", "ethereum", "bsc", "robinhood", "arc"] as const;
      for (const chain of chains) {
        const tokens = coins
          .filter((coin) => coin.chain === chain)
          .slice(0, 8)
          .map((coin) => ({ address: coin.contract, symbol: coin.symbol }));
        if (!tokens.length) continue;
        const balances = await readTokenBalances({ data: { chain, wallet: evm, tokens } }).catch(() => []);
        for (const balance of balances) {
          const coin = coins.find((item) => item.contract.toLowerCase() === balance.address.toLowerCase());
          const decimals = CHAINS[chain].tokenDecimals;
          found.push({
            chain,
            address: balance.address,
            symbol: balance.symbol,
            name: coin?.name ?? balance.symbol,
            amount: formatSmart(BigInt(balance.raw), decimals),
          });
        }
      }
      if (sol) {
        const mints = coins.filter((coin) => coin.chain === "solana").slice(0, 8);
        for (const coin of mints) {
          const raw = await readSolanaHeld(coin.contract, sol).catch(() => 0n);
          if (raw > 0n) {
            found.push({
              chain: "solana",
              address: coin.contract,
              symbol: coin.symbol,
              name: coin.name,
              amount: formatSmart(raw, CHAINS.solana.tokenDecimals),
            });
          }
        }
      }
      if (!stop) setRows(found);
    }, () => {
      if (!stop) setRows([]);
    });
    return () => {
      stop = true;
    };
  }, [evm, sol]);

  return (
    <div className="mt-8">
      <h2 className="text-xl font-extrabold">Holding</h2>
      <p className="mt-1 text-sm text-muted">Coins on this site that this wallet holds.</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">None yet.</p> : null}
      <div className="mt-3 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <Link key={`${row.chain}:${row.address}`} to="/c/$chain/$address" params={{ chain: row.chain, address: row.address }} className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block font-semibold">{row.symbol}</span>
              <span className="block text-sm text-muted">{row.name} · {CHAINS[row.chain as ChainId]?.label ?? row.chain}</span>
            </span>
            <span className="text-sm tabular-nums">{row.amount}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Launched({ creator, sol }: { creator: string; sol: string | null }) {
  const [rows, setRows] = useState<BoardCoin[] | null>(null);
  const local = readRemembered().filter((row) => row.creator.toLowerCase() === creator.toLowerCase());
  useEffect(() => {
    let stop = false;
    void Promise.all([
      listLaunched({ data: { creator } }).catch(() => [] as BoardCoin[]),
      sol ? listLaunched({ data: { creator: sol } }).catch(() => [] as BoardCoin[]) : Promise.resolve([] as BoardCoin[]),
    ]).then(([evmRows, solRows]) => {
      if (!stop) setRows([...evmRows, ...solRows]);
    });
    return () => {
      stop = true;
    };
  }, [creator, sol]);
  const seen = new Set((rows ?? []).map((row) => row.contract.toLowerCase()));
  const extra = local.filter((row) => !seen.has(row.contract.toLowerCase()));
  return (
    <section className="mt-6">
      <h2 className="text-xl font-extrabold">Launched</h2>
      <p className="mt-1 text-sm text-muted">Stored with this wallet, so they come back when the key is pasted. They are also on the floor.</p>
      {rows === null && extra.length === 0 ? <p className="mt-2 text-sm text-muted">Reading your coins.</p> : null}
      {rows && rows.length === 0 && extra.length === 0 ? <p className="mt-2 text-sm text-muted">None from this profile yet.</p> : null}
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {(rows ?? []).map((coin) => (
          <Coin key={coin.contract} chain={coin.chain} address={coin.contract} symbol={coin.symbol} name={coin.name} image={coin.image} />
        ))}
        {extra.map((coin) => (
          <Coin key={coin.contract} chain={coin.chain} address={coin.contract} symbol={coin.symbol} name={coin.name} image={coin.image} />
        ))}
      </ul>
    </section>
  );
}

function Coin({ chain, address, symbol, name, image }: { chain: string; address: string; symbol: string; name: string; image: string }) {
  const label = CHAINS[chain as ChainId]?.label ?? chain;
  return (
    <li>
      <Link to="/c/$chain/$address" params={{ chain, address }} className="flex items-center gap-3 py-3">
        <Mark symbol={symbol} image={image} />
        <span className="min-w-0">
          <span className="block font-extrabold">{symbol}</span>
          <span className="block truncate text-sm text-muted">{name} · {label}</span>
        </span>
      </Link>
    </li>
  );
}

function squarePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return Promise.reject(new Error("Use a PNG or JPG."));
  }
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
      const data = canvas.toDataURL("image/jpeg", 0.82);
      if (data.length > 180_000) reject(new Error("That picture is too heavy."));
      else resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that picture."));
    };
    img.src = url;
  });
}
