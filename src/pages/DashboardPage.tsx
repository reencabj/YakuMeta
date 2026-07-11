import { PageHeader, PageShell, PanelCard, StatGrid, StatTile } from "@/components/shell";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  ClipboardList,
  Clock3,
  Droplets,
  FlaskConical,
  Layers,
  Package,
  Sparkles,
  Timer,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { useGlobalStockSummary, usePedidosKpiQuery } from "@/hooks/useGlobalStockSummary";
import { fmtKgDisplay } from "@/lib/format-kilo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { lavadoActiveMetrics } from "@/features/lavado/components/LavadoStatsSection";
import { lavadoAlmacenLabel, PROCESS_META } from "@/features/lavado/lavadoConstants";
import { money as lavadoMoneyUsd, num, tandaRemainingSeconds } from "@/features/lavado/lavadoFormatters";
import { formatDuration } from "@/features/lavado/lavadoMath";
import { lavadoQueryKeys } from "@/features/lavado/lavadoQueryKeys";
import { fetchLavadoTandasActivas } from "@/features/lavado/lavadoService";
import { fetchLavadoPedidos, type LavadoPedidoWithUsers } from "@/features/lavado-pedidos/lavadoPedidosService";
import {
  daysDiffFromToday,
  deliveryCountdownLabel,
  money as pedidosMoney,
} from "@/features/lavado-pedidos/lavadoPedidosMath";
import type { LavadoPedidoEstado } from "@/types/database";

const LAVADO_PEDIDOS_ACTIVE: LavadoPedidoEstado[] = [
  "recibido",
  "dinero_recibido",
  "dinero_entregado",
  "en_espera",
  "listo_para_entregar",
];

function pedidoEstadoLabel(value: LavadoPedidoEstado) {
  const labels: Record<LavadoPedidoEstado, string> = {
    recibido: "Recibido",
    dinero_recibido: "Dinero recibido",
    dinero_entregado: "Dinero entregado",
    en_espera: "En espera",
    listo_para_entregar: "Listo",
    completado: "Completado",
    cancelado: "Cancelado",
  };
  return labels[value];
}

function sortActivePedidos(a: LavadoPedidoWithUsers, b: LavadoPedidoWithUsers) {
  const ad = a.fecha_entrega ? daysDiffFromToday(a.fecha_entrega) : 9999;
  const bd = b.fecha_entrega ? daysDiffFromToday(b.fecha_entrega) : 9999;
  return ad - bd || new Date(a.fecha_creacion).getTime() - new Date(b.fecha_creacion).getTime();
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function fmtHalfStep(n: number) {
  const roundedToHalf = Math.round(n * 2) / 2;
  const frac = Math.abs(roundedToHalf - Math.trunc(roundedToHalf));
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: frac === 0.5 ? 2 : 0,
    maximumFractionDigits: frac === 0.5 ? 2 : 0,
  }).format(roundedToHalf);
}

function MetricRow(props: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", props.highlight && "rounded-md bg-primary-soft px-2 -mx-2")}>
      <span className="text-[13px] text-muted-foreground">{props.label}</span>
      <div className="text-right">
        <span className="text-sm font-medium tabular-nums text-foreground">{props.value}</span>
        {props.sub ? <p className="text-[11px] text-tertiary">{props.sub}</p> : null}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const stock = useGlobalStockSummary();
  const pedidosKpi = usePedidosKpiQuery();
  const settingsQ = useAppSettingsQuery();
  const [nowTick, setNowTick] = useState(Date.now());

  const capQ = useQuery({
    queryKey: ["storage-capacidad-total-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("capacidad_guardado_kg")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).reduce((acc, r) => acc + Number(r.capacidad_guardado_kg ?? 0), 0);
    },
  });

  const lavadoTandasQ = useQuery({
    queryKey: lavadoQueryKeys.tandasActivas,
    queryFn: fetchLavadoTandasActivas,
    refetchInterval: 15_000,
  });

  const lavadoPedidosQ = useQuery({
    queryKey: ["lavado-pedidos"],
    queryFn: fetchLavadoPedidos,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = stock.data?.total_meta_kilos ?? 0;
  const kgPesoPorKgMeta = Number(settingsQ.data?.kg_guardado_por_1kg_meta ?? 120);
  const capacidadTotalPeso = capQ.data ?? 0;
  const capacidadTotalMetaRaw = kgPesoPorKgMeta > 0 ? capacidadTotalPeso / kgPesoPorKgMeta : 0;
  const capacidadTotalMeta = Math.max(0, Math.floor(capacidadTotalMetaRaw));
  const ocupacionPct = capacidadTotalMeta > 0 ? Math.min(100, (total / capacidadTotalMeta) * 100) : 0;

  const pedidosCount = pedidosKpi.data?.pedidos_abiertos_count;
  const pedidosKg = pedidosKpi.data?.total_pedidos_abiertos_kg;
  const stockKpi = pedidosKpi.data?.total_stock_disponible_kg;
  const falta = pedidosKpi.data?.faltante_preparar_kg;
  const tiradasNecesarias = pedidosKpi.data?.tiradas_faltantes;

  const loading = stock.isLoading || pedidosKpi.isLoading;
  const capLoading = capQ.isLoading;

  const lavadoActive = lavadoTandasQ.data ?? [];
  const lavadoMetrics = useMemo(() => lavadoActiveMetrics(lavadoActive), [lavadoActive]);
  const nextTanda = lavadoMetrics.sorted[0] ?? null;
  const nextTandaRemaining = nextTanda ? tandaRemainingSeconds(nextTanda.finaliza_estimado_at, nowTick) : 0;

  const lavadoPedidos = lavadoPedidosQ.data ?? [];
  const pedidosLavadoActive = useMemo(
    () => lavadoPedidos.filter((p) => LAVADO_PEDIDOS_ACTIVE.includes(p.estado)).sort(sortActivePedidos),
    [lavadoPedidos, nowTick]
  );

  const pedidosLavadoSummary = useMemo(() => {
    const sevenDue = pedidosLavadoActive.filter(
      (p) => p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null && daysDiffFromToday(p.fecha_entrega) <= 0
    ).length;
    const nextDelivery = pedidosLavadoActive.find(
      (p) => p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null
    );
    return {
      activos: pedidosLavadoActive.length,
      dineroPorEntregar: pedidosLavadoActive.reduce((s, p) => s + Number(p.monto_entregar), 0),
      proximaEntrega: nextDelivery
        ? deliveryCountdownLabel(nextDelivery.tipo_pago, nextDelivery.fecha_entrega)
        : "—",
      hoyVencidos: sevenDue,
    };
  }, [pedidosLavadoActive, nowTick]);

  const lavadoLoading = lavadoTandasQ.isLoading;
  const pedidosLavadoLoading = lavadoPedidosQ.isLoading;

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Resumen operativo de stock, pedidos meta y finanzas de lavado."
        actions={
          <>
            <Button asChild variant="default" size="sm">
              <Link to="/pedidos">
                Pedidos
                <ArrowRight className="size-3.5 opacity-80" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/stock">
                Stock
                <ArrowRight className="size-3.5 opacity-80" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/lavado">
                Lavado
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/lavado-pedidos">
                Pedidos Lavado
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
          </>
        }
      />

      <StatGrid columns={4}>
        <StatTile
          icon={Layers}
          label="Stock total"
          value={fmtKgDisplay(stock.data?.total_meta_kilos, stock.isLoading)}
          unit="kg meta"
          hint="Todo lo guardado en depósitos"
          tone="slate"
        />
        <StatTile
          icon={ClipboardList}
          label="Pedidos activos"
          value={fmtKgDisplay(pedidosKg, pedidosKpi.isLoading)}
          unit="kg"
          hint={
            pedidosCount != null && !pedidosKpi.isLoading
              ? `${pedidosCount} pedido${pedidosCount === 1 ? "" : "s"} sin entregar`
              : "Pendientes + en preparación"
          }
          tone="amber"
        />
        <StatTile
          icon={Package}
          label="Tiradas necesarias"
          value={
            pedidosKpi.isLoading ? "…" : tiradasNecesarias != null ? String(tiradasNecesarias) : "—"
          }
          unit="tiradas"
          hint="Estimado para cubrir falta preparar"
          tone="emerald"
        />
        <StatTile
          icon={AlertTriangle}
          label="Falta preparar"
          value={fmtKgDisplay(falta, pedidosKpi.isLoading)}
          unit="kg"
          hint="Máx(0, pedidos − libre)"
          tone="rose"
          emphasize
        />
      </StatGrid>

      <section className="grid gap-4 lg:grid-cols-2">
        <PanelCard icon={Package} title="Cobertura de stock" description="Ocupación del almacenamiento total de depósitos activos.">
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Capacidad total</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {capLoading || settingsQ.isLoading ? "…" : fmtInt(capacidadTotalMeta)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">kg meta</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Ocupación</p>
                <p className="mt-1 text-lg font-medium tabular-nums">{ocupacionPct.toFixed(0)}%</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                {capacidadTotalMeta > 0 ? (
                  <div className="h-full bg-primary transition-all" style={{ width: `${ocupacionPct}%` }} />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Ocupado{" "}
                  <strong className="tabular-nums text-foreground">
                    {stock.isLoading ? "…" : fmtHalfStep(total)}
                  </strong>{" "}
                  kg
                </span>
                <span>
                  Disponible{" "}
                  <strong className="tabular-nums text-foreground">
                    {capLoading || stock.isLoading || settingsQ.isLoading
                      ? "…"
                      : fmtHalfStep(capacidadTotalMetaRaw - total)}
                  </strong>{" "}
                  kg
                </span>
              </div>
            </div>

            <p className="text-[11px] text-tertiary">
              1 kg meta = {kgPesoPorKgMeta} kg peso (configuración global).
            </p>
          </div>
        </PanelCard>

        <PanelCard icon={Sparkles} title="Pedidos y cobertura" description="Comparación con stock libre global.">
          <div className="divide-y divide-subtle">
            <MetricRow
              label="Pedidos activos"
              value={loading ? "…" : String(pedidosCount ?? "—")}
              sub="comandas en curso"
            />
            <MetricRow
              label="Kg pedidos"
              value={fmtKgDisplay(pedidosKg, pedidosKpi.isLoading)}
              sub="kg meta solicitados"
            />
            <MetricRow
              label="Stock libre"
              value={`${fmtKgDisplay(stockKpi, pedidosKpi.isLoading)} kg`}
              sub="mismo criterio KPI"
            />
            <MetricRow
              label="Falta preparar"
              value={`${fmtKgDisplay(falta, pedidosKpi.isLoading)} kg`}
              highlight={Number(falta) > 0.001}
            />
          </div>
          <p className="mt-3 text-[11px] text-tertiary">
            Si falta preparar es 0, el stock libre alcanza o supera lo pedido en conjunto.
          </p>
        </PanelCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          icon={Droplets}
          title="Lavado ahora"
          description="Solo tandas activas en este momento."
          headerExtra={
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
              <Link to="/lavado">
                Ver lavado
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
          }
        >
          {lavadoActive.length === 0 && !lavadoLoading ? (
            <p className="text-sm text-muted-foreground">Sin tandas activas en este momento.</p>
          ) : (
            <>
              <StatGrid columns={4} className="mb-4">
                <StatTile
                  dense
                  icon={Timer}
                  label="Tandas activas"
                  value={lavadoLoading ? "…" : String(lavadoActive.length)}
                  unit="tandas"
                  tone="slate"
                />
                <StatTile
                  dense
                  icon={Droplets}
                  label="En impresión"
                  value={lavadoLoading ? "…" : lavadoMoneyUsd(lavadoMetrics.totalInProcess)}
                  unit="USD"
                  tone="amber"
                />
                <StatTile
                  dense
                  icon={FlaskConical}
                  label="En secado (est.)"
                  value={lavadoLoading ? "…" : lavadoMoneyUsd(lavadoMetrics.totalOutEstimated)}
                  unit="USD"
                  tone="emerald"
                />
                <StatTile
                  dense
                  icon={Clock3}
                  label="Próxima finalización"
                  value={lavadoLoading ? "…" : nextTanda ? formatDuration(nextTandaRemaining) : "—"}
                  unit=""
                  tone="rose"
                />
              </StatGrid>

              {lavadoActive.length > 0 ? (
                <ul className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
                  {lavadoMetrics.sorted.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{lavadoAlmacenLabel(t.almacen)}</p>
                        <p className="text-muted-foreground">
                          {PROCESS_META[t.proceso].label} · E{t.estacion} · ${lavadoMoneyUsd(num(t.monto_entrada))}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatDuration(tandaRemainingSeconds(t.finaliza_estimado_at, nowTick))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </PanelCard>

        <PanelCard
          icon={Banknote}
          title="Pedidos Lavado ahora"
          description="Solo pedidos abiertos y entregas pendientes."
          headerExtra={
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
              <Link to="/lavado-pedidos">
                Ver pedidos
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
          }
        >
          {pedidosLavadoActive.length === 0 && !pedidosLavadoLoading ? (
            <p className="text-sm text-muted-foreground">Sin pedidos de lavado activos.</p>
          ) : (
            <>
              <StatGrid columns={4} className="mb-4">
                <StatTile
                  dense
                  icon={WalletCards}
                  label="Activos"
                  value={pedidosLavadoLoading ? "…" : String(pedidosLavadoSummary.activos)}
                  unit="pedidos"
                  tone="slate"
                />
                <StatTile
                  dense
                  icon={Banknote}
                  label="Por entregar"
                  value={pedidosLavadoLoading ? "…" : pedidosMoney(pedidosLavadoSummary.dineroPorEntregar)}
                  unit=""
                  tone="amber"
                />
                <StatTile
                  dense
                  icon={CalendarClock}
                  label="Próxima entrega"
                  value={pedidosLavadoLoading ? "…" : pedidosLavadoSummary.proximaEntrega}
                  unit=""
                  tone="slate"
                />
                <StatTile
                  dense
                  icon={Timer}
                  label="Hoy / vencidos"
                  value={pedidosLavadoLoading ? "…" : String(pedidosLavadoSummary.hoyVencidos)}
                  unit="pedidos"
                  tone={pedidosLavadoSummary.hoyVencidos > 0 ? "rose" : "slate"}
                  emphasize={pedidosLavadoSummary.hoyVencidos > 0}
                />
              </StatGrid>

              {pedidosLavadoActive.length > 0 ? (
                <ul className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
                  {pedidosLavadoActive.map((p) => {
                    const dueSoon =
                      p.tipo_pago === "plazo_7_dias" &&
                      p.fecha_entrega != null &&
                      daysDiffFromToday(p.fecha_entrega) <= 0;
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{p.org_persona}</p>
                          <p className="text-muted-foreground">
                            {pedidosMoney(Number(p.monto_entregar))} ·{" "}
                            {deliveryCountdownLabel(p.tipo_pago, p.fecha_entrega)}
                          </p>
                        </div>
                        <Badge variant={dueSoon ? "warning" : "secondary"} className="shrink-0 text-[10px]">
                          {pedidoEstadoLabel(p.estado)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          )}
        </PanelCard>
      </section>
    </PageShell>
  );
}
