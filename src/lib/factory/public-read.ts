import { createServerFn } from "@tanstack/react-start";
import type { EmbedCard, PublicCoin } from "./public-read.server";

export type { EmbedCard, PublicCoin };

/** One public coin for the embed page. Null when it is not on the board. */
export const readPublicCoin = createServerFn({ method: "GET" })
  .validator((data: unknown): { chain: string; id: string } => {
    const row = data && typeof data === "object" ? (data as { chain?: unknown; id?: unknown }) : {};
    const chain = typeof row.chain === "string" ? row.chain : "";
    const id = typeof row.id === "string" ? row.id : "";
    return { chain, id };
  })
  .handler(async ({ data }): Promise<PublicCoin | null> => {
    const { openChain, openId, coinBody } = await import("./public-read.server");
    const chain = openChain(data.chain);
    if (!chain) return null;
    const body = JSON.parse(await coinBody(chain, openId(data.id))) as { coin: PublicCoin | null };
    return body.coin;
  });

/** Embed card. Refreshed at most every 20 seconds. */
export const readEmbedCard = createServerFn({ method: "GET" })
  .validator((data: unknown): { chain: string; id: string } => {
    const row = data && typeof data === "object" ? (data as { chain?: unknown; id?: unknown }) : {};
    const chain = typeof row.chain === "string" ? row.chain : "";
    const id = typeof row.id === "string" ? row.id : "";
    return { chain, id };
  })
  .handler(async ({ data }): Promise<EmbedCard | null> => {
    const { openChain, openId, embedCard } = await import("./public-read.server");
    const chain = openChain(data.chain);
    if (!chain) return null;
    return embedCard(chain, openId(data.id));
  });
