import type { DepositMetrics } from "@/services/depositsService";
import type { BatchWithRelations } from "@/services/stockBatchesService";

export type DepositGroupContribution = {
  depositoId: string;
  nombre: string;
  totalMetaKg: number;
  reservadoMetaKg: number;
  libreMetaKg: number;
  /** % del stock total del grupo aportado por este depósito (0–100). */
  pctOfGroupStock: number;
};

/**
 * Cuánto aporta cada depósito físico al stock agregado del grupo (para barras / tablas).
 */
export function buildDepositContributions(
  memberDepositIds: string[],
  metricsByDepositId: Map<string, DepositMetrics>,
  nombreByDepositId: Map<string, string>,
  groupStockTotalKg: number
): DepositGroupContribution[] {
  const total = Math.max(0, groupStockTotalKg);
  return memberDepositIds.map((id) => {
    const m = metricsByDepositId.get(id);
    const nombre = nombreByDepositId.get(id) ?? id;
    const totalMetaKg = m?.total_meta_kg ?? 0;
    const reservadoMetaKg = m?.reservado_meta_kg ?? 0;
    const libreMetaKg = m?.libre_meta_kg ?? 0;
    const pctOfGroupStock = total > 0 ? Math.min(100, (totalMetaKg / total) * 100) : 0;
    return {
      depositoId: id,
      nombre,
      totalMetaKg,
      reservadoMetaKg,
      libreMetaKg,
      pctOfGroupStock,
    };
  });
}

export function filterBatchesForGroup(
  batches: BatchWithRelations[],
  memberDepositIds: Set<string>
): BatchWithRelations[] {
  return batches.filter((b) => memberDepositIds.has(b.deposito.id));
}

/**
 * Reparto ilustrativo de un pedido sobre los depósitos del grupo (proporcional al stock libre).
 * Base para la fase Pedidos: la reserva real seguirá siendo por lotes; esto muestra la lógica “1 kg → 0,5 + 0,5”.
 */
export function allocateOrderAcrossGroupDeposits(
  cantidadPedidoKg: number,
  deposits: { id: string; nombre: string; libreMetaKg: number }[]
): { id: string; nombre: string; kg: number }[] {
  const viable = deposits.filter((d) => d.libreMetaKg > 0);
  const sumLibre = viable.reduce((s, d) => s + d.libreMetaKg, 0);
  if (sumLibre <= 0 || cantidadPedidoKg <= 0) return [];
  const cap = Math.min(cantidadPedidoKg, sumLibre);

  const out: { id: string; nombre: string; kg: number }[] = [];
  let remaining = cap;
  for (let i = 0; i < viable.length; i++) {
    const d = viable[i];
    if (i === viable.length - 1) {
      out.push({
        id: d.id,
        nombre: d.nombre,
        kg: Math.round(Math.min(d.libreMetaKg, remaining) * 10000) / 10000,
      });
      break;
    }
    const share = (cap * d.libreMetaKg) / sumLibre;
    const kg = Math.round(Math.min(d.libreMetaKg, share) * 10000) / 10000;
    out.push({ id: d.id, nombre: d.nombre, kg });
    remaining -= kg;
  }
  return out;
}
