/**
 * Run `fn` on an interval while the tab is visible.
 * Pauses while document.hidden. Runs once as soon as the tab is visible again.
 * Returns a stop function. Does not run on subscribe; call `fn` yourself for the first pass.
 */
export function setPollInterval(fn: () => void, ms: number): () => void {
  if (typeof window === "undefined") return () => {};
  let timer = 0;
  const start = () => {
    if (timer) return;
    timer = window.setInterval(fn, ms);
  };
  const stop = () => {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  };
  const onVis = () => {
    if (document.hidden) {
      stop();
      return;
    }
    fn();
    start();
  };
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVis);
  };
}
