const KEY = "ferzan-prefs-v1";

export type ChartPlot = "cap" | "price";
export type LaunchAlerts = "off" | "all";

export type Prefs = {
  chart: ChartPlot;
  alerts: LaunchAlerts;
  sound: boolean;
};

const DEFAULTS: Prefs = { chart: "cap", alerts: "all", sound: true };

export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      chart: parsed.chart === "price" ? "price" : "cap",
      alerts: parsed.alerts === "off" ? "off" : "all",
      sound: parsed.sound !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writePrefs(next: Partial<Prefs>): Prefs {
  const merged = { ...readPrefs(), ...next };
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}
