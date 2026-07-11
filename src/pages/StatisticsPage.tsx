import { useMemo, useState } from "react";
import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import {
  ArrowDownRight,
  BarChart3,
  Download,
  Package,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  FilterBar,
  MetricPair,
  MiniBars,
  PageHeader,
  PageShell,
  PanelCard,
  RankingTable,
  SegmentTabs,
  StatGrid,
  StatTile,
} from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv";
import { fmtKgDisplay } from "@/lib/format-kilo";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { useStatisticsReport } from "@/hooks/useStatistics";
import {
  fetchDeliveriesForExport,
  fetchMovementsForExport,
  fetchOrdersForExport,
  type StatisticsFilters,
  type StatsGranularity,
} from "@/services/statisticsService";

const TOP_N = 5;

function RankingPanel(props: {
  title: string;
  description?: string;
  icon: typeof Package;
  rows: { id: string; label: string; value: string | number }[];
  loading?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = props.icon;
  const visible = props.expanded ? props.rows : props.rows.slice(0, TOP_N);
  return (
    <PanelCard icon={Icon} title={props.title} description={props.description}>
      <RankingTable rows={visible.map((r) => ({ ...r, value: r.value }))} loading={props.loading} />
      {props.rows.length > TOP_N ? (
        <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 text-xs" onClick={props.onToggle}>
          {props.expanded ? "Ver top 5" : `Ver todos (${props.rows.length})`}
        </Button>
      ) : null}
    </PanelCard>
  );
}

export function StatisticsPage() {
  const { user } = useAuth();

  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, []);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [periodPreset, setPeriodPreset] = useState<"today" | "week" | "month" | "custom">("custom");
  const [expandedRankings, setExpandedRankings] = useState<Record<string, boolean>>({});
  const granularity: StatsGranularity = "day";

  const filters: StatisticsFilters = useMemo(() => ({ from, to }), [from, to]);
  const report = useStatisticsReport(filters, granularity);
  const settingsQ = useAppSettingsQuery();
  const currency = settingsQ.data?.currency?.trim() || "USD";

  const seriesPoints = useMemo(() => {
    return (report.data?.series ?? []).map((p) => ({
      label: p.bucket,
      value: p.kilosVendidos,
      value2: p.dinero,
    }));
  }, [report.data?.series]);

  const kilosWeekPoints = useMemo(() => {
    return seriesPoints.slice(-7).map((p) => {
      let label = p.label;
      try {
        label = format(parseISO(p.label), "EEE dd");
      } catch {
        label = p.label;
      }
      return { label, value: p.value };
    });
  }, [seriesPoints]);

  const toggleRanking = (key: string) => {
    setExpandedRankings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
        return { ...o, creado_por: cp?.username ?? "" };
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
        items_resumen: (d.items ?? []).map((i) => `${i.origen_tipo}:${i.cantidad_meta_kilos}`).join(";"),
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

  const applyPreset = (preset: "today" | "week" | "month" | "custom") => {
    setPeriodPreset(preset);
    if (preset === "custom") return;
    const now = new Date();
    if (preset === "today") {
      const d = format(now, "yyyy-MM-dd");
      setFrom(d);
      setTo(d);
      return;
    }
    if (preset === "week") {
      setFrom(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setTo(format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      return;
    }
    setFrom(format(startOfMonth(now), "yyyy-MM-dd"));
    setTo(format(endOfMonth(now), "yyyy-MM-dd"));
  };

  const depositosMov = (report.data?.rankings.depositosPorMovimientos ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    value: r.value,
  }));
  const usuariosEntregas = (report.data?.rankings.usuariosEntregas ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    value: r.value,
  }));
  const usuariosIngresos = (report.data?.rankings.usuariosIngresos ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    value: r.value.toFixed(2),
  }));
  const depositosKg = (report.data?.rankings.depositosPorKgMovidos ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    value: r.value.toFixed(2),
  }));

  return (
    <PageShell>
      <PageHeader
        title="Estadísticas"
        description="Indicadores globales por período. Exportación CSV disponible."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void exportSummary()}>
              <Download className="size-3.5" />
              Resumen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportOrders()}>
              Pedidos
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportDeliveries()}>
              Entregas
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportMovements()}>
              Movimientos
            </Button>
          </div>
        }
      />

      <FilterBar sticky className="rounded-lg border border-subtle bg-surface px-3">
        <SegmentTabs
          value={periodPreset}
          onChange={(v) => applyPreset(v as "today" | "week" | "month" | "custom")}
          options={[
            { value: "today", label: "Hoy" },
            { value: "week", label: "Semana" },
            { value: "month", label: "Mes" },
            { value: "custom", label: "Rango" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap text-muted-foreground">Desde</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPeriodPreset("custom");
            }}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPeriodPreset("custom");
            }}
            className="h-9 w-[150px]"
          />
        </div>
      </FilterBar>

      <StatGrid columns={5}>
        <StatTile
          dense
          icon={TrendingUp}
          label="Kilos vendidos"
          value={fmtKgDisplay(kpis?.kilosVendidos, report.isLoading)}
          unit="kg"
          hint="Suma de ítems de entrega"
          tone="emerald"
        />
        <StatTile
          dense
          icon={Wallet}
          label="Dinero cobrado"
          value={
            report.isLoading
              ? "…"
              : kpis != null
                ? kpis.dineroCobrado.toLocaleString("es-AR", { maximumFractionDigits: 0 })
                : "—"
          }
          unit={currency}
          tone="slate"
        />
        <StatTile
          dense
          icon={Truck}
          label="Pedidos entregados"
          value={report.isLoading ? "…" : String(kpis?.pedidosEntregados ?? "—")}
          unit="pedidos"
          tone="amber"
        />
        <StatTile
          dense
          icon={ArrowDownRight}
          label="Cancelados"
          value={report.isLoading ? "…" : String(kpis?.pedidosCancelados ?? "—")}
          unit="en período"
          tone="rose"
        />
        <StatTile
          dense
          icon={Package}
          label="Pedidos creados"
          value={report.isLoading ? "…" : String(kpis?.pedidosCreados ?? "—")}
          unit="altas"
          tone="slate"
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard icon={BarChart3} title="Serie temporal" description="Kilos vendidos — últimos 7 días.">
          {kilosWeekPoints.length === 0 && !report.isLoading ? (
            <p className="text-sm text-muted-foreground">Sin entregas en el período.</p>
          ) : (
            <MiniBars points={kilosWeekPoints} />
          )}
          {report.isError ? <p className="mt-2 text-xs text-destructive">Error al cargar la serie.</p> : null}
        </PanelCard>

        <PanelCard icon={Wallet} title="Entregas por origen" description="Stock vs producción directa en el período.">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricPair label="Desde stock" value={fmtKgDisplay(kpis?.entregaDesdeStockKg, report.isLoading)} />
            <MetricPair label="Producción directa" value={fmtKgDisplay(kpis?.entregaDesdeProduccionKg, report.isLoading)} />
          </div>
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RankingPanel
          icon={Package}
          title="Depósitos más usados"
          description="Movimientos registrados."
          rows={depositosMov}
          loading={report.isLoading}
          expanded={!!expandedRankings.depositosMov}
          onToggle={() => toggleRanking("depositosMov")}
        />
        <RankingPanel
          icon={Truck}
          title="Usuarios con más entregas"
          description="Entregas en el período."
          rows={usuariosEntregas}
          loading={report.isLoading}
          expanded={!!expandedRankings.usuariosEntregas}
          onToggle={() => toggleRanking("usuariosEntregas")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RankingPanel
          icon={Package}
          title="Ingresos de stock por usuario"
          description="Kg en movimientos tipo ingreso."
          rows={usuariosIngresos}
          loading={report.isLoading}
          expanded={!!expandedRankings.usuariosIngresos}
          onToggle={() => toggleRanking("usuariosIngresos")}
        />
        <RankingPanel
          icon={Truck}
          title="Transferencias por depósito"
          description="Kg movidos (entrada + salida)."
          rows={depositosKg}
          loading={report.isLoading}
          expanded={!!expandedRankings.depositosKg}
          onToggle={() => toggleRanking("depositosKg")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard icon={Package} title="Lotes más antiguos" description="Stock activo por fecha de guardado.">
          <Table bordered>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead>Guardado</TableHead>
                <TableHead className="text-right">Kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.lotesMasAntiguos ?? []).slice(0, expandedRankings.lotes ? undefined : TOP_N).map((r) => (
                <TableRow key={r.batchId}>
                  <TableCell className="max-w-[140px] truncate">{r.depositoNombre}</TableCell>
                  <TableCell className="tabular-nums text-xs text-muted-foreground">{r.fechaGuardado}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.kg.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(report.data?.lotesMasAntiguos?.length ?? 0) > TOP_N ? (
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 text-xs" onClick={() => toggleRanking("lotes")}>
              {expandedRankings.lotes ? "Ver top 5" : "Ver todos"}
            </Button>
          ) : null}
        </PanelCard>

        <PanelCard icon={Package} title="Ocupación de depósitos" description="Kg guardado / capacidad.">
          <Table bordered>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Kg / cap.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.data?.depositosOcupacion ?? []).slice(0, expandedRankings.ocupacion ? undefined : TOP_N).map((r) => (
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
          {(report.data?.depositosOcupacion?.length ?? 0) > TOP_N ? (
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 text-xs" onClick={() => toggleRanking("ocupacion")}>
              {expandedRankings.ocupacion ? "Ver top 5" : "Ver todos"}
            </Button>
          ) : null}
        </PanelCard>
      </div>

      <PanelCard icon={Package} title="Stock en riesgo / vencimiento" description="Según umbrales en configuración.">
        <Table bordered>
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
                  <Badge
                    variant={
                      r.riesgo === "vencido"
                        ? "danger"
                        : r.riesgo === "critico"
                          ? "warning"
                          : r.riesgo === "warning"
                            ? "warning"
                            : "secondary"
                    }
                  >
                    {r.riesgo}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.fechaVencimiento ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.kg.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>
    </PageShell>
  );
}
