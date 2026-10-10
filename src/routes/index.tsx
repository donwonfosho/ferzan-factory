import { createFileRoute } from "@tanstack/react-router";
import { Floor } from "@/components/factory/floor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Floor · Ferzan Factory" },
      { name: "description", content: "Launch a coin and trade it on Solana, Base, BNB, Ethereum, Robinhood, Arc, Tron and TON." },
    ],
  }),
  component: Floor,
});
