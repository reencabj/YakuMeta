import { Star } from "lucide-react";
import type { OrderState } from "@/types/database";
import type { OrderWithCreator } from "@/services/orderService";
import { parseIsoSafe } from "@/lib/format-date";

/** Pedidos que cuentan como “en curso” para la cola operativa */
export const ACTIVE_ORDER_STATES: OrderState[] = ["pendiente", "en_preparacion"];

export const CLOSED_ORDER_STATES: OrderState[] = ["entregado", "cancelado"];

/** null / 0 → sin prioridad; 1 y 2 = niveles con más urgencia. */
export function normalizaPrioridad(p: number | null | undefined): 0 | 1 | 2 {
  if (p == null || p <= 0) return 0;
  if (p >= 2) return 2;
  return 1;
}

const prioritySortRank = (p: number | null | undefined) => {
  const n = normalizaPrioridad(p);
  if (n === 2) return 0;
  if (n === 1) return 1;
  return 2;
};

/** Solo pendiente / en preparación: prioridad 2 → 1 → sin; mismo nivel, más viejos primero. */
export function sortActiveOrders(list: OrderWithCreator[]): OrderWithCreator[] {
  return [...list].sort((a, b) => {
    const ap = prioritySortRank(a.prioridad);
    const bp = prioritySortRank(b.prioridad);
    if (ap !== bp) return ap - bp;
    const ta = parseIsoSafe(a.fecha_pedido)?.getTime() ?? 0;
    const tb = parseIsoSafe(b.fecha_pedido)?.getTime() ?? 0;
    return ta - tb;
  });
}

/** Entregados y cancelados: más recientes por última actualización primero (proxy de cierre). */
export function sortClosedOrders(list: OrderWithCreator[]): OrderWithCreator[] {
  return [...list].sort((a, b) => {
    const ta = parseIsoSafe(a.updated_at)?.getTime() ?? 0;
    const tb = parseIsoSafe(b.updated_at)?.getTime() ?? 0;
    return tb - ta;
  });
}

export function OrderPriorityStars({ prioridad }: { prioridad: number | null | undefined }) {
  const n = normalizaPrioridad(prioridad);
  if (n === 0) return null;
  if (n === 1) {
    return <Star className="size-3.5 shrink-0 fill-primary text-primary" aria-hidden />;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-px" title="Prioridad alta">
      <Star className="size-3.5 fill-primary text-primary" aria-hidden />
      <Star className="size-3.5 fill-primary text-primary" aria-hidden />
    </span>
  );
}

export function estadoBadgeClass(estado: string): string {
  switch (estado) {
    case "pendiente":
      return "border-border bg-muted text-foreground";
    case "en_preparacion":
      return "border-primary/45 bg-primary/15 text-foreground";
    case "entregado":
      return "border-primary/30 bg-primary/10 text-foreground";
    case "cancelado":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted";
  }
}
