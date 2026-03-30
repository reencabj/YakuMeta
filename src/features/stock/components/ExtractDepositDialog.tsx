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
import type { DepositRowModel } from "@/hooks/useDeposits";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: DepositRowModel | null;
  isSubmitting?: boolean;
  onSubmit: (input: { deposito_id: string; cantidad_meta_kilos: number; motivo: string }) => Promise<void>;
};

export function ExtractDepositDialog(props: Props) {
  const d = props.deposit;
  const [kg, setKg] = useState("");
  const [motivo, setMotivo] = useState("Extracción manual");

  useEffect(() => {
    if (!props.open) return;
    setKg("");
    setMotivo("Extracción manual");
  }, [props.open, d?.id]);

  const libre = d ? d.libre_meta_kg : 0;
  const kgNum = Number(kg.replace(",", "."));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extraer stock</DialogTitle>
          <DialogDescription>
            Descuenta kg libres del depósito <strong>{d?.nombre}</strong> por orden FIFO (lotes más antiguos
            primero). Máximo hoy:{" "}
            <span className="tabular-nums font-mono">{libre.toLocaleString("es-AR", { maximumFractionDigits: 4 })}</span>{" "}
            kg meta.
          </DialogDescription>
        </DialogHeader>

        {d ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="ext-kg">Cantidad (kg meta)</Label>
              <Input
                id="ext-kg"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ext-motivo">Motivo</Label>
              <Textarea id="ext-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  props.isSubmitting ||
                  libre <= 0 ||
                  !Number.isFinite(kgNum) ||
                  kgNum <= 0 ||
                  kgNum > libre + 1e-9 ||
                  motivo.trim().length < 2
                }
                onClick={async () => {
                  await props.onSubmit({
                    deposito_id: d.id,
                    cantidad_meta_kilos: kgNum,
                    motivo: motivo.trim(),
                  });
                  props.onOpenChange(false);
                }}
              >
                {props.isSubmitting ? "Extrayendo…" : "Extraer"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
