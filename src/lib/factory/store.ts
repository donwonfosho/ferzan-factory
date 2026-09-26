import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armAttach, initialFloor, stampPrimary, trade } from "./engine";
import type { AttachInput, Desk, Launch, PrimaryInput, TradeInput } from "./types";

type Result = { ok: true; id?: string } | { ok: false; error: string };

type Profile = { name: string; image: string; bio: string };

type Store = {
  launches: Launch[];
  desk: Desk;
  wallet: string;
  profile: Profile;
  setWallet: (address: string) => void;
  setProfile: (patch: Partial<Profile>) => void;
  stampPrimary: (input: PrimaryInput) => Result;
  armAttach: (input: AttachInput) => Result;
  trade: (input: TradeInput) => Result;
  reset: () => void;
};

const seed = initialFloor();

export const useFactory = create<Store>()(
  persist(
    (set, get) => ({
      launches: seed.launches,
      desk: seed.desk,
      wallet: "",
      profile: { name: "", image: "", bio: "" },
      setWallet: (address) => set({ wallet: address }),
      setProfile: (patch) => set({ profile: { ...get().profile, ...patch } }),
      stampPrimary: (input) => {
        const res = stampPrimary(
          { launches: get().launches, desk: get().desk },
          { ...input, creator: get().wallet || "you" },
        );
        if (!res.ok) return res;
        set({ launches: res.floor.launches, desk: res.floor.desk });
        return { ok: true, id: res.id };
      },
      armAttach: (input) => {
        const res = armAttach(
          { launches: get().launches, desk: get().desk },
          { ...input, creator: get().wallet || "you" },
        );
        if (!res.ok) return res;
        set({ launches: res.floor.launches, desk: res.floor.desk });
        return { ok: true, id: res.id };
      },
      trade: (input) => {
        const res = trade({ launches: get().launches, desk: get().desk }, input);
        if (!res.ok) return res;
        set({ launches: res.floor.launches, desk: res.floor.desk });
        return { ok: true };
      },
      reset: () => {
        const next = initialFloor();
        set({ launches: next.launches, desk: next.desk });
      },
    }),
    {
      name: "ferzan-factory-v3",
      skipHydration: true,
      partialize: (state) => ({ launches: state.launches, desk: state.desk, wallet: state.wallet, profile: state.profile }),
    },
  ),
);

export function useFloor() {
  return useFactory((state) => ({ launches: state.launches, desk: state.desk }));
}

const LAUNCHED_KEY = "ferzan-launched-v1";

export type SavedCoin = {
  id: string;
  chain: string;
  contract: string;
  name: string;
  symbol: string;
  image: string;
  creator: string;
};

export function rememberLaunched(coin: SavedCoin) {
  if (typeof window === "undefined" || !coin.contract) return;
  try {
    const prev = readRemembered().filter((row) => row.contract.toLowerCase() !== coin.contract.toLowerCase());
    window.localStorage.setItem(LAUNCHED_KEY, JSON.stringify([coin, ...prev].slice(0, 40)));
  } catch {
    /* The coin is still on the chain. */
  }
}

export function readRemembered(): SavedCoin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(LAUNCHED_KEY) || "[]") as SavedCoin[];
    return Array.isArray(raw) ? raw.filter((row) => row && typeof row.contract === "string" && row.contract) : [];
  } catch {
    return [];
  }
}
