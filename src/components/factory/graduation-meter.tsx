import { useEffect, useRef, useState } from "react";
import { formatSmart } from "@/lib/factory/units";
import { cn } from "@/lib/cn";

export function GraduationMeter({
  filled,
  goal,
  graduated,
  native,
  decimals,
}: {
  filled: bigint;
  goal: bigint;
  graduated: boolean;
  native: string;
  decimals: number;
}) {
  const pct = graduated || goal <= 0n ? 100 : Math.min(100, Number((filled * 10_000n) / goal) / 100);
  const shown = Math.round(pct);
  const [motion, setMotion] = useState<"up" | "down" | "">("");
  const prev = useRef(pct);

  useEffect(() => {
    if (pct > prev.current + 0.05) setMotion("up");
    else if (pct < prev.current - 0.05) setMotion("down");
    else setMotion("");
    prev.current = pct;
    const timer = window.setTimeout(() => setMotion(""), 700);
    return () => window.clearTimeout(timer);
  }, [pct]);

  return (
    <div className={cn("grad-meter", motion === "up" && "up", motion === "down" && "down", graduated && "done")}>
      <div className="flex items-baseline justify-between gap-3 text-sm font-medium">
        <span className="text-cyan">{graduated ? "Graduated" : "To graduation"}</span>
        <span className="tabular-nums text-fg">{shown}%</span>
      </div>
      <div className="grad-track mt-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} aria-label="Graduation">
        <div className="grad-fill" style={{ width: `${shown}%` }} />
      </div>
      <p className="mt-1.5 text-sm text-muted tabular-nums">
        {graduated
          ? "Filled. Buys on the curve are closed."
          : `${formatSmart(filled, decimals)} / ${formatSmart(goal, decimals)} ${native}`}
      </p>
    </div>
  );
}
