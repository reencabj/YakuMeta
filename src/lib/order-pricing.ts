import type { CustomerType, PaymentType } from "@/types/database";

export type PricingRuleLike = {
  cantidad_minima_kilos: number;
  precio_por_kilo: number;
  prioridad: number;
  tipo_cliente?: CustomerType;
  tipo_pago?: PaymentType;
  is_active: boolean;
};

/**
 * Misma lógica que public.resolve_suggested_price_per_kg:
 * 1) regla activa para tipo de cliente + pago con mayor mínimo de kg que aplique;
 *    si hay empate en mínimo, gana mayor prioridad;
 * 2) fallback a precio base de app_settings;
 * 3) fallback final a 0.
 */
export function suggestedPricePerKgMeta(
  cantidadMetaKilos: number,
  rules: PricingRuleLike[],
  basePricePerKg: number | null,
  tipoCliente: CustomerType = "normal",
  tipoPago: PaymentType = "blanco"
): number {
  if (!Number.isFinite(cantidadMetaKilos) || cantidadMetaKilos <= 0) {
    return basePricePerKg != null ? Number(basePricePerKg) : 0;
  }
  const active = rules
    .filter(
      (r) =>
        r.is_active &&
        (r.tipo_cliente ?? "normal") === tipoCliente &&
        (r.tipo_pago ?? "blanco") === tipoPago
    )
    .sort((a, b) => b.cantidad_minima_kilos - a.cantidad_minima_kilos || b.prioridad - a.prioridad);
  for (const r of active) {
    if (cantidadMetaKilos >= Number(r.cantidad_minima_kilos)) {
      return Number(r.precio_por_kilo);
    }
  }
  return basePricePerKg != null ? Number(basePricePerKg) : 0;
}
