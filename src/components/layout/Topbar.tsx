import { ChevronDown, Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompactStat } from "@/components/shell/CompactStat";
import { cn } from "@/lib/utils";

export type TopbarMetric = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  loading?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

export function Topbar(props: {
  metrics: TopbarMetric[];
  onMenuClick?: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const primary = props.metrics.slice(0, 4);
  const secondary = props.metrics.slice(4);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-header shrink-0 flex-col justify-center border-b border-subtle bg-background/95 backdrop-blur-sm",
        props.className
      )}
    >
      <div className="flex items-center gap-2 px-3 md:px-4">
        {props.onMenuClick ? (
          <Button variant="ghost" size="icon" className="size-8 shrink-0 md:hidden" onClick={props.onMenuClick} aria-label="Abrir menú">
            <Menu className="size-4" />
          </Button>
        ) : null}

        <div className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:flex">
          {props.metrics.map((m) => (
            <CompactStat key={m.id} label={m.label} value={m.value} unit={m.unit} loading={m.loading} tone={m.tone} />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:hidden">
          {primary.map((m) => (
            <CompactStat key={m.id} label={m.label} value={m.value} unit={m.unit} loading={m.loading} tone={m.tone} compact />
          ))}
        </div>

        {secondary.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground md:hidden"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            Más
            <ChevronDown className={cn("size-3.5 transition-ui", expanded && "rotate-180")} />
          </Button>
        ) : null}
      </div>

      {expanded && secondary.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-subtle px-3 py-2 md:hidden">
          {secondary.map((m) => (
            <CompactStat key={m.id} label={m.label} value={m.value} unit={m.unit} loading={m.loading} tone={m.tone} compact />
          ))}
        </div>
      ) : null}
    </header>
  );
}
