import { format, isToday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Filter,
  Package,
  Scale,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageShell, PanelCard, StatTile } from "@/components/shell";
import { fmtKgDisplay } from "@/lib/format-kilo";
import { cn } from "@/lib/utils";
import { BOLSAS_PER_KG_META } from "@/lib/meta-bags";
import { usePedidosKpiQuery } from "@/hooks/useGlobalStockSummary";
import {
  useCancelOrderMutation,
  useDeliveriesTodayCount,
  useOpenOrdersCoberturaQuery,
  useOrdersQuery,
  useUpdateOrderMutation,
} from "@/hooks/useOrders";
import type { OrderState } from "@/types/database";
import type { OrderWithCreator } from "@/services/orderService";
import { DeliverOrderDialog } from "./DeliverOrderDialog";
import { NewOrderDialog } from "./NewOrderDialog";
import { OrderDetailDialog } from "./OrderDetailDialog";
import {
  ACTIVE_ORDER_STATES,
  CLOSED_ORDER_STATES,
  estadoBadgeClass,
  normalizaPrioridad,
  OrderPriorityStars,
  sortActiveOrders,
  sortClosedOrders,
} from "./orderUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const ESTADOS: (OrderState | "all")[] = ["all", "pendiente", "en_preparacion", "entregado", "cancelado"];

export function OrdersPage() {
  const ordersQ = useOrdersQuery();
  const pedidosKpi = usePedidosKpiQuery();
  const coberturaQ = useOpenOrdersCoberturaQuery();
  const todayQ = useDeliveriesTodayCount();
  const cancelMut = useCancelOrderMutation();
  const updateMut = useUpdateOrderMutation();

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<OrderState | "all">("all");
  const [soloNoAlcanza, setSoloNoAlcanza] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deliverOrder, setDeliverOrder] = useState<OrderWithCreator | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderWithCreator | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const coberturaMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of coberturaQ.data ?? []) {
      m.set(r.order_id, r.alcanza_fifo);
    }
    return m;
  }, [coberturaQ.data]);

  const filteredBase = useMemo(() => {
    let list = ordersQ.data ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => o.cliente_nombre.toLowerCase().includes(q));
    }
    if (estadoFilter !== "all") {
      list = list.filter((o) => o.estado === estadoFilter);
    }
    if (soloNoAlcanza) {
      list = list.filter((o) => coberturaMap.get(o.id) === false);
    }
    return list;
  }, [ordersQ.data, search, estadoFilter, soloNoAlcanza, coberturaMap]);

  const activeOrders = useMemo(() => {
    const act = filteredBase.filter((o) => ACTIVE_ORDER_STATES.includes(o.estado));
    return sortActiveOrders(act);
  }, [filteredBase]);

  const closedOrders = useMemo(() => {
    const cls = filteredBase.filter((o) => CLOSED_ORDER_STATES.includes(o.estado));
    return sortClosedOrders(cls);
  }, [filteredBase]);

  const showEmptyFilters = !ordersQ.isLoading && !ordersQ.error && filteredBase.length === 0;

  const entregasHoyFallback = useMemo(() => {
    const list = ordersQ.data ?? [];
    return list.filter((o) => o.estado === "entregado" && isToday(parseISO(o.updated_at))).length;
  }, [ordersQ.data]);

  const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 2,
      }),
    []
  );

  return (
    <PageShell>
      <PageHeader
        title="Pedidos"
        description="Cola de comandas: stock global vs pedidos abiertos; entregar con dinero y trazabilidad por depósito."
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Link to="/">
                Dashboard
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Link to="/stock">
                Stock
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
            <Button type="button" onClick={() => setNewOpen(true)}>
              Nuevo pedido
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          dense
          icon={ClipboardList}
          label="Pedidos en curso"
          value={pedidosKpi.isLoading ? "…" : pedidosKpi.data?.pedidos_abiertos_count != null ? String(pedidosKpi.data.pedidos_abiertos_count) : "—"}
          unit="pedidos"
          tone="amber"
        />
        <StatTile
          dense
          icon={Scale}
          label="Kg pedidos abiertos"
          value={fmtKgDisplay(pedidosKpi.data?.total_pedidos_abiertos_kg, pedidosKpi.isLoading)}
          unit="kg meta"
          tone="slate"
        />
        <StatTile
          dense
          icon={Package}
          label="Stock libre"
          value={fmtKgDisplay(pedidosKpi.data?.total_stock_disponible_kg, pedidosKpi.isLoading)}
          unit="kg meta"
          tone="emerald"
        />
        <StatTile
          dense
          icon={AlertTriangle}
          label="Falta preparar"
          value={fmtKgDisplay(pedidosKpi.data?.faltante_preparar_kg, pedidosKpi.isLoading)}
          unit="kg meta"
          tone="rose"
          emphasize
        />
        <StatTile
          dense
          icon={CalendarCheck}
          label="Entregas hoy"
          value={todayQ.isLoading ? "…" : String(todayQ.data ?? entregasHoyFallback)}
          unit="entregas"
          tone="slate"
        />
      </section>

      <PanelCard
        icon={Filter}
        title="Comandas"
        description="Activos arriba (tarjetas y prioridad). Cerrados abajo (lista compacta). La búsqueda y los filtros aplican a ambos bloques."
      >
        <div className="mb-5 flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-lg border border-border/60 bg-background/50 px-2 text-sm"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value as OrderState | "all")}
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e === "all" ? "Todos los estados" : e.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloNoAlcanza} onChange={(e) => setSoloNoAlcanza(e.target.checked)} />
            Sin cobertura FIFO
          </label>
        </div>

        {ordersQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : ordersQ.error ? (
          <p className="text-sm text-red-400">{(ordersQ.error as Error).message}</p>
        ) : showEmptyFilters ? (
          <p className="text-sm text-muted-foreground">Ningún pedido con estos filtros.</p>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-foreground">Pedidos activos</h3>
                <p className="text-xs text-muted-foreground">Pendientes y en preparación, ordenados por prioridad y antigüedad.</p>
              </div>
              {activeOrders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
                  Sin pedidos activos con estos filtros.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {activeOrders.map((o) => {
                    const alcanza = coberturaMap.get(o.id);
                    const showCobertura = alcanza !== undefined;
                    const pri = normalizaPrioridad(o.prioridad);
                    const isPreparing = o.estado === "en_preparacion";
                    const isPending = o.estado === "pendiente";
                    return (
                      <div
                        key={o.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailId(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailId(o.id);
                          }
                        }}
                        className={cn(
                          "flex w-full flex-col gap-2 rounded-xl border border-border/80 bg-card/50 p-3 text-left shadow-sm transition-colors",
                          "hover:border-primary/35 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          pri >= 1 && "border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.22)]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold leading-tight text-foreground">
                            {o.cliente_nombre}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <OrderPriorityStars prioridad={o.prioridad} />
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-[9px] uppercase",
                              estadoBadgeClass(o.estado)
                            )}
                          >
                            {o.estado.replace(/_/g, " ")}
                          </span>
                          {showCobertura && alcanza === false ? (
                            <span className="rounded-md border border-primary/45 bg-primary/18 px-1.5 py-0.5 text-[9px] text-foreground">
                              FIFO
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          <span className="font-mono text-foreground">{Number(o.cantidad_meta_kilos).toFixed(2)} kg</span>
                          <span> · </span>
                          <span>{Math.round(Number(o.cantidad_meta_kilos) * BOLSAS_PER_KG_META)} bol.</span>
                        </div>
                        <div className="text-xs tabular-nums">
                          <span className="text-muted-foreground">Cobrar: </span>
                          <span className="font-semibold text-foreground">
                            {o.total_sugerido != null ? moneyFmt.format(Number(o.total_sugerido)) : "—"}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {format(parseISO(o.fecha_pedido), "dd/MM/yy", { locale: es })}
                          {o.fecha_encargo
                            ? ` · enc. ${format(parseISO(o.fecha_encargo), "dd/MM/yy", { locale: es })}`
                            : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isPending || isPreparing ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={isPreparing ? "secondary" : "outline"}
                              className="h-7 px-2 text-[11px]"
                              disabled={updateMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                void updateMut.mutateAsync({
                                  id: o.id,
                                  patch: { estado: isPreparing ? "pendiente" : "en_preparacion" },
                                });
                              }}
                            >
                              {isPreparing ? "Pasar a pendiente" : "Pasar a preparación"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeliverOrder(o);
                            }}
                          >
                            Entregar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailId(o.id);
                            }}
                          >
                            Detalle
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {closedOrders.length > 0 ? (
              <section className="border-t border-border/60 pt-6">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Pedidos cerrados</h3>
                  <p className="text-xs text-muted-foreground">Entregados y cancelados; orden por última actualización.</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <ul className="divide-y divide-border/50">
                    {closedOrders.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-muted/5 px-3 py-2 text-xs transition-colors hover:bg-muted/15"
                      >
                        <button
                          type="button"
                          onClick={() => setDetailId(o.id)}
                          className="min-w-0 flex-1 truncate text-left font-medium text-foreground hover:underline"
                        >
                          {o.cliente_nombre}
                        </button>
                        <span
                          className={cn(
                            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase",
                            estadoBadgeClass(o.estado)
                          )}
                        >
                          {o.estado.replace(/_/g, " ")}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          <span className="font-mono text-foreground">{Number(o.cantidad_meta_kilos).toFixed(2)} kg</span>
                          <span className="mx-1 text-border">·</span>
                          {Math.round(Number(o.cantidad_meta_kilos) * BOLSAS_PER_KG_META)} bol.
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          Ped. {format(parseISO(o.fecha_pedido), "dd/MM/yy", { locale: es })}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/90" title="Última actualización en sistema">
                          Act. {format(parseISO(o.updated_at), "dd/MM/yy HH:mm", { locale: es })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          onClick={() => setDetailId(o.id)}
                        >
                          Detalle
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </PanelCard>

      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />
      <OrderDetailDialog
        open={Boolean(detailId)}
        onOpenChange={(x) => !x && setDetailId(null)}
        orderId={detailId}
        onRequestDeliver={(ord) => setDeliverOrder(ord)}
        onRequestCancel={(ord) => {
          setCancelOrder(ord);
          setDetailId(null);
        }}
      />
      <DeliverOrderDialog open={Boolean(deliverOrder)} onOpenChange={(x) => !x && setDeliverOrder(null)} order={deliverOrder} />

      <Dialog open={Boolean(cancelOrder)} onOpenChange={(x) => !x && setCancelOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>Motivo opcional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOrder(null)}>
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!cancelOrder || cancelMut.isPending}
              onClick={async () => {
                if (!cancelOrder) return;
                await cancelMut.mutateAsync({ orderId: cancelOrder.id, reason: cancelReason.trim() || null });
                setCancelOrder(null);
                setCancelReason("");
              }}
            >
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
