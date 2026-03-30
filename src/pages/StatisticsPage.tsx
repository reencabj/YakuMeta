import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import {
  ArrowDownRight,
  BarChart3,
  Download,
  Package,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader, PageShell, PanelCard, SegmentTabs, StatTile } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv";
import { fmtKgDisplay } from "@/lib/format-kilo";
import { supabase } from "@/lib/supabase";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { useStatisticsReport } from "@/hooks/useStatistics";
import {
  fetchDeliveriesForExport,
  fetchMovementsForExport,
  fetchOrdersForExport,
  type StatisticsFilters,
  type StatsGranularity,
} from "@/services/statisticsService";
import type { MovementType, OrderState } from "@/types/database";
import { cn } from "@/lib/utils";

const MOVEMENT_TYPES: MovementType[] = [
  "ingreso",
  "reserva",
  "liberacion_reserva",
  "egreso_entrega",
  "ajuste_admin",
  "correccion",
  "descarte",
  "produccion_directa_entrega",
  "transferencia_salida",
  "transferencia_entrada",
  "vaciado_deposito",
  "correccion_composicion",
];

const ORDER_STATES: OrderState[] = ["pendiente", "en_preparacion", "entregado", "cancelado"];

function selectClass() {
  return cn(
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  );
}

function MiniBars(props: { points: { label: string; value: number; value2?: number }[]; color: string; color2?: string }) {
  const max = Math.max(1, ...props.points.flatMap((p) => [p.value, p.value2 ?? 0]));
  return (
    <div className="flex h-40 items-end gap-1 overflow-x-auto pb-2">
      {props.points.map((p) => (
        <div key={p.label} className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1">
          <div className="flex w-full flex-1 items-end justify-center gap-0.5">
            <div
              className={cn("w-full max-w-[14px] rounded-t bg-primary/80", props.color)}
              style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 4 : 0 }}
              title={`${p.label}: ${p.value.toFixed(2)}`}
            />
            {p.value2 != null && props.color2 ? (
              <div
                className={cn("w-full max-w-[14px] rounded-t", props.color2)}
                style={{ height: `${(p.value2 / max) * 100}%`, minHeight: p.value2 > 0 ? 4 : 0 }}
              />
            ) : null}
          </div>
          <span className="max-w-full truncate text-[9px] text-muted-foreground">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function StatisticsPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, []);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [granularity, setGranularity] = useState<StatsGranularity>("day");
  const [usuarioId, setUsuarioId] = useState("");
  const [tipoMovimiento, setTipoMovimiento] = useState<MovementType | "">("");
  const [depositoId, setDepositoId] = useState("");
  const [tipoDepositoId, setTipoDepositoId] = useState("");
  const [estadoPedido, setEstadoPedido] = useState<OrderState | "">("");

  const filters: StatisticsFilters = useMemo(
    () => ({
      from,
      to,
      usuarioId: usuarioId || undefined,
      tipoMovimiento: tipoMovimiento || undefined,
      depositoId: depositoId || undefined,
      tipoDepositoId: tipoDepositoId || undefined,
      estadoPedido: estadoPedido || undefined,
    }),
    [from, to, usuarioId, tipoMovimiento, depositoId, tipoDepositoId, estadoPedido]
  );

  const report = useStatisticsReport(filters, granularity);

  const depositsQ = useQuery({
    queryKey: ["storage_locations", "stats-filters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("id, nombre, tipo_id")
        .eq("is_active", true)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const typesQ = useQuery({
    queryKey: ["storage_location_types", "stats-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("storage_location_types").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profilesQ = useQuery({
    queryKey: ["profiles", "stats-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, username, display_name").order("username");
      if (error) throw error;
      return data ?? [];
    },
  });

  const settingsQ = useAppSettingsQuery();
  const currency = settingsQ.data?.currency?.trim() || "USD";

  const seriesPoints = useMemo(() => {
    const s = report.data?.series ?? [];
    return s.map((p) => ({
      label: p.bucket,
      value: p.kilosVendidos,
      value2: p.dinero,
    }));
  }, [report.data?.series]);

  const exportSummary = async () => {
    if (!user?.id) return;
    const r = report.data;
    if (!r) return;
    downloadCsv(
      `estadisticas_resumen_${from}_${to}.csv`,
      [
        { key: "metric", header: "metrica" },
        { key: "value", header: "valor" },
      ],
      [
        { metric: "kilos_vendidos", value: r.kpis.kilosVendidos },
        { metric: "dinero_cobrado", value: r.kpis.dineroCobrado },
        { metric: "pedidos_creados", value: r.kpis.pedidosCreados },
        { metric: "pedidos_entregados", value: r.kpis.pedidosEntregados },
        { metric: "pedidos_cancelados", value: r.kpis.pedidosCancelados },
        { metric: "produccion_directa_kg", value: r.kpis.produccionDirectaKg },
        { metric: "stock_ingresado_kg", value: r.kpis.stockIngresadoKg },
        { metric: "stock_movido_transferencia_kg", value: r.kpis.stockMovidoKg },
        { metric: "vaciado_ajuste_kg", value: r.kpis.stockVaciadoAjusteKg },
        { metric: "entrega_stock_kg", value: r.kpis.entregaDesdeStockKg },
        { metric: "entrega_produccion_kg", value: r.kpis.entregaDesdeProduccionKg },
        { metric: "falta_preparar_kg_actual", value: r.kpis.faltaPrepararKg ?? "" },
      ]
    );
  };

  const exportOrders = async () => {
    const rows = await fetchOrdersForExport(filters);
    downloadCsv(
      `pedidos_${from}_${to}.csv`,
      [
        { key: "id", header: "id" },
        { key: "cliente_nombre", header: "cliente" },
        { key: "cantidad_meta_kilos", header: "kg_meta" },
        { key: "estado", header: "estado" },
        { key: "fecha_pedido", header: "fecha_pedido" },
        { key: "created_at", header: "creado_en" },
        { key: "creado_por", header: "creado_por" },
      ],
      rows.map((o: Record<string, unknown>) => {
        const cp = o.creado_por as { username?: string } | undefined;
        return {
          ...o,
          creado_por: cp?.username ?? "",
        };
      })
    );
  };

  const exportDeliveries = async () => {
    const rows = await fetchDeliveriesForExport(filters);
    downloadCsv(
      `entregas_${from}_${to}.csv`,
      [
        { key: "id", header: "id" },
        { key: "order_id", header: "pedido_id" },
        { key: "cliente", header: "cliente" },
        { key: "entregado_at", header: "entregado_at" },
        { key: "dinero_recibido", header: "dinero" },
        { key: "produccion_directa_meta_kilos", header: "prod_directa_kg" },
        { key: "items_resumen", header: "items" },
      ],
      rows.map((d) => ({
        id: d.id,
        order_id: d.order_id,
        cliente: (d.order as { cliente_nombre?: string } | null)?.cliente_nombre ?? "",
        entregado_at: d.entregado_at,
        dinero_recibido: d.dinero_recibido,
        produccion_directa_meta_kilos: d.produccion_directa_meta_kilos,
        items_resumen: (d.items ?? [])
          .map((i) => `${i.origen_tipo}:${i.cantidad_meta_kilos}`)
          .join(";"),
      }))
    );
  };

  const exportMovements = async () => {
    const rows = await fetchMovementsForExport(filters);
    downloadCsv(
      `movimientos_stock_${from}_${to}.csv`,
      [
        { key: "id", header: "id" },
        { key: "tipo_movimiento", header: "tipo" },
        { key: "cantidad_meta_kilos", header: "kg_meta" },
        { key: "deposito_id", header: "deposito_id" },
        { key: "pedido_id", header: "pedido_id" },
        { key: "usuario_id", header: "usuario_id" },
        { key: "created_at", header: "fecha" },
      ],
      rows as unknown as Record<string, unknown>[]
    );
  };

  const kpis = report.data?.kpis;

  return (
    <PageShell>
      <PageHeader
        title="Estadísticas"
        description="Indicadores globales del negocio por período (mismos totales para todos los usuarios; RLS de Supabase aplica). Los administradores pueden filtrar por usuario en los desplegables."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void exportSummary()}>
              <Download className="size-3.5" />
              Resumen CSV
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void exportOrders()}>
              <Download className="size-3.5" />
              Pedidos
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void exportDeliveries()}>
              <Download className="size-3.5" />
              Entregas
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void exportMovements()}>
              <Download className="size-3.5" />
              Movimientos
            </Button>
          </div>
        }
      />

      <section className="rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          {isAdmin ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Usuario</Label>
              <select className={selectClass()} value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
                <option value="">Todos</option>
                {(profilesQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name ?? p.username}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo movimiento</Label>
            <select className={selectClass()} value={tipoMovimiento} onChange={(e) => setTipoMovimiento(e.target.value as MovementType | "")}>
              <option value="">Todos</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Depósito</Label>
            <select className={selectClass()} value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
              <option value="">Todos</option>
              {(depositsQ.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo depósito</Label>
            <select className={selectClass()} value={tipoDepositoId} onChange={(e) => setTipoDepositoId(e.target.value)}>
              <option value="">Todos</option>
              {(typesQ.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estado pedido</Label>
            <select className={selectClass()} value={estadoPedido} onChange={(e) => setEstadoPedido(e.target.value as OrderState | "")}>
              <option value="">Todos</option>
              {ORDER_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Agregación temporal</span>
          <SegmentTabs
            value={granularity}
            onChange={(v) => setGranularity(v as StatsGranularity)}
            options={[
              { value: "day", label: "Día" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mes" },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={TrendingUp}
          label="Kilos vendidos (entregas)"
          value={fmtKgDisplay(kpis?.kilosVendidos, report.isLoading)}
          unit="kg"
          hint="Suma de ítems de entrega en el período"
          tone="emerald"
          dense
        />
        <StatTile
          icon={Wallet}
          label="Dinero cobrado"
          value={report.isLoading ? "…" : kpis != null ? kpis.dineroCobrado.toLocaleString("es-AR", { maximumFractionDigits: 0 }) : "—"}
          unit={currency}
          tone="slate"
          dense
        />
        <StatTile
          icon={Truck}
          label="Pedidos entregados"
          value={report.isLoading ? "…" : String(kpis?.pedidosEntregados ?? "—")}
          unit="pedidos"
          tone="amber"
          dense
        />
        <StatTile
          icon={ArrowDownRight}
          label="Pedidos cancelados"
          value={report.isLoading ? "…" : String(kpis?.pedidosCancelados ?? "—")}
          unit="en período"
          tone="rose"
          dense
        />
        <StatTile
          icon={Package}
          label="Pedidos creados"
          value={report.isLoading ? "…" : String(kpis?.pedidosCreados ?? "—")}
          unit="altas"
          tone="slate"
          dense
        />
        <StatTile
          icon={BarChart3}
          label="Producción directa"
          value={fmtKgDisplay(kpis?.produccionDirectaKg, report.isLoading)}
          unit="kg"
          tone="amber"
          dense
        />
        <StatTile
          icon={Package}
          label="Stock ingresado"
          value={fmtKgDisplay(kpis?.stockIngresadoKg, report.isLoading)}
          unit="kg"
          tone="emerald"
          dense
        />
        <StatTile
          icon={Truck}
          label="Stock movido (transfer.)"
          value={fmtKgDisplay(kpis?.stockMovidoKg, report.isLoading)}
          unit="kg salida"
          tone="slate"
          dense
        />
        <StatTile
          icon={ArrowDownRight}
          label="Vaciado / ajuste / composición"
          value={fmtKgDisplay(kpis?.stockVaciadoAjusteKg, report.isLoading)}
          unit="kg"
          tone="rose"
          dense
        />
        <StatTile
          icon={TrendingUp}
          label="Falta preparar (actual)"
          value={fmtKgDisplay(kpis?.faltaPrepararKg, report.isLoading)}
          unit="kg global"
          hint="No depende del filtro de fechas"
          tone="rose"
          emphasize
          dense
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard
          icon={BarChart3}
          title="Serie temporal"
          description="Barras: kg vendidos (primario) y dinero cobrado (secundario, escala relativa)."
          headerExtra={
            <span className="text-xs text-muted-foreground">
              {report.isError ? "Error al cargar" : null}
            </span>
          }
        >
          {seriesPoints.length === 0 && !report.isLoading ? (
            <p className="text-sm text-muted-foreground">Sin entregas en el período.</p>
          ) : (
            <MiniBars points={seriesPoints} color="bg-emerald-500/90" color2="bg-sky-500/80" />
          )}
        </PanelCard>

        <PanelCard icon={Wallet} title="Entregas: stock vs producción directa" description="Kilos por origen en el período filtrado.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs uppercase text-muted-foreground">Desde stock</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtKgDisplay(kpis?.entregaDesdeStockKg, report.isLoading)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs uppercase text-muted-foreground">Producción directa</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtKgDisplay(kpis?.entregaDesdeProduccionKg, report.isLoading)}</p>
            </div>
          </div>
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard icon={Package} title="Depósitos más usados" description="Cantidad de movimientos registrados (filtrados).">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead className="text-right">Movimientos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.rankings.depositosPorMovimientos ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
        <PanelCard icon={Truck} title="Usuarios con más entregas" description="Entregas registradas en el período.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead className="text-right">Entregas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.rankings.usuariosEntregas ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard icon={Package} title="Ingresos de stock por usuario" description="Suma de kg en movimientos tipo ingreso.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead className="text-right">Kg meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.rankings.usuariosIngresos ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.value.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
        <PanelCard icon={Truck} title="Transferencias por depósito" description="Kg movidos (salida + entrada en depósito).">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead className="text-right">Kg meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.rankings.depositosPorKgMovidos ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.value.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard icon={Package} title="Lotes más antiguos" description="Por fecha de guardado (stock activo).">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead>Guardado</TableHead>
                <TableHead className="text-right">Kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.lotesMasAntiguos ?? []).map((r) => (
                <TableRow key={r.batchId}>
                  <TableCell className="max-w-[140px] truncate">{r.depositoNombre}</TableCell>
                  <TableCell className="tabular-nums text-xs">{r.fechaGuardado}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.kg.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
        <PanelCard icon={Package} title="Ocupación de depósitos" description="Kg guardado / capacidad (aprox.).">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Kg / cap.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.depositosOcupacion ?? []).map((r) => (
                <TableRow key={r.depositoId}>
                  <TableCell className="max-w-[160px] truncate">{r.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.ocupacionKg.toFixed(0)} / {r.capacidadKg.toFixed(0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      </div>

      <PanelCard icon={Package} title="Stock en riesgo / vencimiento" description="Según umbrales en configuración.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Depósito</TableHead>
              <TableHead>Riesgo</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Kg</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(report.data?.stockRiesgo ?? []).map((r) => (
              <TableRow key={r.batchId}>
                <TableCell className="max-w-[160px] truncate">{r.depositoNombre}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      r.riesgo === "vencido" && "bg-red-950/50 text-red-200",
                      r.riesgo === "critico" && "bg-amber-950/50 text-amber-200",
                      r.riesgo === "warning" && "bg-yellow-950/40 text-yellow-100",
                      r.riesgo === "ok" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {r.riesgo}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{r.fechaVencimiento ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.kg.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>
    </PageShell>
  );
}
