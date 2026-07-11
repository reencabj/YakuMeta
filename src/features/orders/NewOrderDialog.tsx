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
import { fetchPricingRules, fetchVipClientProfiles } from "@/services/adminService";
import { fetchAppSettings } from "@/services/appSettingsService";
import { cn } from "@/lib/utils";
import type { CustomerType, PaymentType } from "@/types/database";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const selectClass = cn(
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
);

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
  const vipClientsQ = useQuery({
    queryKey: ["profiles", "cliente_vip", "active"],
    queryFn: fetchVipClientProfiles,
  });

  const [cliente, setCliente] = useState("");
  const [tipoCliente, setTipoCliente] = useState<CustomerType>("normal");
  const [tipoPago, setTipoPago] = useState<PaymentType>("blanco");
  const [vipClientId, setVipClientId] = useState("");
  const [kg, setKg] = useState("1");
  const [fechaPedido, setFechaPedido] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaEncargo, setFechaEncargo] = useState("");
  const [notas, setNotas] = useState("");

  const kgNum = Number(kg.replace(",", "."));
  const precio = useMemo(() => {
    if (!Number.isFinite(kgNum) || kgNum <= 0) return null;
    return suggestedPricePerKgMeta(
      kgNum,
      pricingQ.data ?? [],
      settingsQ.data?.precio_base_por_kilo ?? null,
      tipoCliente,
      tipoPago
    );
  }, [kgNum, pricingQ.data, settingsQ.data?.precio_base_por_kilo, tipoCliente, tipoPago]);
  const totalSugerido = precio !== null && Number.isFinite(kgNum) ? Math.round(kgNum * precio * 100) / 100 : null;

  const reset = () => {
    setCliente("");
    setTipoCliente("normal");
    setTipoPago("blanco");
    setVipClientId("");
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo de cliente</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["normal", "vip"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={tipoCliente === value ? "default" : "outline"}
                    className={cn("h-9 px-2", tipoCliente === value && "shadow-sm")}
                    onClick={() => {
                      setTipoCliente(value);
                      if (value === "normal") setVipClientId("");
                    }}
                    aria-pressed={tipoCliente === value}
                  >
                    {value === "vip" ? "VIP" : "Normal"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo de pago</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["blanco", "negro"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={tipoPago === value ? "default" : "outline"}
                    className={cn("h-9 px-2 text-xs", tipoPago === value && "shadow-sm")}
                    onClick={() => setTipoPago(value)}
                    aria-pressed={tipoPago === value}
                  >
                    {value === "blanco" ? "EN BLANCO" : "EN NEGRO"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {tipoCliente === "vip" ? (
            <div className="space-y-1">
              <Label htmlFor="no-vip-client">Cliente VIP guardado</Label>
              <select
                id="no-vip-client"
                className={selectClass}
                value={vipClientId}
                onChange={(e) => {
                  const id = e.target.value;
                  setVipClientId(id);
                  const vip = (vipClientsQ.data ?? []).find((c) => c.id === id);
                  if (vip) setCliente(vip.display_name?.trim() ? vip.display_name : vip.username);
                }}
              >
                <option value="">Escribir manualmente…</option>
                {(vipClientsQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name?.trim() ? c.display_name : c.username}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Podés elegir un usuario con rol Cliente VIP o escribir el cliente manualmente arriba.
              </p>
            </div>
          ) : null}
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
            <div className="rounded-md border border-subtle bg-background-secondary px-3 py-2 text-sm">
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
                tipo_cliente: tipoCliente,
                tipo_pago: tipoPago,
                vip_client_id: null,
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
