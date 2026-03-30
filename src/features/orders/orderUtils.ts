import type { OrderState } from "@/types/database";
import type { OrderWithCreator } from "@/services/orderService";

/** Pedidos que cuentan como “en curso” para la cola operativa */
export const ACTIVE_ORDER_STATES: OrderState[] = ["pendiente", "en_preparacion"];

export function sortOrders(list: OrderWithCreator[]): OrderWithCreator[] {
  return [...list].sort((a, b) => {
    const aAct = ACTIVE_ORDER_STATES.includes(a.estado) ? 0 : 1;
    const bAct = ACTIVE_ORDER_STATES.includes(b.estado) ? 0 : 1;
    if (aAct !== bAct) return aAct - bAct;
    const ta = new Date(a.fecha_pedido).getTime();
    const tb = new Date(b.fecha_pedido).getTime();
    if (aAct === 0) return ta - tb;
    return tb - ta;
  });
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
