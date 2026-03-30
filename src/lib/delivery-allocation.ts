import type { BatchWithRelations } from "@/services/stockBatchesService";
import type { DeliverItemInput } from "@/services/orderService";

export type DeliveryLineDraft =
  | { kind: "deposit_multi"; depositoIds: string[]; kg: number }
  | { kind: "produccion_directa"; kg: number };

function depositNombre(batches: BatchWithRelations[], depositoId: string): string {
  const b = batches.find((x) => x.deposito.id === depositoId);
  return b?.deposito.nombre ?? depositoId;
}

/**
 * Convierte líneas (varios depósitos por línea + producción directa) en ítems para `deliver_order`.
 * FIFO: primero por lote dentro de cada depósito; entre depósitos, orden alfabético por nombre de depósito.
 */
export function buildDeliverItemsFromLines(
  orderKg: number,
  lines: DeliveryLineDraft[],
  batches: BatchWithRelations[]
): { ok: true; items: DeliverItemInput[] } | { ok: false; error: string } {
  const sum = lines.reduce((s, l) => s + l.kg, 0);
  if (Math.abs(sum - orderKg) > 0.001) {
    return { ok: false, error: `La suma de líneas (${sum.toFixed(2)} kg) debe igualar el pedido (${orderKg.toFixed(2)} kg).` };
  }

  const remaining = new Map<string, number>();
  for (const b of batches) {
    if (!b.is_active) continue;
    const avail = Number(b.cantidad_meta_kilos) - Number(b.cantidad_reservada_meta_kilos);
    if (avail > 0) remaining.set(b.id, avail);
  }

  const items: DeliverItemInput[] = [];

  for (const line of lines) {
    if (line.kind === "produccion_directa") {
      items.push({ source_type: "produccion_directa", quantity_meta_kilos: line.kg });
      continue;
    }

    const ids = [...new Set(line.depositoIds)].filter(Boolean);
    if (ids.length === 0) {
      return { ok: false, error: "En cada línea de stock marcá al menos un depósito." };
    }

    const orderedDepositIds = [...ids].sort((a, b) =>
      depositNombre(batches, a).localeCompare(depositNombre(batches, b), "es")
    );

    let need = line.kg;
    for (const depositoId of orderedDepositIds) {
      if (need <= 1e-9) break;

      const depBatches = batches
        .filter((b) => b.deposito.id === depositoId && b.is_active)
        .sort((a, b) => {
          const ta = new Date(a.fecha_guardado).getTime();
          const tb = new Date(b.fecha_guardado).getTime();
          return ta - tb || a.id.localeCompare(b.id);
        });

      for (const b of depBatches) {
        if (need <= 1e-9) break;
        const av = remaining.get(b.id) ?? 0;
        if (av <= 0) continue;
        const take = Math.min(av, need);
        items.push({
          source_type: "stock",
          batch_id: b.id,
          storage_location_id: depositoId,
          quantity_meta_kilos: take,
        });
        remaining.set(b.id, av - take);
        need -= take;
      }
    }

    if (need > 1e-6) {
      return {
        ok: false,
        error: `No hay stock libre suficiente en los depósitos elegidos (faltan ${need.toFixed(2)} kg según FIFO).`,
      };
    }
  }

  return { ok: true, items };
}
