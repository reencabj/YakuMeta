import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Contenedor de página alineado al dashboard: alto mínimo y ritmo vertical. */
export function PageShell(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[calc(100dvh-5.5rem)] flex-col gap-6", props.className)}>{props.children}</div>
  );
}

export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{props.title}</h1>
        {props.description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? <div className="flex flex-wrap gap-2">{props.actions}</div> : null}
    </div>
  );
}

export type StatTone = "slate" | "amber" | "emerald" | "rose";

/** Tarjeta KPI (misma identidad que el dashboard). */
export function StatTile(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  hint?: string;
  tone: StatTone;
  emphasize?: boolean;
  /** Más baja para grillas con muchas columnas (ej. Pedidos). */
  dense?: boolean;
}) {
  const Icon = props.icon;
  const toneRing =
    props.tone === "amber"
      ? "from-primary/18 to-transparent"
      : props.tone === "emerald"
        ? "from-primary/16 to-transparent"
        : props.tone === "rose"
          ? "from-primary/20 to-transparent"
          : "from-foreground/10 to-transparent";

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-2xl border shadow-sm",
        "border-border/80 bg-gradient-to-br from-card via-card to-muted/20",
        props.emphasize && "ring-1 ring-primary/35",
        props.dense ? "p-4" : "p-5"
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90", toneRing)} />
      <div className="relative flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80",
            props.dense ? "size-9" : "size-10",
            props.tone === "rose" && "text-primary/90",
            props.tone === "amber" && "text-primary/90",
            props.tone === "emerald" && "text-primary/90",
            props.tone === "slate" && "text-foreground/80"
          )}
        >
          <Icon className={props.dense ? "size-4" : "size-5"} aria-hidden />
        </div>
      </div>
      <div className={cn("relative space-y-1", props.dense ? "mt-3" : "mt-4")}>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{props.label}</p>
        <p className="flex flex-wrap items-baseline gap-1.5">
          <span
            className={cn(
              "font-semibold tabular-nums tracking-tight text-foreground",
              props.dense ? "text-2xl" : "text-3xl sm:text-4xl"
            )}
          >
            {props.value}
          </span>
          <span className="text-sm font-medium text-muted-foreground">{props.unit}</span>
        </p>
        {props.hint && !props.dense ? <p className="text-xs leading-snug text-muted-foreground">{props.hint}</p> : null}
      </div>
    </div>
  );
}

/** Panel con cabecera con icono (Stock, filtros, tablas). */
export function PanelCard(props: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  headerExtra?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden border-border/70 bg-gradient-to-b from-card to-muted/15 shadow-sm",
        props.className
      )}
    >
      <div className="border-b border-border/60 bg-muted/20 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60">
              <Icon className="size-5 text-primary" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">{props.title}</h2>
              {props.description ? (
                <div className="mt-0.5 text-xs text-muted-foreground [&_p]:inline">{props.description}</div>
              ) : null}
            </div>
          </div>
          {props.headerExtra}
        </div>
      </div>
      <CardContent className="flex-1 p-5">{props.children}</CardContent>
    </Card>
  );
}

/** Pestañas / segment control al estilo dashboard. */
export function SegmentTabs(props: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-border/70 bg-muted/30 p-1 text-sm shadow-sm"
      )}
      role="tablist"
      aria-label={props["aria-label"] ?? "Vista"}
    >
      {props.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={props.value === opt.value}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium transition-colors",
            props.value === opt.value
              ? "bg-primary/20 text-foreground shadow-sm ring-1 ring-primary/25"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => props.onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
