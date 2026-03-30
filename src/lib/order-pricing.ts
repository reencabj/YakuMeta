/**
 * Precio sugerido por kg de meta (ARS) según cantidad total del pedido.
 * - Menos de 3 kg: 90.000/kg
 * - De 3 kg a menos de 6 kg: 80.000/kg
 * - 6 kg o más: 75.000/kg
 */
export function suggestedPricePerKgMeta(cantidadMetaKilos: number): number {
  if (!Number.isFinite(cantidadMetaKilos) || cantidadMetaKilos <= 0) {
    return 90000;
  }
  if (cantidadMetaKilos >= 6) return 75000;
  if (cantidadMetaKilos >= 3) return 80000;
  return 90000;
}
