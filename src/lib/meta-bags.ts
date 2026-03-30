/** 1 kg meta = 50 bolsas (regla operativa). */
export const BOLSAS_PER_KG_META = 50;

/** Bolsas exactas desde kg de meta (puede ser decimal). */
export function bolsasFromMetaKg(kg: number): number {
  if (!Number.isFinite(kg) || kg < 0) return 0;
  return kg * BOLSAS_PER_KG_META;
}

/** Entero de bolsas para visualización (redondeo al entero más cercano). */
export function roundBolsasFromMetaKg(kg: number): number {
  if (!Number.isFinite(kg) || kg < 0) return 0;
  return Math.round(kg * BOLSAS_PER_KG_META);
}

/**
 * Descompone un entero de bolsas en packs de 3 + individuales (misma lógica que faltante).
 * packs = floor(bolsas / 3), individuales = bolsas % 3
 */
export function decomposeBolsasToPacks3AndIndividuales(bolsas: number): {
  packsDe3: number;
  bolsasIndividuales: number;
} {
  const b = Math.max(0, Math.floor(bolsas));
  return { packsDe3: Math.floor(b / 3), bolsasIndividuales: b % 3 };
}

export type DepositBagFaltante = {
  capacidadBolsas: number;
  ocupadasBolsas: number;
  faltanBolsas: number;
  packs3Faltantes: number;
  individualesFaltantes: number;
};

/** Capacidad vs ocupación en bolsas + faltante descompuesto (depósito). */
export function depositFaltanteBolsas(capacidadMetaKg: number, ocupadaMetaKg: number): DepositBagFaltante {
  const capacidadBolsas = roundBolsasFromMetaKg(capacidadMetaKg);
  const ocupadasBolsas = roundBolsasFromMetaKg(ocupadaMetaKg);
  const faltanBolsas = Math.max(0, capacidadBolsas - ocupadasBolsas);
  const { packsDe3, bolsasIndividuales } = decomposeBolsasToPacks3AndIndividuales(faltanBolsas);
  return {
    capacidadBolsas,
    ocupadasBolsas,
    faltanBolsas,
    packs3Faltantes: packsDe3,
    individualesFaltantes: bolsasIndividuales,
  };
}

export type BatchBagsInfo =
  | {
      fuente: "metadata";
      totalBolsas: number;
      packsDe3: number;
      bolsasIndividuales: number;
    }
  | {
      fuente: "estimado";
      totalBolsas: number;
    };

/** Composición desde metadata del lote o estimado desde kg × 50. */
export function batchBagsFromMetadataOrKg(metadata: unknown, cantidadMetaKg: number): BatchBagsInfo {
  const m = metadata as Record<string, unknown> | null | undefined;
  const packsRaw = m?.packs_de_3;
  const indRaw = m?.bolsas_individuales;
  const totalRaw = m?.total_bolsas;
  if (
    typeof packsRaw === "number" &&
    typeof indRaw === "number" &&
    Number.isFinite(packsRaw) &&
    Number.isFinite(indRaw)
  ) {
    const totalBolsas =
      typeof totalRaw === "number" && Number.isFinite(totalRaw)
        ? Math.round(totalRaw)
        : packsRaw * 3 + indRaw;
    return {
      fuente: "metadata",
      totalBolsas,
      packsDe3: Math.max(0, Math.floor(packsRaw)),
      bolsasIndividuales: Math.max(0, Math.floor(indRaw)),
    };
  }
  return { fuente: "estimado", totalBolsas: roundBolsasFromMetaKg(cantidadMetaKg) };
}
