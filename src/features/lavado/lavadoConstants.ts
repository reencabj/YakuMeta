import type { LavadoProcesoId } from "./lavadoMath";

export type LavadoAlmacenId = "liquid" | "growshop";

export const LAVADO_ALMACENES: { id: LavadoAlmacenId; label: string }[] = [
  { id: "liquid", label: "Liquid" },
  { id: "growshop", label: "Growshop" },
];

export const PROCESS_META: Record<LavadoProcesoId, { label: string; in: string; out: string }> = {
  imprimir: { label: "Imprimir", in: "Billetes Enrollados", out: "Hojas de billetes" },
  cortar: { label: "Cortar", in: "Hojas de billetes", out: "Dinero Mojado" },
  secar: { label: "Secar", in: "Dinero Mojado", out: "Dinero Seco" },
  contar: { label: "Contar", in: "Dinero Seco", out: "Dinero en Efectivo" },
};

export function lavadoAlmacenLabel(id: LavadoAlmacenId | string | null | undefined): string {
  return LAVADO_ALMACENES.find((a) => a.id === id)?.label ?? String(id ?? "—");
}

export function lavadoTandaSlotLabel(input: {
  almacen: LavadoAlmacenId | string;
  proceso: LavadoProcesoId;
  estacion: number;
}): string {
  const proc = PROCESS_META[input.proceso]?.label ?? input.proceso;
  return `${lavadoAlmacenLabel(input.almacen)} · ${proc} · E${input.estacion}`;
}
