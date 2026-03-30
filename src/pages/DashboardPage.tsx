import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Layers,
  Package,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell, PanelCard, StatTile } from "@/components/shell";
import { useGlobalStockSummary, usePedidosKpiQuery } from "@/hooks/useGlobalStockSummary";
import { fmtKgDisplay } from "@/lib/format-kilo";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const stock = useGlobalStockSummary();
  const pedidosKpi = usePedidosKpiQuery();

  const total = stock.data?.total_meta_kilos ?? 0;
  const reservado = stock.data?.total_reservado_kilos ?? 0;
  const libre = stock.data?.total_libre_kilos ?? 0;
  const librePct = total > 0 ? Math.min(100, (libre / total) * 100) : 0;
  const reservPct = total > 0 ? Math.min(100, (reservado / total) * 100) : 0;

  const pedidosCount = pedidosKpi.data?.pedidos_abiertos_count;
  const pedidosKg = pedidosKpi.data?.total_pedidos_abiertos_kg;
  const stockKpi = pedidosKpi.data?.total_stock_disponible_kg;
  const falta = pedidosKpi.data?.faltante_preparar_kg;

  const loading = stock.isLoading || pedidosKpi.isLoading;

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Vista general de stock y pedidos abiertos. Los mismos totales aparecen arriba en la barra para consulta rápida."
        actions={
          <>
            <Button asChild variant="default" size="sm" className="gap-1.5">
              <Link to="/pedidos">
                Pedidos
                <ArrowRight className="size-3.5 opacity-80" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="gap-1.5">
              <Link to="/stock">
                Stock
                <ArrowRight className="size-3.5 opacity-80" />
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Layers}
          label="Meta total en stock"
          value={fmtKgDisplay(stock.data?.total_meta_kilos, stock.isLoading)}
          unit="kg meta"
          hint="Todo lo guardado en depósitos"
          tone="slate"
        />
        <StatTile
          icon={ClipboardList}
          label="Kg en pedidos abiertos"
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
          label="Stock libre"
          value={fmtKgDisplay(stock.data?.total_libre_kilos, stock.isLoading)}
          unit="kg meta"
          hint="Disponible para asignar"
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
      </section>

      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <PanelCard
          className="min-h-[280px]"
          icon={Package}
          title="Stock global"
          description="Distribución de meta entre depósitos (reservado vs libre)."
        >
          <div className="flex flex-1 flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight">
                  {fmtKgDisplay(total, stock.isLoading)}{" "}
                  <span className="text-base font-normal text-muted-foreground">kg</span>
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                  {total > 0 ? (
                    <>
                      <div
                        className="h-full bg-amber-500/80 transition-all"
                        style={{ width: `${reservPct}%` }}
                        title={`Reservado ${reservPct.toFixed(0)}%`}
                      />
                      <div
                        className="h-full bg-emerald-500/85 transition-all"
                        style={{ width: `${librePct}%` }}
                        title={`Libre ${librePct.toFixed(0)}%`}
                      />
                    </>
                  ) : (
                    <div className="h-full w-full bg-muted-foreground/20" />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-amber-500/80" />
                    Reservado (lotes){" "}
                    <strong className="tabular-nums text-foreground">{fmtKgDisplay(reservado, stock.isLoading)}</strong> kg
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500/85" />
                    Libre{" "}
                    <strong className="tabular-nums text-foreground">{fmtKgDisplay(libre, stock.isLoading)}</strong> kg
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              El reservado refiere cantidad amarrada a lotes; el pedido ya no usa reservas manuales por comanda.
            </p>
          </div>
        </PanelCard>

        <PanelCard
          className="min-h-[280px]"
          icon={Sparkles}
          title="Pedidos y cobertura"
          description="Comparación con el stock libre global (sin reservas por pedido)."
        >
          <div className="flex flex-1 flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pedidos activos</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {loading ? "…" : pedidosCount ?? "—"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">comandas en curso</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kg pedidos</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                  {fmtKgDisplay(pedidosKg, pedidosKpi.isLoading)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">kg meta solicitados</p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/25 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stock libre (mismo criterio KPI)</span>
                <span className="font-mono tabular-nums font-medium">{fmtKgDisplay(stockKpi, pedidosKpi.isLoading)} kg</span>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-3",
                  Number(falta) > 0.001
                    ? "border-red-900/50 bg-red-950/25"
                    : "border-emerald-900/40 bg-emerald-950/20"
                )}
              >
                <span className="text-sm font-medium text-foreground">Falta preparar</span>
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {fmtKgDisplay(falta, pedidosKpi.isLoading)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">kg</span>
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Si falta preparar es 0, el stock libre alcanza o supera lo pedido en conjunto.
              </p>
            </div>
          </div>
        </PanelCard>
      </section>
    </PageShell>
  );
}
