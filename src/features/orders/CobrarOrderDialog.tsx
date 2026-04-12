import { useEffect, useState } from "react";
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
import { useMarkOrderCobradoPreEntregaMutation } from "@/hooks/useOrders";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { OrderWithCreator } from "@/services/orderService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithCreator | null;
};

export function CobrarOrderDialog(props: Props) {
  const o = props.order;
  const { user } = useAuth();
  const mut = useMarkOrderCobradoPreEntregaMutation();

  const profilesQ = useQuery({
    queryKey: ["profiles", "active", "cobrar-order"],
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

  useEffect(() => {
    if (!props.open || !o) return;
    setRecibioUsuarioId(user?.id ?? "");
    setMonto(o.total_sugerido != null ? String(o.total_sugerido) : "");
  }, [props.open, o?.id, o?.total_sugerido, user?.id]);

  const montoNum = Number(monto.replace(",", "."));
  const montoOk = Number.isFinite(montoNum) && montoNum >= 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            {o
              ? `Marcá quién recibió el dinero de ${o.cliente_nombre}. El pedido sigue abierto hasta que lo entregues.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cob-recibio-user">Quién recibió el dinero</Label>
            <select
              id="cob-recibio-user"
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
            <Label htmlFor="cob-monto">Monto cobrado</Label>
            <Input id="cob-monto" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
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
              mut.isPending ||
              !recibioUsuarioId ||
              profilesQ.isLoading ||
              !montoOk
            }
            onClick={async () => {
              if (!o) return;
              await mut.mutateAsync({
                orderId: o.id,
                recibio_dinero_usuario_id: recibioUsuarioId,
                amount_received: montoNum,
              });
              props.onOpenChange(false);
            }}
          >
            Confirmar cobro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
