import type { DepositRowModel } from "@/hooks/useDeposits";

const SIN_ZONA_KEY = "__sin_zona__";

export type DepositSortMode = "fullness" | "emptiness" | "nombre";

/** Primera palabra del nombre en minúsculas (clave de agrupación). */
export function getZona(nombre: string): string {
  const w = nombre.trim().split(/\s+/)[0] ?? "";
  return w ? w.toLowerCase() : "";
}

function getZonaLabelFromNombre(nombre: string): string {
  const w = nombre.trim().split(/\s+/)[0] ?? "";
  return w || "—";
}

function sortDepositsInZone(a: DepositRowModel, b: DepositRowModel, depositSort: DepositSortMode): number {
  if (depositSort === "nombre") {
    return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
  }
  if (depositSort === "fullness") {
    const pa = a.ocupacion_pct ?? -1;
    const pb = b.ocupacion_pct ?? -1;
    return pb - pa;
  }
  if (depositSort === "emptiness") {
    const pa = a.ocupacion_pct ?? 999;
    const pb = b.ocupacion_pct ?? 999;
    return pa - pb;
  }
  return 0;
}

export type ZonaGroup = {
  key: string;
  /** Texto mostrado (primera palabra tal como en el primer nombre ordenado). */
  label: string;
  deposits: DepositRowModel[];
  count: number;
  /** Suma de stock (kg meta) en la zona. */
  totalKg: number;
  /** Suma de capacidad en kg meta de los depósitos de la zona. */
  totalCapMetaKg: number;
};

/**
 * Agrupa depósitos por primera palabra del nombre; ordena zonas alfabéticamente
 * y aplica el mismo criterio de orden que la lista global dentro de cada zona.
 */
export function groupDepositsByZona(deposits: DepositRowModel[], depositSort: DepositSortMode): ZonaGroup[] {
  const map = new Map<string, DepositRowModel[]>();
  for (const d of deposits) {
    const key = getZona(d.nombre) || SIN_ZONA_KEY;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }

  const groups: ZonaGroup[] = [];

  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => sortDepositsInZone(a, b, depositSort));
    let label: string;
    if (key === SIN_ZONA_KEY) {
      label = "Sin nombre";
    } else {
      label = getZonaLabelFromNombre(sorted[0]?.nombre ?? "");
    }
    const totalKg = sorted.reduce((s, d) => s + d.total_meta_kg, 0);
    const totalCapMetaKg = sorted.reduce((s, d) => s + Number(d.capacidad_meta_kilos ?? 0), 0);
    groups.push({
      key,
      label,
      deposits: sorted,
      count: sorted.length,
      totalKg,
      totalCapMetaKg,
    });
  }

  groups.sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }));
  return groups;
}
