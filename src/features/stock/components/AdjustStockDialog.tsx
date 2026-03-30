import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
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
import type { BatchWithRelations } from "@/services/stockBatchesService";

const schema = z.object({
  nueva_cantidad_meta_kilos: z.coerce.number().min(0, "No puede ser negativo"),
  motivo: z.string().min(1, "Motivo requerido"),
  notas: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: BatchWithRelations | null;
  isSubmitting?: boolean;
  onSubmit: (values: {
    batch_id: string;
    nueva_cantidad_meta_kilos: number;
    motivo: string;
    notas?: string | null;
  }) => Promise<void>;
};

export function AdjustStockDialog(props: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nueva_cantidad_meta_kilos: 0, motivo: "", notas: "" },
  });

  useEffect(() => {
    if (!props.open || !props.batch) return;
    form.reset({
      nueva_cantidad_meta_kilos: Number(props.batch.cantidad_meta_kilos),
      motivo: "",
      notas: "",
    });
  }, [props.open, props.batch, form]);

  const b = props.batch;
  const reservado = b ? Number(b.cantidad_reservada_meta_kilos) : 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar cantidad del lote</DialogTitle>
          <DialogDescription>
            Fijá la nueva cantidad en kg de meta. No puede quedar por debajo de lo reservado (
            {reservado.toLocaleString("es-AR")} kg). Queda registro en movimientos y auditoría.
          </DialogDescription>
        </DialogHeader>

        {b ? (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              if (values.nueva_cantidad_meta_kilos < reservado - 1e-9) {
                form.setError("nueva_cantidad_meta_kilos", { message: "No puede ser menor que el reservado" });
                return;
              }
              await props.onSubmit({
                batch_id: b.id,
                nueva_cantidad_meta_kilos: values.nueva_cantidad_meta_kilos,
                motivo: values.motivo,
                notas: values.notas || null,
              });
            })}
          >
            <p className="text-sm text-muted-foreground">
              Lote en <strong>{b.deposito.nombre}</strong> — actual{" "}
              <span className="font-mono">{Number(b.cantidad_meta_kilos).toLocaleString("es-AR")} kg</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="nueva_cantidad_meta_kilos">Nueva cantidad (kg meta)</Label>
              <Input id="nueva_cantidad_meta_kilos" type="number" step="0.0001" {...form.register("nueva_cantidad_meta_kilos")} />
              {form.formState.errors.nueva_cantidad_meta_kilos ? (
                <p className="text-xs text-red-400">{form.formState.errors.nueva_cantidad_meta_kilos.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo</Label>
              <Input id="motivo" {...form.register("motivo")} />
              {form.formState.errors.motivo ? (
                <p className="text-xs text-red-400">{form.formState.errors.motivo.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notas_adj">Notas (opcional)</Label>
              <Textarea id="notas_adj" rows={2} {...form.register("notas")} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={props.isSubmitting}>
                {props.isSubmitting ? "Guardando…" : "Aplicar ajuste"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
