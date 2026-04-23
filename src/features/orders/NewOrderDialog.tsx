import { useMemo, useState } from "react";
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
import { suggestedPricePerKgMeta } from "@/lib/order-pricing";
import { useCreateOrderMutation } from "@/hooks/useOrders";
import { useQuery } from "@tanstack/react-query";
import { fetchPricingRules } from "@/services/adminService";
import { fetchAppSettings } from "@/services/appSettingsService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewOrderDialog(props: Props) {
  const createMut = useCreateOrderMutation();
  const pricingQ = useQuery({
    queryKey: ["pricing_rules"],
    queryFn: fetchPricingRules,
  });
  const settingsQ = useQuery({
    queryKey: ["app_settings"],
    queryFn: fetchAppSettings,
  });

  const [cliente, setCliente] = useState("");
  const [kg, setKg] = useState("1");
  const [fechaPedido, setFechaPedido] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaEncargo, setFechaEncargo] = useState("");
  const [notas, setNotas] = useState("");

  const kgNum = Number(kg.replace(",", "."));
  const precio = useMemo(() => {
    if (!Number.isFinite(kgNum) || kgNum <= 0) return null;
    return suggestedPricePerKgMeta(kgNum, pricingQ.data ?? [], settingsQ.data?.precio_base_por_kilo ?? null);
  }, [kgNum, pricingQ.data, settingsQ.data?.precio_base_por_kilo]);
  const totalSugerido = precio !== null && Number.isFinite(kgNum) ? Math.round(kgNum * precio * 100) / 100 : null;

  const reset = () => {
    setCliente("");
    setKg("1");
    setFechaPedido(new Date().toISOString().slice(0, 10));
    setFechaEncargo("");
    setNotas("");
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        if (!o) reset();
        props.onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo pedido</DialogTitle>
          <DialogDescription>
            Cliente, cantidad en kg de meta y fechas. El precio sugerido se calcula con las reglas activas de Admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="no-cliente">Cliente</Label>
            <Input
              id="no-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nombre"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="no-kg">Cantidad (kg meta)</Label>
            <Input
              id="no-kg"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="no-fp">Fecha pedido</Label>
              <Input id="no-fp" type="date" value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="no-fe">Fecha encargo</Label>
              <Input id="no-fe" type="date" value={fechaEncargo} onChange={(e) => setFechaEncargo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="no-notas">Notas</Label>
            <Textarea id="no-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
          {precio !== null ? (
            <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
              <p className="text-muted-foreground">Sugerido</p>
              <p className="font-mono tabular-nums">
                {precio.toLocaleString("es-AR")} / kg · total{" "}
                {totalSugerido !== null ? `$${totalSugerido.toLocaleString("es-AR")}` : "—"}
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={createMut.isPending || !cliente.trim() || !Number.isFinite(kgNum) || kgNum <= 0}
            onClick={async () => {
              await createMut.mutateAsync({
                cliente_nombre: cliente.trim(),
                cantidad_meta_kilos: kgNum,
                fecha_pedido: fechaPedido,
                fecha_encargo: fechaEncargo.trim() ? fechaEncargo : null,
                notas: notas.trim() ? notas.trim() : null,
              });
              props.onOpenChange(false);
            }}
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
