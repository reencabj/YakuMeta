import { cn } from "@/lib/utils";

export function MiniBars(props: {
  points: { label: string; value: number; value2?: number }[];
  color?: string;
  color2?: string;
  className?: string;
}) {
  const max = Math.max(1, ...props.points.flatMap((p) => [p.value, p.value2 ?? 0]));
  return (
    <div className={cn("flex h-36 items-end gap-1 overflow-x-auto pb-1", props.className)}>
      {props.points.map((p) => (
        <div key={p.label} className="flex min-w-[26px] flex-1 flex-col items-center justify-end gap-1">
          <div className="flex w-full flex-1 items-end justify-center gap-0.5">
            <div
              className={cn("w-full max-w-[12px] rounded-t bg-primary/70", props.color)}
              style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 3 : 0 }}
              title={`${p.label}: ${p.value.toFixed(2)}`}
            />
            {p.value2 != null ? (
              <div
                className={cn("w-full max-w-[12px] rounded-t bg-info/60", props.color2)}
                style={{ height: `${(p.value2 / max) * 100}%`, minHeight: p.value2 > 0 ? 3 : 0 }}
              />
            ) : null}
          </div>
          <span className="max-w-full truncate text-[9px] text-tertiary">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MetricPair(props: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-md border border-subtle bg-background-secondary px-4 py-3", props.className)}>
      <p className="text-[11px] text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{props.value}</p>
    </div>
  );
}

export function RankingTable(props: {
  rows: { id: string; label: string; value: string | number; valueClassName?: string }[];
  emptyLabel?: string;
  loading?: boolean;
}) {
  if (props.loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }
  if (props.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{props.emptyLabel ?? "Sin datos en el período."}</p>;
  }
  return (
    <div className="divide-y divide-subtle">
      {props.rows.map((r, i) => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="w-5 shrink-0 text-[11px] tabular-nums text-tertiary">{i + 1}</span>
            <span className="truncate text-[13px] text-foreground">{r.label}</span>
          </div>
          <span className={cn("shrink-0 text-[13px] font-medium tabular-nums text-foreground", r.valueClassName)}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
