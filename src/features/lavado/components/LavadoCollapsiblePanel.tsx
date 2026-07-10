import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function LavadoCollapsiblePanel(props: {
  icon: LucideIcon;
  title: string;
  description?: string;
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
      className={cn(
        "group overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/15 shadow-sm",
        props.className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/25 [&::-webkit-details-marker]:hidden">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60">
          <Icon className="size-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{props.title}</p>
          {props.description ? <p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p> : null}
        </div>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border/60 px-4 py-4">{props.children}</div>
    </details>
  );
}
