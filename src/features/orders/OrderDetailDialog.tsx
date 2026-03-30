import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrderDetailQuery, useUpdateOrderMutation } from "@/hooks/useOrders";
import { BOLSAS_PER_KG_META } from "@/lib/meta-bags";
import { cn } from "@/lib/utils";
import type { OrderState } from "@/types/database";
import type { OrderWithCreator } from "@/services/orderService";
import { ACTIVE_ORDER_STATES, estadoBadgeClass, normalizaPrioridad, OrderPriorityStars } from "./orderUtils";

const selectClass = cn(
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

const ESTADO_EDITABLE: OrderState[] = ["pendiente", "en_preparacion", "cancelado"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  /** Abre el flujo de entrega (modal aparte). */
  onRequestDeliver?: (order: OrderWithCreator) => void;
  /** Abre cancelación con motivo (modal aparte). */
  onRequestCancel?: (order: OrderWithCreator) => void;
};

export function OrderDetailDialog(props: Props) {
  const q = useOrderDetailQuery(props.orderId, props.open);
  const upd = useUpdateOrderMutation();
  const o = q.data?.order;

  const canEditOps = o ? ACTIVE_ORDER_STATES.includes(o.estado) : false;
  const readOnly = o ? o.estado === "entregado" || o.estado === "cancelado" : false;

  const [cliente, setCliente] = useState("");
  const [kg, setKg] = useState("");
  const [fp, setFp] = useState("");
  const [fe, setFe] = useState("");
  const [notas, setNotas] = useState("");
  const [prioridad, setPrioridad] = useState<string>("0");
  const [estado, setEstado] = useState<OrderState>("pendiente");
  const [ppk, setPpk] = useState("");
  const [total, setTotal] = useState("");

  useEffect(() => {
    if (!o || !props.open) return;
    setCliente(o.cliente_nombre);
    setKg(String(Number(o.cantidad_meta_kilos)));
    setFp(o.fecha_pedido.slice(0, 10));
    setFe(o.fecha_encargo ? o.fecha_encargo.slice(0, 10) : "");
    setNotas(o.notas ?? "");
    setPrioridad(String(normalizaPrioridad(o.prioridad)));
    setEstado(o.estado);
    setPpk(o.precio_sugerido_por_kilo != null ? String(Number(o.precio_sugerido_por_kilo)) : "");
    setTotal(o.total_sugerido != null ? String(Number(o.total_sugerido)) : "");
  }, [o?.id, props.open, o]);

  const save = async () => {
    if (!o || readOnly) return;
    const kgN = Number(kg);
    if (!Number.isFinite(kgN) || kgN <= 0) return;
    const pri = Number(prioridad);
    const prioridadVal = pri <= 0 ? null : pri >= 2 ? 2 : 1;
    const ppkN = ppk.trim() === "" ? null : Number(ppk);
    const totN = total.trim() === "" ? null : Number(total);
    await upd.mutateAsync({
      id: o.id,
      patch: {
        cliente_nombre: cliente.trim(),
        cantidad_meta_kilos: kgN,
        fecha_pedido: fp,
        fecha_encargo: fe.trim() ? fe : null,
        notas: notas.trim() ? notas.trim() : null,
        prioridad: prioridadVal,
        estado,
        precio_sugerido_por_kilo: ppkN != null && Number.isFinite(ppkN) ? ppkN : null,
        total_sugerido: totN != null && Number.isFinite(totN) ? totN : null,
      },
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <span>{o?.cliente_nombre ?? "Pedido"}</span>
            {o ? <OrderPriorityStars prioridad={o.prioridad} /> : null}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{props.orderId}</DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : q.error ? (
          <p className="text-sm text-red-400">{(q.error as Error).message}</p>
        ) : !q.data || !o ? null : (
          <div className="space-y-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-md border px-2 py-0.5 text-xs", estadoBadgeClass(o.estado))}>
                {o.estado.replace(/_/g, " ")}
              </span>
              <span className="text-muted-foreground">
                Pedido {format(parseISO(o.fecha_pedido), "dd/MM/yyyy", { locale: es })}
              </span>
              {o.fecha_encargo ? (
                <span className="text-muted-foreground">
                  · encargo {format(parseISO(o.fecha_encargo), "dd/MM/yyyy", { locale: es })}
                </span>
              ) : null}
            </div>

            {!readOnly ? (
              <section className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edición</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Cliente</Label>
                    <Input value={cliente} onChange={(e) => setCliente(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kg meta</Label>
                    <Input value={kg} onChange={(e) => setKg(e.target.value)} type="number" min={0.0001} step="any" />
                    <p className="text-[10px] text-muted-foreground">
                      ≈ {Math.round(Number(kg) || 0) > 0 ? Math.round(Number(kg) * BOLSAS_PER_KG_META) : "—"} bolsas
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prioridad-detail">Prioridad</Label>
                    <select
                      id="prioridad-detail"
                      className={selectClass}
                      value={prioridad}
                      onChange={(e) => setPrioridad(e.target.value)}
                    >
                      <option value="0">Sin prioridad</option>
                      <option value="1">Prioridad 1</option>
                      <option value="2">Prioridad 2</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Fecha pedido</Label>
                    <Input type="date" value={fp} onChange={(e) => setFp(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fecha encargo</Label>
                    <Input type="date" value={fe} onChange={(e) => setFe(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>$/kg sugerido</Label>
                    <Input value={ppk} onChange={(e) => setPpk(e.target.value)} type="number" step="any" />
                  </div>
                  <div className="space-y-1">
                    <Label>Total sugerido</Label>
                    <Input value={total} onChange={(e) => setTotal(e.target.value)} type="number" step="any" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="estado-detail">Estado</Label>
                    <select
                      id="estado-detail"
                      className={selectClass}
                      value={estado}
                      onChange={(e) => setEstado(e.target.value as OrderState)}
                    >
                      {ESTADO_EDITABLE.map((e) => (
                        <option key={e} value={e}>
                          {e.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground">
                      Para marcar como entregado usá el botón Entregar (registra dinero y lotes).
                    </p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Notas</Label>
                    <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
                  </div>
                </div>
              </section>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Pedido</p>
                  <p className="font-mono tabular-nums">{Number(o.cantidad_meta_kilos).toFixed(4)} kg</p>
                  <p className="text-[10px] text-muted-foreground">
                    ≈ {Math.round(Number(o.cantidad_meta_kilos) * BOLSAS_PER_KG_META)} bolsas
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Prioridad</p>
                  <p className="flex items-center gap-1">
                    {normalizaPrioridad(o.prioridad) === 0 ? "—" : null}
                    <OrderPriorityStars prioridad={o.prioridad} />
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Precio sugerido</p>
                  <p className="font-mono tabular-nums">
                    {o.precio_sugerido_por_kilo != null
                      ? `$${Number(o.precio_sugerido_por_kilo).toLocaleString("es-AR")}/kg`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Total sugerido</p>
                  <p className="font-mono tabular-nums">
                    {o.total_sugerido != null ? `$${Number(o.total_sugerido).toLocaleString("es-AR")}` : "—"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Creado por</p>
                  <p>{o.creado_por?.display_name ?? o.creado_por?.username ?? "—"}</p>
                </div>
                {o.notas ? (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Notas</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{o.notas}</p>
                  </div>
                ) : null}
              </div>
            )}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entregas</h3>
              {q.data.deliveries.length === 0 ? (
                <p className="text-muted-foreground">Sin entregas.</p>
              ) : (
                <ul className="space-y-3">
                  {q.data.deliveries.map((d) => (
                    <li key={d.id} className="rounded-md border border-border/60 bg-muted/15 p-3">
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(d.entregado_at), "dd/MM/yyyy HH:mm", { locale: es })} · $
                        {Number(d.dinero_recibido).toLocaleString("es-AR")} · {d.recibio_dinero_nombre}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Prod. directa: {Number(d.produccion_directa_meta_kilos).toFixed(4)} kg
                      </p>
                      <ul className="mt-2 space-y-1 text-xs">
                        {d.items.map((it) => (
                          <li key={it.id} className="font-mono tabular-nums">
                            {Number(it.cantidad_meta_kilos).toFixed(4)} kg · {it.origen_tipo}
                            {it.stock_batch_id ? ` · ${it.stock_batch_id.slice(0, 8)}…` : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historial (auditoría)</h3>
              <ul className="max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                {q.data.audit.map((a) => (
                  <li key={a.id}>
                    {format(parseISO(a.created_at), "dd/MM/yy HH:mm", { locale: es })} — {a.accion}
                  </li>
                ))}
              </ul>
            </section>

            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {!readOnly && canEditOps ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={upd.isPending || o.estado !== "pendiente"}
                      onClick={() =>
                        void upd.mutateAsync({ id: o.id, patch: { estado: "en_preparacion" } })
                      }
                    >
                      En preparación
                    </Button>
                    <Button type="button" onClick={() => props.onRequestDeliver?.(o)}>
                      Entregar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-400"
                      onClick={() => props.onRequestCancel?.(o)}
                    >
                      Cancelar pedido
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {!readOnly ? (
                  <Button
                    type="button"
                    disabled={upd.isPending || !cliente.trim()}
                    onClick={() => void save()}
                  >
                    Guardar cambios
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                  Cerrar
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
