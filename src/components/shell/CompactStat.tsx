import { cn } from "@/lib/utils";

export function CompactStat(props: {
  label: string;
  value: string;
  unit?: string;
  loading?: boolean;
  compact?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    props.tone === "success"
      ? "text-success"
      : props.tone === "warning"
        ? "text-warning"
        : props.tone === "danger"
          ? "text-destructive"
          : props.tone === "info"
            ? "text-info"
            : "text-foreground";

  return (
    <div
      className={cn(
        "shrink-0 rounded-md border border-subtle bg-surface px-2 py-1",
        props.compact ? "min-w-[5.5rem]" : "min-w-[6.5rem]"
      )}
    >
      <p className="truncate text-[10px] text-muted-foreground">{props.label}</p>
      <p className={cn("truncate text-xs font-medium tabular-nums", toneClass)}>
        {props.loading ? "…" : props.value}
        {props.unit ? <span className="ml-0.5 font-normal text-muted-foreground">{props.unit}</span> : null}
      </p>
    </div>
  );
}
