import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSetOrderKilosEntregadosAcumuladoMutation } from "@/hooks/useOrders";
import type { OrderWithCreator } from "@/services/orderService";

const STEP_KG = 1;

function roundKg(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtKg(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  order: OrderWithCreator;
  className?: string;
};

export function PartialDeliveryKgControl({ order, className }: Props) {
  const mut = useSetOrderKilosEntregadosAcumuladoMutation();
  const totalKg = roundKg(Number(order.cantidad_meta_kilos));
  const deliveredKg = roundKg(Number(order.kilos_entregados_acumulado ?? 0));
  const remainingKg = roundKg(Math.max(0, totalKg - deliveredKg));
  const pending = mut.isPending && mut.variables?.orderId === order.id;

  const progressPct =
    totalKg > 0 ? Math.min(100, Math.max(0, (deliveredKg / totalKg) * 100)) : 0;

  const applyDelta = (delta: number) => {
    const next = roundKg(Math.min(totalKg, Math.max(0, deliveredKg + delta)));
    if (next === deliveredKg) return;
    void mut.mutateAsync({ orderId: order.id, kilos: next });
  };

  const err =
    mut.isError && mut.variables?.orderId === order.id && mut.error instanceof Error ? mut.error.message : null;

  return (
    <div
      className={cn("relative overflow-hidden rounded-md border border-border/50", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="group"
      aria-label={`Entregas parciales: ${fmtKg(deliveredKg)} de ${fmtKg(totalKg)} kilogramos (${Math.round(progressPct)} por ciento)`}
    >
      <div className="pointer-events-none absolute inset-0 bg-muted/20" aria-hidden />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-primary/40 transition-[width] duration-300 ease-out dark:bg-primary/35"
        style={{ width: `${progressPct}%` }}
        aria-hidden
      />
      <div className="relative z-10 space-y-1 px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">Entregado (kg)</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            Restan: <span className="font-mono text-foreground">{fmtKg(remainingKg)}</span> kg
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0 bg-background/80 backdrop-blur-[2px]"
            disabled={pending || deliveredKg <= 0}
            aria-label={`Quitar ${STEP_KG} kg entregados`}
            onClick={(e) => {
              e.stopPropagation();
              applyDelta(-STEP_KG);
            }}
          >
            <Minus className="size-3.5" />
          </Button>
          <div className="min-w-0 flex-1 text-center text-xs tabular-nums">
            <span className="font-mono text-foreground">{fmtKg(deliveredKg)}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="font-mono text-muted-foreground">{fmtKg(totalKg)}</span>
            <span className="text-muted-foreground"> kg</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0 bg-background/80 backdrop-blur-[2px]"
            disabled={pending || deliveredKg >= totalKg}
            aria-label={`Sumar ${STEP_KG} kg entregados`}
            onClick={(e) => {
              e.stopPropagation();
              applyDelta(STEP_KG);
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        {err ? <p className="text-[10px] text-red-400">{err}</p> : null}
      </div>
    </div>
  );
}
