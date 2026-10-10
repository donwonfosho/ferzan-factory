/** Shown in feedback. Change this when a beta build ships. */
export const APP_VERSION = "2026.10.10-beta";

/** Banner sentence. Unreachable uses degraded. No banner for normal or unknown. */
export const STATUS_BANNER_TEXT = {
  degraded: "Some parts of Ferzan are slow or unavailable. Your funds are safe in your wallet; try again in a few minutes.",
  down: "Ferzan is having problems. Don't send new transactions until this banner is gone.",
} as const;
