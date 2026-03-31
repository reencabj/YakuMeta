import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
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
import { useDeliverOrderMutation } from "@/hooks/useOrders";
import { useDepositsData } from "@/hooks/useDeposits";
import { useStockBatchesQuery } from "@/hooks/useStockBatches";
import { buildDeliverItemsFromLines, type DeliveryLineDraft } from "@/lib/delivery-allocation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { OrderWithCreator } from "@/services/orderService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithCreator | null;
};

type LineRow = {
  id: string;
  mode: "deposit" | "pd";
  /** Solo modo deposit: varios depósitos en la misma línea */
  depositoIds: string[];
  kg: string;
};

function newLine(mode: LineRow["mode"]): LineRow {
  return { id: crypto.randomUUID(), mode, depositoIds: [], kg: "" };
}

export function DeliverOrderDialog(props: Props) {
  const o = props.order;
  const { user } = useAuth();
  const deliverMut = useDeliverOrderMutation();
  const batchesQ = useStockBatchesQuery();
  const { rows: deposits } = useDepositsData();

  const profilesQ = useQuery({
    queryKey: ["profiles", "active", "deliver-order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("is_active", true)
        .order("username");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const [recibioUsuarioId, setRecibioUsuarioId] = useState("");
  const [monto, setMonto] = useState("");
  const [entregaAt, setEntregaAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [notas, setNotas] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [allocError, setAllocError] = useState<string | null>(null);

  const depositsConStock = useMemo(() => {
    const list = (deposits ?? []).filter((d) => d.is_active && d.libre_meta_kg > 0);
    return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [deposits]);

  useEffect(() => {
    if (!props.open || !o) return;
    const kg = Number(o.cantidad_meta_kilos);
    setLines([{ id: "init", mode: "pd", depositoIds: [], kg: String(kg) }]);
    setAllocError(null);
    setRecibioUsuarioId(user?.id ?? "");
    setMonto(o.total_sugerido != null ? String(o.total_sugerido) : "");
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setEntregaAt(d.toISOString().slice(0, 16));
    setNotas("");
  }, [props.open, o?.id, o?.cantidad_meta_kilos, o?.total_sugerido, user?.id]);

  const orderKg = o ? Number(o.cantidad_meta_kilos) : 0;

  const sumKg = useMemo(() => {
    let s = 0;
    for (const L of lines) {
      const n = Number(L.kg.replace(",", "."));
      if (Number.isFinite(n)) s += n;
    }
    return s;
  }, [lines]);

  const sumOk = o && Math.abs(sumKg - orderKg) < 0.001;

  function toggleDeposit(lineIdx: number, depId: string, checked: boolean) {
    setLines((prev) => {
      const n = [...prev];
      const row = { ...n[lineIdx] };
      const set = new Set(row.depositoIds);
      if (checked) set.add(depId);
      else set.delete(depId);
      row.depositoIds = [...set];
      n[lineIdx] = row;
      return n;
    });
    setAllocError(null);
  }

  function toDrafts(): DeliveryLineDraft[] | null {
    const out: DeliveryLineDraft[] = [];
    for (const L of lines) {
      const kg = Number(L.kg.replace(",", "."));
      if (!Number.isFinite(kg) || kg <= 0) return null;
      if (L.mode === "deposit") {
        if (L.depositoIds.length === 0) return null;
        out.push({ kind: "deposit_multi", depositoIds: L.depositoIds, kg });
      } else {
        out.push({ kind: "produccion_directa", kg });
      }
    }
    return out;
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Entregar pedido</DialogTitle>
          <DialogDescription>
            {o
              ? `${o.cliente_nombre} · ${orderKg.toFixed(2)} kg meta. En stock podés marcar varios depósitos a la vez; el
              sistema descuenta FIFO (lotes) y entre depósitos en orden A→Z por nombre.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {!sumOk && lines.length > 0 ? (
          <p className="text-sm text-primary">
            Suma de líneas {sumKg.toFixed(2)} kg — debe coincidir con el pedido ({orderKg.toFixed(2)} kg).
          </p>
        ) : null}
        {allocError ? <p className="text-sm text-red-400">{allocError}</p> : null}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dv-recibio-user">Quién recibió el dinero</Label>
            <select
              id="dv-recibio-user"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              )}
              value={recibioUsuarioId}
              onChange={(e) => setRecibioUsuarioId(e.target.value)}
              required
            >
              <option value="">Elegí un usuario…</option>
              {(profilesQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name?.trim() ? p.display_name : p.username}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">Solo usuarios dados de alta en el sistema.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dv-monto">Monto recibido</Label>
            <Input id="dv-monto" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dv-fecha">Fecha y hora de entrega</Label>
            <Input id="dv-fecha" type="datetime-local" value={entregaAt} onChange={(e) => setEntregaAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dv-notas">Observaciones</Label>
            <Textarea id="dv-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Origen de salida</p>
            {lines.map((row, idx) => (
              <div key={row.id} className="rounded-md border border-border/70 bg-muted/20 p-2 text-sm space-y-2">
                <div className="flex flex-wrap gap-2 items-end">
                  <select
                    className={cn("h-9 flex-1 min-w-[160px] rounded-md border border-input bg-card px-2 text-sm")}
                    value={row.mode}
                    onChange={(e) => {
                      const mode = e.target.value as "deposit" | "pd";
                      setLines((prev) => {
                        const n = [...prev];
                        n[idx] = {
                          ...n[idx],
                          mode,
                          depositoIds: mode === "deposit" ? n[idx].depositoIds : [],
                          kg: n[idx].kg,
                        };
                        return n;
                      });
                      setAllocError(null);
                    }}
                  >
                    <option value="deposit">Stock (depósitos)</option>
                    <option value="pd">Producción directa</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px] text-muted-foreground sr-only">Kg</Label>
                    <Input
                      className="w-28 font-mono"
                      type="text"
                      inputMode="decimal"
                      placeholder="kg"
                      value={row.kg}
                      onChange={(e) => {
                        const n = [...lines];
                        n[idx] = { ...n[idx], kg: e.target.value };
                        setLines(n);
                        setAllocError(null);
                      }}
                    />
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                    Quitar
                  </Button>
                </div>
                {row.mode === "deposit" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!depositsConStock.length}
                        onClick={() => {
                          setLines((prev) => {
                            const n = [...prev];
                            n[idx] = {
                              ...n[idx],
                              depositoIds: depositsConStock.map((d) => d.id),
                            };
                            return n;
                          });
                          setAllocError(null);
                        }}
                      >
                        Marcar todos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setLines((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], depositoIds: [] };
                            return n;
                          });
                          setAllocError(null);
                        }}
                      >
                        Limpiar
                      </Button>
                    </div>
                    <div
                      className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-border/60 bg-background/50 px-2 py-2"
                      role="group"
                      aria-label="Depósitos con stock"
                    >
                      {depositsConStock.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No hay depósitos con stock libre.</p>
                      ) : (
                        depositsConStock.map((dep) => {
                          const checked = row.depositoIds.includes(dep.id);
                          return (
                            <label
                              key={dep.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs",
                                checked ? "bg-primary/10" : "hover:bg-muted/50"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-3.5 shrink-0 rounded border-input"
                                checked={checked}
                                onChange={(e) => toggleDeposit(idx, dep.id, e.target.checked)}
                              />
                              <span className="min-w-0 flex-1 truncate font-medium">{dep.nombre}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                libre {dep.libre_meta_kg.toFixed(2)} kg
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!depositsConStock.length}
                onClick={() => setLines([...lines, newLine("deposit")])}
              >
                + Stock (depósitos)
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setLines([...lines, newLine("pd")])}>
                + Producción directa
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={
              !o ||
              deliverMut.isPending ||
              !recibioUsuarioId ||
              profilesQ.isLoading ||
              !Number.isFinite(Number(monto)) ||
              Number(monto) < 0 ||
              !sumOk ||
              batchesQ.isLoading
            }
            onClick={async () => {
              if (!o || !batchesQ.data) return;
              setAllocError(null);
              const drafts = toDrafts();
              if (!drafts || drafts.length === 0) {
                setAllocError("Completá las líneas: kg y, en stock, al menos un depósito.");
                return;
              }
              const built = buildDeliverItemsFromLines(orderKg, drafts, batchesQ.data);
              if (!built.ok) {
                setAllocError(built.error);
                return;
              }
              await deliverMut.mutateAsync({
                orderId: o.id,
                payload: {
                  recibio_dinero_usuario_id: recibioUsuarioId,
                  amount_received: Number(monto),
                  delivered_at: new Date(entregaAt).toISOString(),
                  notes: notas.trim() || undefined,
                  items: built.items,
                },
              });
              props.onOpenChange(false);
            }}
          >
            Confirmar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
