import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

export function Button({
  variant = "cyan",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "cyan" | "ghost" | "sell" }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 disabled:opacity-40",
        variant === "cyan" && "btn-cyan",
        variant === "ghost" && "btn-line",
        variant === "sell" && "btn-sell",
        className,
      )}
      {...props}
    />
  );
}

export function Mark({ symbol, image, className }: { symbol: string; image?: string; className?: string }) {
  if (image) {
    return <img src={image} alt="" className={cn("h-12 w-12 shrink-0 rounded-xl object-cover", className)} />;
  }
  return (
    <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-cyan text-sm font-semibold text-cyan-ink", className)}>
      {symbol.slice(0, 2)}
    </span>
  );
}
export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-sm font-medium text-muted">{children}</div>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-11 w-full rounded-lg bg-bg px-3 text-fg shadow-border outline-none placeholder:text-muted",
        props.className,
      )}
    />
  );
}

export function Choice({
  on,
  title,
  detail,
  onClick,
  disabled,
}: {
  on: boolean;
  title: string;
  detail?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-lg px-3 py-2 text-left shadow-border transition-shadow",
        on ? "bg-cyan text-cyan-ink" : "bg-bg text-fg hover:shadow-border-hover",
        disabled && "opacity-40",
      )}
    >
      <div className="text-sm font-semibold">{tr(title)}</div>
      {detail ? <div className={cn("mt-0.5 text-xs", on ? "text-cyan-ink/80" : "text-muted")}>{detail}</div> : null}
    </button>
  );
}
