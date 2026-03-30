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
import { EditOrderDialog } from "./EditOrderDialog";
import { NewOrderDialog } from "./NewOrderDialog";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { ACTIVE_ORDER_STATES, estadoBadgeClass, sortOrders } from "./orderUtils";
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
  const prepMut = useUpdateOrderMutation();

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<OrderState | "all">("all");
  const [soloNoAlcanza, setSoloNoAlcanza] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deliverOrder, setDeliverOrder] = useState<OrderWithCreator | null>(null);
  const [editOrder, setEditOrder] = useState<OrderWithCreator | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderWithCreator | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const coberturaMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of coberturaQ.data ?? []) {
      m.set(r.order_id, r.alcanza_fifo);
    }
    return m;
  }, [coberturaQ.data]);

  const filtered = useMemo(() => {
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
    return sortOrders(list);
  }, [ordersQ.data, search, estadoFilter, soloNoAlcanza, coberturaMap]);

  const entregasHoyFallback = useMemo(() => {
    const list = ordersQ.data ?? [];
    return list.filter((o) => o.estado === "entregado" && isToday(parseISO(o.updated_at))).length;
  }, [ordersQ.data]);

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
        description="Búsqueda por cliente, estado y cobertura FIFO."
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
        <div className="space-y-3">
          {ordersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : ordersQ.error ? (
            <p className="text-sm text-red-400">{(ordersQ.error as Error).message}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún pedido con estos filtros.</p>
          ) : (
            filtered.map((o) => {
              const canAct = ACTIVE_ORDER_STATES.includes(o.estado);
              const alcanza = coberturaMap.get(o.id);
              const showCobertura = ACTIVE_ORDER_STATES.includes(o.estado) && alcanza !== undefined;
              return (
                <div
                  key={o.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-4 shadow-sm transition-colors hover:border-primary/30 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold leading-tight">{o.cliente_nombre}</span>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] uppercase",
                          estadoBadgeClass(o.estado)
                        )}
                      >
                        {o.estado.replace(/_/g, " ")}
                      </span>
                      {showCobertura ? (
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[10px]",
                            alcanza
                              ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200"
                              : "border-amber-700/50 bg-amber-950/30 text-amber-200"
                          )}
                        >
                          {alcanza ? "Cubre (FIFO)" : "No alcanza aún"}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-muted-foreground">Pedido </span>
                        <span className="font-mono tabular-nums">{Number(o.cantidad_meta_kilos).toFixed(2)} kg</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground">
                          {Math.round(Number(o.cantidad_meta_kilos) * BOLSAS_PER_KG_META)} bol.
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sugerido </span>
                        <span className="font-mono tabular-nums">
                          {o.total_sugerido != null ? `$${Number(o.total_sugerido).toLocaleString("es-AR")}` : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Pedido {format(parseISO(o.fecha_pedido), "dd/MM/yy", { locale: es })}
                      {o.fecha_encargo
                        ? ` · encargo ${format(parseISO(o.fecha_encargo), "dd/MM/yy", { locale: es })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Button type="button" size="sm" variant="outline" onClick={() => setDetailId(o.id)}>
                      Detalle
                    </Button>
                    {canAct ? (
                      <>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setDeliverOrder(o)}>
                          Entregar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={prepMut.isPending || o.estado === "en_preparacion"}
                          onClick={async () => {
                            await prepMut.mutateAsync({ id: o.id, patch: { estado: "en_preparacion" } });
                          }}
                        >
                          En prep.
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditOrder(o)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-400"
                          onClick={() => setCancelOrder(o)}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PanelCard>

      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />
      <OrderDetailDialog open={Boolean(detailId)} onOpenChange={(x) => !x && setDetailId(null)} orderId={detailId} />
      <DeliverOrderDialog open={Boolean(deliverOrder)} onOpenChange={(x) => !x && setDeliverOrder(null)} order={deliverOrder} />
      <EditOrderDialog open={Boolean(editOrder)} onOpenChange={(x) => !x && setEditOrder(null)} order={editOrder} />

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
