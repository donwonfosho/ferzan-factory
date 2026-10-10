/**
 * Browser calls for the feedback admin page.
 * The secret stays in feedback-admin.server.ts and is never imported here.
 */
import { createServerFn } from "@tanstack/react-start";

export const loadFeedbackAdmin = createServerFn({ method: "GET" })
  .validator((data: unknown): { kind: "all" | "feedback" | "coin" } => {
    const kind = data && typeof data === "object" ? (data as { kind?: unknown }).kind : "all";
    return { kind: kind === "feedback" || kind === "coin" ? kind : "all" };
  })
  .handler(async ({ data }) => {
    const api = await import("./feedback-admin.server");
    return api.load(data.kind);
  });

export const unlockFeedbackAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown): { password: string } => {
    const password = data && typeof data === "object" ? String((data as { password?: unknown }).password ?? "") : "";
    return { password: password.slice(0, 200) };
  })
  .handler(async ({ data }) => {
    const api = await import("./feedback-admin.server");
    return api.unlock(data.password);
  });
