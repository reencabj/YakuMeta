import { Star } from "lucide-react";
import type { OrderState } from "@/types/database";
import type { OrderWithCreator } from "@/services/orderService";

/** Pedidos que cuentan como “en curso” para la cola operativa */
export const ACTIVE_ORDER_STATES: OrderState[] = ["pendiente", "en_preparacion"];

/** null / 0 → sin prioridad; 1 y 2 = niveles con más urgencia. */
export function normalizaPrioridad(p: number | null | undefined): 0 | 1 | 2 {
  if (p == null || p <= 0) return 0;
  if (p >= 2) return 2;
  return 1;
}

/** Orden: no entregados primero (prioridad 2 → 1 → sin), dentro de cada grupo más viejos primero; entregados al final (misma prioridad, fecha pedido descendente). */
export function sortOrders(list: OrderWithCreator[]): OrderWithCreator[] {
  const rankP = (p: number | null | undefined) => {
    const n = normalizaPrioridad(p);
    if (n === 2) return 0;
    if (n === 1) return 1;
    return 2;
  };

  return [...list].sort((a, b) => {
    const aEnt = a.estado === "entregado" ? 1 : 0;
    const bEnt = b.estado === "entregado" ? 1 : 0;
    if (aEnt !== bEnt) return aEnt - bEnt;

    const ap = rankP(a.prioridad);
    const bp = rankP(b.prioridad);
    if (ap !== bp) return ap - bp;

    const ta = new Date(a.fecha_pedido).getTime();
    const tb = new Date(b.fecha_pedido).getTime();
    if (aEnt === 0) return ta - tb;
    return tb - ta;
  });
}

export function OrderPriorityStars({ prioridad }: { prioridad: number | null | undefined }) {
  const n = normalizaPrioridad(prioridad);
  if (n === 0) return null;
  if (n === 1) {
    return <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-px" title="Prioridad alta">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
    </span>
  );
}

export function estadoBadgeClass(estado: string): string {
  switch (estado) {
    case "pendiente":
      return "border-slate-600/60 bg-slate-800/50 text-slate-200";
    case "en_preparacion":
      return "border-sky-600/60 bg-sky-950/40 text-sky-200";
    case "entregado":
      return "border-emerald-700/50 bg-emerald-900/30 text-emerald-100";
    case "cancelado":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted";
  }
}
