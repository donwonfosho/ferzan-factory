/** Retry a failed read. Five tries, then stop. Waits 1s, 2s, 4s, 8s between tries. */
export async function tryFive<T>(run: () => Promise<T>, onRetry?: () => void): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 5; i += 1) {
    try {
      return await run();
    } catch (err) {
      last = err;
      if (i === 4) break;
      onRetry?.();
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error("Busy right now");
}
