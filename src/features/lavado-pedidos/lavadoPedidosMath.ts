import type { LavadoPedidoTipoPago } from "@/types/database";

export type LavadoPedidosConfigLike = {
  comision_instantaneo: number;
  comision_7_dias: number;
  script_porcentaje: number;
  dias_entrega_plazo: number;
};

export type LavadoPedidoCalc = {
  comisionPct: number;
  scriptPct: number;
  montoEntregar: number;
  descuentoTotal: number;
  perdidaScript: number;
  gananciaRealBanda: number;
};

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcLavadoPedido(
  monto: number,
  tipoPago: LavadoPedidoTipoPago,
  config: LavadoPedidosConfigLike
): LavadoPedidoCalc {
  const safeMonto = Number.isFinite(monto) && monto > 0 ? monto : 0;
  const comisionPct = tipoPago === "instantaneo" ? Number(config.comision_instantaneo) : Number(config.comision_7_dias);
  const scriptPct = Number(config.script_porcentaje);
  const descuentoTotal = roundMoney(safeMonto * comisionPct);
  const perdidaScript = roundMoney(safeMonto * scriptPct);
  return {
    comisionPct,
    scriptPct,
    montoEntregar: roundMoney(safeMonto * (1 - comisionPct)),
    descuentoTotal,
    perdidaScript,
    gananciaRealBanda: roundMoney(descuentoTotal - perdidaScript),
  };
}

export function deliveryDateFor(tipoPago: LavadoPedidoTipoPago, diasEntregaPlazo: number, base = new Date()) {
  if (tipoPago === "instantaneo") return null;
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, Math.trunc(diasEntregaPlazo)));
  return d.toISOString().slice(0, 10);
}

export function daysDiffFromToday(dateIso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function deliveryCountdownLabel(tipoPago: LavadoPedidoTipoPago, fechaEntrega: string | null) {
  if (tipoPago === "instantaneo") return "Instantáneo";
  if (!fechaEntrega) return "Sin fecha";
  const diff = daysDiffFromToday(fechaEntrega);
  if (diff > 1) return `Entregar en ${diff} días`;
  if (diff === 1) return "Entregar mañana";
  if (diff === 0) return "Entrega hoy";
  if (diff === -1) return "Vencido hace 1 día";
  return `Vencido hace ${Math.abs(diff)} días`;
}

export function money(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(n)
    .replace(/\$\s+/u, "$");
}

export function pct(n: number) {
  return `${Math.round(Number(n) * 10000) / 100}%`;
}
