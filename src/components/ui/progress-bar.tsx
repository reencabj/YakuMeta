import { cn } from "@/lib/utils";

export function ProgressBar(props: {
  value: number;
  className?: string;
  barClassName?: string;
  size?: "sm" | "md";
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const pct = Math.min(100, Math.max(0, props.value));
  const toneClass =
    props.tone === "success"
      ? "bg-success"
      : props.tone === "warning"
        ? "bg-warning"
        : props.tone === "danger"
          ? "bg-destructive"
          : "bg-primary/70";

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-elevated",
        props.size === "sm" ? "h-1" : "h-1.5",
        props.className
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", toneClass, props.barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}
