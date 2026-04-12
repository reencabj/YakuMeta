import { isToday } from "date-fns";
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
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageShell, PanelCard, StatTile } from "@/components/shell";
import { fmtKgDisplay } from "@/lib/format-kilo";
import { formatIsoSafe, parseIsoSafe } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { BOLSAS_PER_KG_META } from "@/lib/meta-bags";
import { usePedidosKpiQuery } from "@/hooks/useGlobalStockSummary";
import {
  useCancelOrderMutation,
  useDeliveriesTodayCount,
  useLatestDeliveriesByOrderIds,
  useOpenOrdersCoberturaQuery,
  useOrdersQuery,
} from "@/hooks/useOrders";
import type { OrderState } from "@/types/database";
import type { OrderWithCreator } from "@/services/orderService";
import { CobrarOrderDialog } from "./CobrarOrderDialog";
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
import { PartialDeliveryKgControl } from "./PartialDeliveryKgControl";
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
const BOLSAS_POR_TIRADA = 30; // 10 packs x 3 bolsitas

export function OrdersPage() {
  const ordersQ = useOrdersQuery();
  const pedidosKpi = usePedidosKpiQuery();
  const coberturaQ = useOpenOrdersCoberturaQuery();
  const todayQ = useDeliveriesTodayCount();
  const cancelMut = useCancelOrderMutation();

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<OrderState | "all">("all");
  const [soloNoAlcanza, setSoloNoAlcanza] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deliverOrder, setDeliverOrder] = useState<OrderWithCreator | null>(null);
  const [cobrarOrder, setCobrarOrder] = useState<OrderWithCreator | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderWithCreator | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<OrderWithCreator | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [closedVisibleCount, setClosedVisibleCount] = useState(5);

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
  const closedVisible = closedOrders.slice(0, closedVisibleCount);
  const closedVisibleIds = useMemo(() => closedVisible.map((o) => o.id), [closedVisible]);
  const latestClosedDeliveryQ = useLatestDeliveriesByOrderIds(closedVisibleIds);

  useEffect(() => {
    setClosedVisibleCount(5);
  }, [search, estadoFilter, soloNoAlcanza]);

  const showEmptyFilters = !ordersQ.isLoading && !ordersQ.error && filteredBase.length === 0;

  const entregasHoyFallback = useMemo(() => {
    const list = ordersQ.data ?? [];
    return list.filter((o) => {
      if (o.estado !== "entregado") return false;
      const d = parseIsoSafe(o.updated_at);
      return d != null && isToday(d);
    }).length;
  }, [ordersQ.data]);

  const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );
  /** ARS sin espacio entre símbolo y monto (p. ej. `$180.000`). */
  const formatPrecioArs = (n: number) => moneyFmt.format(n).replace(/\$\s+/u, () => "$");
  const faltaNum = Number(pedidosKpi.data?.faltante_preparar_kg ?? 0);
  const faltaPositiva = Number.isFinite(faltaNum) ? Math.max(0, faltaNum) : 0;
  const tiradasNecesarias = Math.ceil((faltaPositiva * BOLSAS_PER_KG_META) / BOLSAS_POR_TIRADA);

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
          label="Tiradas necesarias"
          value={pedidosKpi.isLoading ? "…" : String(tiradasNecesarias)}
          unit="tiradas"
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
                <p className="text-xs text-muted-foreground">
                  Pendientes y en preparación, ordenados por prioridad y fecha de entrega pactada (más próxima primero).
                </p>
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
                    const creadoPorNombre = o.creado_por?.display_name ?? o.creado_por?.username ?? "—";
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
                          <div className="min-w-0 flex-1 pr-1">
                            <div className="flex items-start gap-1.5">
                              <span className="block min-w-0 truncate text-lg font-semibold leading-tight text-foreground">
                                {o.cliente_nombre}
                              </span>
                              <OrderPriorityStars prioridad={o.prioridad} />
                            </div>
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              Creado por: {creadoPorNombre}
                            </span>
                          </div>
                          <div className="flex shrink-0 flex-col items-end text-right">
                            <span className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-4xl">
                              {Number(o.cantidad_meta_kilos).toLocaleString("es-AR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              kg
                            </span>
                          </div>
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
                        <PartialDeliveryKgControl order={o} />
                        <div className="rounded-lg border border-border/45 bg-muted/10 px-2.5 py-1.5">
                          <div className="flex w-full flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5 text-center text-[10px] leading-snug">
                            <span className="text-muted-foreground">Fecha de creación</span>
                            <span className="font-medium tabular-nums text-foreground">
                              {formatIsoSafe(o.fecha_pedido, "dd/MM/yy", { locale: es })}
                            </span>
                            {o.fecha_encargo ? (
                              <>
                                <span className="text-border/60" aria-hidden>
                                  ·
                                </span>
                                <span className="text-muted-foreground">Fecha de entrega pactada</span>
                                <span className="font-medium tabular-nums text-foreground">
                                  {formatIsoSafe(o.fecha_encargo, "dd/MM/yy", { locale: es })}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2 border-t border-border/45 pt-2.5">
                          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-1.5 overflow-x-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-2 [&::-webkit-scrollbar]:hidden">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 shrink-0 px-2 text-xs font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeliverOrder(o);
                              }}
                            >
                              Entregar
                            </Button>
                            {o.cobrado_pre_entrega_at ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled
                                className={cn(
                                  "h-8 shrink-0 border-0 px-2 text-xs font-medium shadow-sm !bg-emerald-600 !text-white hover:!bg-emerald-600",
                                  "disabled:cursor-default disabled:opacity-100"
                                )}
                              >
                                Cobrado
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 shrink-0 px-2 text-xs font-medium"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCobrarOrder(o);
                                }}
                              >
                                Cobrar
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 shrink-0 px-2 text-xs font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailId(o.id);
                              }}
                            >
                              Detalle
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 shrink-0 px-2 text-xs font-medium text-red-500 hover:bg-red-500/10 hover:text-red-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelConfirmOrder(o);
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="m-0 text-[1.0625rem] font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.125rem]">
                              {o.total_sugerido != null ? formatPrecioArs(Number(o.total_sugerido)) : "—"}
                            </p>
                          </div>
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
                    {closedVisible.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-muted/5 px-3 py-2 text-xs transition-colors hover:bg-muted/15"
                      >
                        {(() => {
                          const creadoPor = o.creado_por?.display_name ?? o.creado_por?.username ?? "—";
                          const delivery = latestClosedDeliveryQ.data?.[o.id];
                          const entregadoPor = delivery?.entregado_por_nombre ?? (latestClosedDeliveryQ.isLoading ? "…" : "—");
                          const recibioDinero = delivery?.recibio_dinero_nombre ?? (latestClosedDeliveryQ.isLoading ? "…" : "—");
                          return (
                            <>
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
                          Ped. {formatIsoSafe(o.fecha_pedido, "dd/MM/yy", { locale: es })}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/90" title="Última actualización en sistema">
                          Act. {formatIsoSafe(o.updated_at, "dd/MM/yy HH:mm", { locale: es })}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">Creado por: {creadoPor}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">Entregado por: {entregadoPor}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">Recibió: {recibioDinero}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          onClick={() => setDetailId(o.id)}
                        >
                          Detalle
                        </Button>
                            </>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                </div>
                {closedOrders.length > closedVisible.length ? (
                  <div className="mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setClosedVisibleCount((n) => n + 10)}
                    >
                      Mostrar más
                    </Button>
                  </div>
                ) : null}
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
      <CobrarOrderDialog open={Boolean(cobrarOrder)} onOpenChange={(x) => !x && setCobrarOrder(null)} order={cobrarOrder} />

      <Dialog open={Boolean(cancelConfirmOrder)} onOpenChange={(x) => !x && setCancelConfirmOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar pedido?</DialogTitle>
            <DialogDescription>
              {cancelConfirmOrder
                ? `Se cancelará el pedido «${cancelConfirmOrder.cliente_nombre}». Esta acción no se puede deshacer.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelConfirmOrder(null)}>
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const ord = cancelConfirmOrder;
                setCancelConfirmOrder(null);
                if (ord) {
                  setCancelReason("");
                  setCancelOrder(ord);
                }
              }}
            >
              Sí, continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
