/** Bolsas totales por 1 kg de meta en la operación actual (packs×3 + individuales = 50 → 1 kg). */
export const BOLSAS_PER_KG_META = 50;

/**
 * Convierte entradas de formulario (string vacío, string numérico, number) a entero ≥ 0.
 * Evita que valores string participen en sumas y provoquen concatenación (p. ej. 48 + "2" → "482").
 */
export function normalizeIntCount(value: unknown): number {
  if (value === "" || value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export type MetaKilosFromComposition = {
  packsDe3: number;
  bolsasIndividuales: number;
  totalBolsas: number;
  cantidadMetaKilos: number;
};

/**
 * Cálculo único para preview y submit: siempre suma numérica.
 * `bolsasPerKg` por defecto 50 (1 kg = 50 bolsas).
 */
export function metaKilosFromBagComposition(
  packsDe3Raw: unknown,
  bolsasIndividualesRaw: unknown,
  bolsasPerKg: number = BOLSAS_PER_KG_META
): MetaKilosFromComposition {
  const packsDe3 = normalizeIntCount(packsDe3Raw);
  const bolsasIndividuales = normalizeIntCount(bolsasIndividualesRaw);
  const totalBolsas = packsDe3 * 3 + bolsasIndividuales;
  const cantidadMetaKilos = totalBolsas / bolsasPerKg;
  return { packsDe3, bolsasIndividuales, totalBolsas, cantidadMetaKilos };
}
