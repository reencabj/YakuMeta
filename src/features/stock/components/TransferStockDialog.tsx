import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { cn } from "@/lib/utils";
import type { DepositRowModel } from "@/hooks/useDeposits";
import type { BatchWithRelations } from "@/services/stockBatchesService";

const schema = z.object({
  source_batch_id: z.string().min(1),
  dest_deposito_id: z.string().min(1),
  cantidad_meta_kilos: z.coerce.number().positive(),
  notas: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: BatchWithRelations[];
  deposits: DepositRowModel[];
  initialBatchId: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: {
    source_batch_id: string;
    dest_deposito_id: string;
    cantidad_meta_kilos: number;
    notas?: string | null;
  }) => Promise<void>;
};

export function TransferStockDialog(props: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      source_batch_id: "",
      dest_deposito_id: "",
      cantidad_meta_kilos: 0.01,
      notas: "",
    },
  });

  const batchId = form.watch("source_batch_id");
  const selected = useMemo(
    () => props.batches.find((b) => b.id === batchId),
    [props.batches, batchId]
  );
  const disponible = selected
    ? Number(selected.cantidad_meta_kilos) - Number(selected.cantidad_reservada_meta_kilos)
    : 0;

  useEffect(() => {
    if (!props.open) return;
    const first = props.batches.find(
      (b) =>
        b.deposito.is_active &&
        Number(b.cantidad_disponible_meta_kilos) > 0 &&
        (props.initialBatchId ? b.id === props.initialBatchId : true)
    );
    form.reset({
      source_batch_id: props.initialBatchId ?? first?.id ?? "",
      dest_deposito_id: "",
      cantidad_meta_kilos: first
        ? Math.min(
            Number(first.cantidad_disponible_meta_kilos),
            Math.max(0.0001, Number(first.cantidad_disponible_meta_kilos))
          )
        : 0.01,
      notas: "",
    });
  }, [props.open, props.batches, props.initialBatchId, form]);

  const activeDeposits = useMemo(() => props.deposits.filter((d) => d.is_active), [props.deposits]);
  const destOptions = useMemo(
    () => activeDeposits.filter((d) => d.id !== selected?.deposito.id),
    [activeDeposits, selected?.deposito.id]
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover stock entre depósitos</DialogTitle>
          <DialogDescription>
            Se descuenta del lote origen y se crea un <strong>nuevo lote</strong> en el depósito destino con la misma
            fecha de guardado y vencimiento estimado. Queda registrado en movimientos y auditoría.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (values.cantidad_meta_kilos > disponible + 1e-9) {
              form.setError("cantidad_meta_kilos", { message: "Supera el disponible del lote" });
              return;
            }
            await props.onSubmit({
              source_batch_id: values.source_batch_id,
              dest_deposito_id: values.dest_deposito_id,
              cantidad_meta_kilos: values.cantidad_meta_kilos,
              notas: values.notas || null,
            });
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="source_batch_id">Lote origen</Label>
            <select
              id="source_batch_id"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              {...form.register("source_batch_id")}
            >
              <option value="">Elegir…</option>
              {props.batches
                .filter((b) => b.deposito.is_active && Number(b.cantidad_disponible_meta_kilos) > 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.deposito.nombre} — disp. {Number(b.cantidad_disponible_meta_kilos).toLocaleString("es-AR")} kg
                  </option>
                ))}
            </select>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                Disponible para mover:{" "}
                <span className="font-mono text-foreground">{disponible.toLocaleString("es-AR")} kg meta</span>
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dest_deposito_id">Depósito destino</Label>
            <select
              id="dest_deposito_id"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              {...form.register("dest_deposito_id")}
            >
              <option value="">Elegir…</option>
              {destOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cantidad_meta_kilos">Cantidad a mover (kg meta)</Label>
            <Input id="cantidad_meta_kilos" type="number" step="0.0001" {...form.register("cantidad_meta_kilos")} />
            {form.formState.errors.cantidad_meta_kilos ? (
              <p className="text-xs text-red-400">{form.formState.errors.cantidad_meta_kilos.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas">Observación</Label>
            <Textarea id="notas" rows={2} {...form.register("notas")} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={props.isSubmitting || !selected || destOptions.length === 0}>
              {props.isSubmitting ? "Moviendo…" : "Confirmar traslado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
