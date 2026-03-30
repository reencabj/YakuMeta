import { endOfDay, format, getISOWeek, getISOWeekYear, parseISO, startOfDay } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { Database, MovementType, OrderState } from "@/types/database";

export type StatsGranularity = "day" | "week" | "month";

export type StatisticsFilters = {
  /** yyyy-MM-dd */
  from: string;
  /** yyyy-MM-dd */
  to: string;
  usuarioId?: string;
  tipoMovimiento?: MovementType | "";
  depositoId?: string;
  tipoDepositoId?: string;
  estadoPedido?: OrderState | "";
};

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type MovementRow = Database["public"]["Tables"]["stock_movements"]["Row"];
type DeliveryRow = Database["public"]["Tables"]["order_deliveries"]["Row"];
type DeliveryItemRow = Database["public"]["Tables"]["order_delivery_items"]["Row"];

export type DeliveryWithOrderItems = DeliveryRow & {
  items: DeliveryItemRow[];
  order: Pick<OrderRow, "id" | "cliente_nombre" | "estado" | "creado_por_usuario_id" | "cantidad_meta_kilos"> | null;
};

function rangeIso(from: string, to: string) {
  const fromIso = startOfDay(parseISO(from)).toISOString();
  const toIso = endOfDay(parseISO(to)).toISOString();
  return { fromIso, toIso };
}

function bucketKey(d: Date, g: StatsGranularity): string {
  if (g === "day") return format(d, "yyyy-MM-dd");
  if (g === "week") {
    const y = getISOWeekYear(d);
    const w = getISOWeek(d);
    return `${y}-W${String(w).padStart(2, "0")}`;
  }
  return format(d, "yyyy-MM");
}

function movementMatchesFilter(m: MovementRow, f: StatisticsFilters, depositIds: Set<string> | null): boolean {
  if (f.tipoMovimiento && m.tipo_movimiento !== f.tipoMovimiento) return false;
  if (f.usuarioId && m.usuario_id !== f.usuarioId) return false;
  if (depositIds && depositIds.size > 0) {
    if (!m.deposito_id || !depositIds.has(m.deposito_id)) return false;
  }
  return true;
}

async function resolveDepositFilterSet(
  depositoId?: string,
  tipoDepositoId?: string
): Promise<Set<string> | null> {
  if (depositoId) return new Set([depositoId]);
  if (!tipoDepositoId) return null;
  const { data, error } = await supabase.from("storage_locations").select("id").eq("tipo_id", tipoDepositoId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

export type StatisticsKpis = {
  kilosVendidos: number;
  dineroCobrado: number;
  pedidosCreados: number;
  pedidosEntregados: number;
  pedidosCancelados: number;
  produccionDirectaKg: number;
  stockIngresadoKg: number;
  stockMovidoKg: number;
  stockVaciadoAjusteKg: number;
  entregaDesdeStockKg: number;
  entregaDesdeProduccionKg: number;
  faltaPrepararKg: number | null;
};

export type TimePoint = { bucket: string; kilosVendidos: number; dinero: number };

export type RankRow = { id: string; label: string; value: number };

export type BatchRiskRow = {
  batchId: string;
  depositoId: string;
  depositoNombre: string;
  fechaGuardado: string;
  fechaVencimiento: string | null;
  kg: number;
  diasHastaVenc: number | null;
  riesgo: "vencido" | "critico" | "warning" | "ok";
};

export type DepositOccupationRow = {
  depositoId: string;
  nombre: string;
  capacidadKg: number;
  ocupacionKg: number;
  pct: number;
};

export type StatisticsReport = {
  kpis: StatisticsKpis;
  series: TimePoint[];
  rankings: {
    depositosPorMovimientos: RankRow[];
    usuariosEntregas: RankRow[];
    usuariosIngresos: RankRow[];
    depositosPorKgMovidos: RankRow[];
  };
  lotesMasAntiguos: BatchRiskRow[];
  stockRiesgo: BatchRiskRow[];
  depositosOcupacion: DepositOccupationRow[];
};

function sumItemsKg(items: DeliveryItemRow[], depositIds: Set<string> | null): { stock: number; prod: number; total: number } {
  let stock = 0;
  let prod = 0;
  for (const it of items) {
    const kg = Number(it.cantidad_meta_kilos);
    if (it.origen_tipo === "produccion_directa") {
      prod += kg;
      continue;
    }
    if (depositIds && depositIds.size > 0) {
      if (!it.deposito_id || !depositIds.has(it.deposito_id)) continue;
    }
    stock += kg;
  }
  return { stock, prod, total: stock + prod };
}

export async function fetchStatisticsReport(filters: StatisticsFilters, granularity: StatsGranularity): Promise<StatisticsReport> {
  const { fromIso, toIso } = rangeIso(filters.from, filters.to);
  const depositIds = await resolveDepositFilterSet(filters.depositoId, filters.tipoDepositoId);

  const [
    kpiRes,
    ordersInRange,
    ordersCancelled,
    movements,
    deliveriesRaw,
    deposits,
    profiles,
    batches,
    settings,
  ] = await Promise.all([
    supabase.from("v_pedidos_kpis").select("*").maybeSingle(),
    (async () => {
      let q = supabase
        .from("orders")
        .select("*")
        .eq("is_active", true)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (filters.estadoPedido) q = q.eq("estado", filters.estadoPedido);
      if (filters.usuarioId) q = q.eq("creado_por_usuario_id", filters.usuarioId);
      return q;
    })(),
    (async () => {
      let q = supabase
        .from("orders")
        .select("id, updated_at, estado")
        .eq("is_active", true)
        .eq("estado", "cancelado")
        .gte("updated_at", fromIso)
        .lte("updated_at", toIso);
      if (filters.usuarioId) q = q.eq("creado_por_usuario_id", filters.usuarioId);
      return q;
    })(),
    (async () => {
      let q = supabase
        .from("stock_movements")
        .select("*")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (filters.tipoMovimiento) q = q.eq("tipo_movimiento", filters.tipoMovimiento);
      if (filters.usuarioId) q = q.eq("usuario_id", filters.usuarioId);
      return q;
    })(),
    (async () => {
      let q = supabase
        .from("order_deliveries")
        .select(
          `
          *,
          items:order_delivery_items (*),
          order:orders (
            id,
            cliente_nombre,
            estado,
            creado_por_usuario_id,
            cantidad_meta_kilos
          )
        `
        )
        .gte("entregado_at", fromIso)
        .lte("entregado_at", toIso)
        .order("entregado_at", { ascending: true });
      if (filters.usuarioId) q = q.eq("created_by", filters.usuarioId);
      return q;
    })(),
    supabase.from("storage_locations").select("id, nombre, capacidad_guardado_kg, tipo_id").eq("is_active", true),
    supabase.from("profiles").select("id, username, display_name").eq("is_active", true),
    supabase
      .from("stock_batches")
      .select(
        "id, deposito_id, cantidad_meta_kilos, equivalente_guardado_kg, fecha_guardado, fecha_vencimiento_estimada, is_active, estado"
      )
      .eq("is_active", true)
      .gt("cantidad_meta_kilos", 0),
    supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (kpiRes.error) throw kpiRes.error;
  if (ordersInRange.error) throw ordersInRange.error;
  if (ordersCancelled.error) throw ordersCancelled.error;
  if (movements.error) throw movements.error;
  if (deliveriesRaw.error) throw deliveriesRaw.error;
  if (deposits.error) throw deposits.error;
  if (profiles.error) throw profiles.error;
  if (batches.error) throw batches.error;
  if (settings.error) throw settings.error;

  const movementsList = (movements.data ?? []) as MovementRow[];
  const deliveries = (deliveriesRaw.data ?? []) as unknown as DeliveryWithOrderItems[];

  /** Aplica filtro de depósito / tipo depósito a entregas e ítems */
  function deliveryRelevant(d: DeliveryWithOrderItems): boolean {
    if (filters.estadoPedido && d.order?.estado && d.order.estado !== filters.estadoPedido) return false;
    if (!depositIds || depositIds.size === 0) return true;
    return d.items.some((it) => {
      if (it.origen_tipo === "produccion_directa") return true;
      return it.deposito_id && depositIds.has(it.deposito_id);
    });
  }

  const deliveriesF = deliveries.filter(deliveryRelevant);

  let kilosVendidos = 0;
  let dineroCobrado = 0;
  let produccionDirectaKg = 0;
  let entregaStock = 0;
  let entregaProd = 0;
  const orderIdsEntregados = new Set<string>();
  const seriesMap = new Map<string, { kg: number; money: number }>();

  for (const d of deliveriesF) {
    dineroCobrado += Number(d.dinero_recibido);
    produccionDirectaKg += Number(d.produccion_directa_meta_kilos ?? 0);
    const sums = sumItemsKg(d.items ?? [], depositIds);
    kilosVendidos += sums.total;
    entregaStock += sums.stock;
    entregaProd += sums.prod;
    orderIdsEntregados.add(d.order_id);
    const dt = parseISO(d.entregado_at);
    const key = bucketKey(dt, granularity);
    const cur = seriesMap.get(key) ?? { kg: 0, money: 0 };
    cur.kg += sums.total;
    cur.money += Number(d.dinero_recibido);
    seriesMap.set(key, cur);
  }

  const ordersCreated = (ordersInRange.data ?? []) as OrderRow[];
  const pedidosCreados = filters.estadoPedido
    ? ordersCreated.filter((o) => o.estado === filters.estadoPedido).length
    : ordersCreated.length;

  const pedidosCancelados = (ordersCancelled.data ?? []).length;
  const pedidosEntregados = orderIdsEntregados.size;

  const movFiltered = movementsList.filter((m) => movementMatchesFilter(m, filters, depositIds));

  let stockIngresadoKg = 0;
  let stockMovidoKg = 0;
  let stockVaciadoAjusteKg = 0;
  for (const m of movFiltered) {
    const kg = Math.abs(Number(m.cantidad_meta_kilos));
    if (m.tipo_movimiento === "ingreso") stockIngresadoKg += kg;
    if (m.tipo_movimiento === "transferencia_salida") stockMovidoKg += kg;
    if (m.tipo_movimiento === "vaciado_deposito" || m.tipo_movimiento === "ajuste_admin" || m.tipo_movimiento === "correccion_composicion") {
      stockVaciadoAjusteKg += kg;
    }
  }

  const faltaPrepararKg = kpiRes.data ? Number(kpiRes.data.faltante_preparar_kg) : null;

  const profileMap = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name ?? p.username]));

  const depositName = new Map((deposits.data ?? []).map((d) => [d.id, d.nombre]));

  /** Rankings — sobre movimientos filtrados por scope base */
  const movForRank = movementsList.filter((m) => movementMatchesFilter(m, filters, depositIds));
  const countBy = (keyFn: (m: MovementRow) => string | null) => {
    const map = new Map<string, number>();
    for (const m of movForRank) {
      if (filters.tipoMovimiento && m.tipo_movimiento !== filters.tipoMovimiento) continue;
      if (depositIds && depositIds.size > 0 && (!m.deposito_id || !depositIds.has(m.deposito_id))) continue;
      const k = keyFn(m);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };
  const sumKgBy = (pred: (m: MovementRow) => boolean, keyFn: (m: MovementRow) => string | null) => {
    const map = new Map<string, number>();
    for (const m of movForRank) {
      if (!pred(m)) continue;
      if (filters.tipoMovimiento && m.tipo_movimiento !== filters.tipoMovimiento) continue;
      if (depositIds && depositIds.size > 0 && (!m.deposito_id || !depositIds.has(m.deposito_id))) continue;
      const k = keyFn(m);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + Math.abs(Number(m.cantidad_meta_kilos)));
    }
    return map;
  };

  const depCounts = countBy((m) => m.deposito_id);
  const depositosPorMovimientos: RankRow[] = [...depCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({ id, label: depositName.get(id) ?? id.slice(0, 8), value }));

  const depositosPorKg = sumKgBy(
    (m) => m.tipo_movimiento === "transferencia_salida" || m.tipo_movimiento === "transferencia_entrada",
    (m) => m.deposito_id
  );
  const depositosPorKgMovidos: RankRow[] = [...depositosPorKg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({ id, label: depositName.get(id) ?? id.slice(0, 8), value }));

  const entregasPorUsuario = new Map<string, number>();
  for (const d of deliveriesF) {
    const uid = d.created_by;
    entregasPorUsuario.set(uid, (entregasPorUsuario.get(uid) ?? 0) + 1);
  }
  const usuariosEntregas: RankRow[] = [...entregasPorUsuario.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({
      id,
      label: profileMap.get(id) ?? id.slice(0, 8),
      value,
    }));

  const ingresosPorUsuario = sumKgBy((m) => m.tipo_movimiento === "ingreso", (m) => m.usuario_id);
  const usuariosIngresos: RankRow[] = [...ingresosPorUsuario.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({
      id,
      label: profileMap.get(id) ?? id.slice(0, 8),
      value,
    }));

  const series: TimePoint[] = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({
      bucket,
      kilosVendidos: v.kg,
      dinero: v.money,
    }));

  const warnDays = settings.data?.alerta_meta_dias_warning_hasta ?? 6;
  const critDays = settings.data?.alerta_meta_dias_vencido_desde ?? 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const batchRisk: BatchRiskRow[] = [];
  const depositList = deposits.data ?? [];

  for (const b of batches.data ?? []) {
    const dep = depositList.find((d) => d.id === b.deposito_id);
    const fv = b.fecha_vencimiento_estimada ? parseISO(b.fecha_vencimiento_estimada) : null;
    let diasHastaVenc: number | null = null;
    let riesgo: BatchRiskRow["riesgo"] = "ok";
    if (fv) {
      const diff = Math.round((fv.getTime() - today.getTime()) / (24 * 3600 * 1000));
      diasHastaVenc = diff;
      if (diff < 0) riesgo = "vencido";
      else if (diff <= warnDays) riesgo = "critico";
      else if (diff <= critDays + warnDays) riesgo = "warning";
    }
    if (filters.depositoId && b.deposito_id !== filters.depositoId) continue;
    if (depositIds && depositIds.size > 0 && !depositIds.has(b.deposito_id)) continue;

    batchRisk.push({
      batchId: b.id,
      depositoId: b.deposito_id,
      depositoNombre: dep?.nombre ?? "—",
      fechaGuardado: b.fecha_guardado,
      fechaVencimiento: b.fecha_vencimiento_estimada,
      kg: Number(b.cantidad_meta_kilos),
      diasHastaVenc,
      riesgo,
    });
  }

  const lotesMasAntiguos = [...batchRisk]
    .sort((a, b) => a.fechaGuardado.localeCompare(b.fechaGuardado))
    .slice(0, 15);

  const stockRiesgo = batchRisk
    .filter((r) => r.riesgo === "vencido" || r.riesgo === "critico" || r.riesgo === "warning")
    .sort((a, b) => {
      const av = a.diasHastaVenc ?? 9999;
      const bv = b.diasHastaVenc ?? 9999;
      return av - bv;
    })
    .slice(0, 20);

  const occMap = new Map<string, { nombre: string; cap: number; kg: number }>();
  for (const d of depositList) {
    occMap.set(d.id, { nombre: d.nombre, cap: Number(d.capacidad_guardado_kg), kg: 0 });
  }
  for (const b of batches.data ?? []) {
    const o = occMap.get(b.deposito_id);
    if (o) o.kg += Number(b.equivalente_guardado_kg);
  }

  const depositosOcupacion: DepositOccupationRow[] = [...occMap.entries()]
    .map(([depositoId, v]) => {
      const pct = v.cap > 0 ? Math.min(100, (v.kg / v.cap) * 100) : 0;
      return { depositoId, nombre: v.nombre, capacidadKg: v.cap, ocupacionKg: v.kg, pct };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 12);

  return {
    kpis: {
      kilosVendidos,
      dineroCobrado,
      pedidosCreados,
      pedidosEntregados,
      pedidosCancelados,
      produccionDirectaKg,
      stockIngresadoKg,
      stockMovidoKg,
      stockVaciadoAjusteKg,
      entregaDesdeStockKg: entregaStock,
      entregaDesdeProduccionKg: entregaProd,
      faltaPrepararKg,
    },
    series,
    rankings: {
      depositosPorMovimientos,
      usuariosEntregas,
      usuariosIngresos,
      depositosPorKgMovidos,
    },
    lotesMasAntiguos,
    stockRiesgo,
    depositosOcupacion,
  };
}

/** Exportaciones CSV (mismos criterios que los filtros de pantalla; RLS aplica). */
export async function fetchOrdersForExport(filters: StatisticsFilters) {
  const { fromIso, toIso } = rangeIso(filters.from, filters.to);
  let q = supabase
    .from("orders")
    .select(
      `
      *,
      creado_por:profiles!orders_creado_por_usuario_id_fkey (username, display_name)
    `
    )
    .eq("is_active", true)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (filters.estadoPedido) q = q.eq("estado", filters.estadoPedido);
  if (filters.usuarioId) q = q.eq("creado_por_usuario_id", filters.usuarioId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDeliveriesForExport(filters: StatisticsFilters) {
  const { fromIso, toIso } = rangeIso(filters.from, filters.to);
  let q = supabase
    .from("order_deliveries")
    .select(
      `
      *,
      items:order_delivery_items (*),
      order:orders (cliente_nombre, estado, id)
    `
    )
    .gte("entregado_at", fromIso)
    .lte("entregado_at", toIso);
  if (filters.usuarioId) q = q.eq("created_by", filters.usuarioId);
  const { data, error } = await q.order("entregado_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DeliveryWithOrderItems[];
}

export async function fetchMovementsForExport(filters: StatisticsFilters) {
  const { fromIso, toIso } = rangeIso(filters.from, filters.to);
  let q = supabase.from("stock_movements").select("*").gte("created_at", fromIso).lte("created_at", toIso);
  if (filters.tipoMovimiento) q = q.eq("tipo_movimiento", filters.tipoMovimiento);
  if (filters.usuarioId) q = q.eq("usuario_id", filters.usuarioId);
  if (filters.depositoId) q = q.eq("deposito_id", filters.depositoId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MovementRow[];
}
