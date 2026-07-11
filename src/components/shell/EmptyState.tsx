import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState(props: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = props.icon;
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle px-6 py-10 text-center", props.className)}>
      {Icon ? <Icon className="mb-3 size-8 text-muted-foreground/60" aria-hidden /> : null}
      <p className="text-sm font-medium text-foreground">{props.title}</p>
      {props.description ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{props.description}</p> : null}
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

export function TablePagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const from = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const to = Math.min(props.page * props.pageSize, props.total);
  const sizes = props.pageSizeOptions ?? [25, 50, 100];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-3 text-xs text-muted-foreground">
      <p>
        {props.total === 0 ? "Sin resultados" : `${from}–${to} de ${props.total}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Por página
          <select
            className="h-8 rounded-md border border-subtle bg-surface px-2 text-xs text-foreground"
            value={props.pageSize}
            onChange={(e) => props.onPageSizeChange(Number(e.target.value))}
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md border border-subtle px-2.5 py-1 transition-ui hover:bg-surface disabled:opacity-40"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
          >
            Anterior
          </button>
          <span className="min-w-[4rem] text-center tabular-nums">
            {props.page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-md border border-subtle px-2.5 py-1 transition-ui hover:bg-surface disabled:opacity-40"
            disabled={props.page >= totalPages}
            onClick={() => props.onPageChange(props.page + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
