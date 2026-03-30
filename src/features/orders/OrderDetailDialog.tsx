import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrderDetailQuery } from "@/hooks/useOrders";
import { BOLSAS_PER_KG_META } from "@/lib/meta-bags";
import { cn } from "@/lib/utils";
import { estadoBadgeClass } from "./orderUtils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
};

export function OrderDetailDialog(props: Props) {
  const q = useOrderDetailQuery(props.orderId, props.open);

  const o = q.data?.order;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{o?.cliente_nombre ?? "Pedido"}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{props.orderId}</DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : q.error ? (
          <p className="text-sm text-red-400">{(q.error as Error).message}</p>
        ) : !q.data ? null : (
          <div className="space-y-6 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className={cn("rounded-md border px-2 py-0.5 text-xs", o ? estadoBadgeClass(o.estado) : "")}>
                {o?.estado}
              </span>
              <span className="text-muted-foreground">
                {o ? format(parseISO(o.fecha_pedido), "dd/MM/yyyy", { locale: es }) : ""} pedido
              </span>
              {o?.fecha_encargo ? (
                <span className="text-muted-foreground">
                  · encargo {format(parseISO(o.fecha_encargo), "dd/MM/yyyy", { locale: es })}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Pedido</p>
                <p className="font-mono tabular-nums">{o ? Number(o.cantidad_meta_kilos).toFixed(4) : "—"} kg</p>
                <p className="text-[10px] text-muted-foreground">
                  ≈ {o ? Math.round(Number(o.cantidad_meta_kilos) * BOLSAS_PER_KG_META) : "—"} bolsas
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Precio sugerido</p>
                <p className="font-mono tabular-nums">
                  {o?.precio_sugerido_por_kilo != null
                    ? `$${Number(o.precio_sugerido_por_kilo).toLocaleString("es-AR")}/kg`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Total sugerido</p>
                <p className="font-mono tabular-nums">
                  {o?.total_sugerido != null ? `$${Number(o.total_sugerido).toLocaleString("es-AR")}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Creado por</p>
                <p>{o?.creado_por?.display_name ?? o?.creado_por?.username ?? "—"}</p>
              </div>
            </div>

            {o?.notas ? (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Notas</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{o.notas}</p>
              </div>
            ) : null}

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

            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
