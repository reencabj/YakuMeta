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
import { useUpdateOrderMutation } from "@/hooks/useOrders";
import type { OrderWithCreator } from "@/services/orderService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithCreator | null;
};

export function EditOrderDialog(props: Props) {
  const o = props.order;
  const upd = useUpdateOrderMutation();
  const [cliente, setCliente] = useState("");
  const [notas, setNotas] = useState("");
  const [fp, setFp] = useState("");
  const [fe, setFe] = useState("");

  useEffect(() => {
    if (!o || !props.open) return;
    setCliente(o.cliente_nombre);
    setNotas(o.notas ?? "");
    setFp(o.fecha_pedido.slice(0, 10));
    setFe(o.fecha_encargo ? o.fecha_encargo.slice(0, 10) : "");
  }, [o, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pedido</DialogTitle>
          <DialogDescription>Cliente, fechas y notas. La cantidad y el estado se gestionan con otras acciones.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Cliente</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Fecha pedido</Label>
              <Input type="date" value={fp} onChange={(e) => setFp(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fecha encargo</Label>
              <Input type="date" value={fe} onChange={(e) => setFe(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={!o || upd.isPending || !cliente.trim()}
            onClick={async () => {
              if (!o) return;
              await upd.mutateAsync({
                id: o.id,
                patch: {
                  cliente_nombre: cliente.trim(),
                  notas: notas.trim() ? notas.trim() : null,
                  fecha_pedido: fp,
                  fecha_encargo: fe.trim() ? fe : null,
                },
              });
              props.onOpenChange(false);
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
