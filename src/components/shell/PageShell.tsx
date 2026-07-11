import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageShell(props: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-5", props.className)}>{props.children}</div>;
}

export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        {props.breadcrumb ? <div className="text-xs text-muted-foreground">{props.breadcrumb}</div> : null}
        <h1 className="text-page-title">{props.title}</h1>
        {props.description ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? <div className="flex shrink-0 flex-wrap gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function SectionHeader(props: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", props.className)}>
      <div className="min-w-0">
        <h2 className="text-section-title">{props.title}</h2>
        {props.description ? <div className="mt-0.5 text-xs text-muted-foreground">{props.description}</div> : null}
      </div>
      {props.actions}
    </div>
  );
}

export type StatTone = "slate" | "amber" | "emerald" | "rose" | "violet";

export function StatGrid(props: { children: ReactNode; className?: string; columns?: 2 | 3 | 4 | 5 | 6 }) {
  const cols =
    props.columns === 2
      ? "sm:grid-cols-2"
      : props.columns === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : props.columns === 5
          ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          : props.columns === 6
            ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            : "sm:grid-cols-2 lg:grid-cols-4";

  return <div className={cn("grid grid-cols-1 gap-3", cols, props.className)}>{props.children}</div>;
}

export function StatTile(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  hint?: string;
  tone: StatTone;
  emphasize?: boolean;
  dense?: boolean;
}) {
  const Icon = props.icon;
  const toneValue =
    props.tone === "rose"
      ? "text-destructive"
      : props.tone === "amber"
        ? "text-warning"
        : props.tone === "emerald"
          ? "text-success"
          : props.tone === "violet"
            ? "text-primary"
            : "text-foreground";

  return (
    <div
      className={cn(
        "rounded-lg border border-subtle bg-surface",
        props.dense ? "p-3" : "p-4",
        props.emphasize && "border-primary/25 bg-primary-soft"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">{props.label}</p>
        <Icon className={cn("size-3.5 shrink-0 opacity-60", toneValue)} aria-hidden />
      </div>
      <p className={cn("mt-2 flex flex-wrap items-baseline gap-1", props.dense ? "mt-1.5" : "mt-2")}>
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight text-foreground",
            props.dense ? "text-xl" : "text-[1.75rem] leading-none"
          )}
        >
          {props.value}
        </span>
        <span className="text-xs text-muted-foreground">{props.unit}</span>
      </p>
      {props.hint && !props.dense ? <p className="mt-1 text-xs text-tertiary">{props.hint}</p> : null}
    </div>
  );
}

export function PanelCard(props: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerExtra?: ReactNode;
  flush?: boolean;
}) {
  const Icon = props.icon;
  return (
    <Card className={cn("flex flex-col overflow-hidden border-subtle bg-surface shadow-none", props.className)}>
      <div className={cn("border-b border-subtle", props.flush ? "px-4 py-3" : "px-5 py-3.5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
            <div className="min-w-0">
              <h2 className="text-section-title leading-tight">{props.title}</h2>
              {props.description ? (
                <div className="mt-0.5 text-xs text-muted-foreground [&_p]:inline">{props.description}</div>
              ) : null}
            </div>
          </div>
          {props.headerExtra}
        </div>
      </div>
      <CardContent className={cn("flex-1", props.flush ? "p-4" : "p-5", props.contentClassName)}>
        {props.children}
      </CardContent>
    </Card>
  );
}

export function SegmentTabs(props: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label"?: string;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-subtle bg-background-secondary p-0.5 text-sm"
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
            "rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-ui",
            props.value === opt.value
              ? "bg-surface-elevated text-foreground shadow-sm"
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

export function CollapsiblePanel(props: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const Icon = props.icon;
  return (
    <details
      open={props.open}
      onToggle={(e) => props.onOpenChange?.((e.target as HTMLDetailsElement).open)}
      className={cn("group overflow-hidden rounded-lg border border-subtle bg-surface", props.className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 transition-ui hover:bg-surface-elevated/60 [&::-webkit-details-marker]:hidden">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-section-title leading-tight">{props.title}</p>
          {props.description ? <div className="mt-0.5 text-xs text-muted-foreground">{props.description}</div> : null}
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-ui group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-subtle px-4 py-4">{props.children}</div>
    </details>
  );
}
