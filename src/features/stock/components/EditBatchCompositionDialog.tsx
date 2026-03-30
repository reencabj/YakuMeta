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
import { BOLSAS_PER_KG_META, metaKilosFromBagComposition, normalizeIntCount } from "@/lib/stock-intake-composition";
import type { BatchWithRelations } from "@/services/stockBatchesService";

const int0 = z.preprocess((v) => normalizeIntCount(v), z.number().int().min(0));

const schema = z.object({
  packs_de_3: int0,
  bolsas_individuales: int0,
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
    packs_de_3: number;
    bolsas_individuales: number;
    motivo: string;
    notas?: string | null;
  }) => Promise<void>;
};

export function EditBatchCompositionDialog(props: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { packs_de_3: 0, bolsas_individuales: 0, motivo: "", notas: "" },
  });

  const packs = form.watch("packs_de_3");
  const ind = form.watch("bolsas_individuales");

  const preview = useMemo(
    () => metaKilosFromBagComposition(packs, ind, BOLSAS_PER_KG_META),
    [packs, ind]
  );

  useEffect(() => {
    if (!props.open || !props.batch) return;
    const m = props.batch.metadata as Record<string, unknown> | null;
    const p = typeof m?.packs_de_3 === "number" ? m.packs_de_3 : undefined;
    const bi = typeof m?.bolsas_individuales === "number" ? m.bolsas_individuales : undefined;
    if (p !== undefined && bi !== undefined) {
      form.reset({
        packs_de_3: p,
        bolsas_individuales: bi,
        motivo: "",
        notas: "",
      });
    } else {
      const totalBolsas = Math.round(Number(props.batch.cantidad_meta_kilos) * BOLSAS_PER_KG_META);
      const packs3 = Math.floor(totalBolsas / 3);
      const rest = totalBolsas % 3;
      form.reset({
        packs_de_3: packs3,
        bolsas_individuales: rest,
        motivo: "",
        notas: "",
      });
    }
  }, [props.open, props.batch, form]);

  const b = props.batch;
  const reservado = b ? Number(b.cantidad_reservada_meta_kilos) : 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar composición (bolsas)</DialogTitle>
          <DialogDescription>
            Se recalcula <strong>cantidad_meta_kilos = total_bolsas / 50</strong> y se actualiza metadata. No puede
            quedar por debajo de lo reservado ({reservado.toLocaleString("es-AR")} kg).
          </DialogDescription>
        </DialogHeader>

        {b ? (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              const comp = metaKilosFromBagComposition(
                normalizeIntCount(values.packs_de_3),
                normalizeIntCount(values.bolsas_individuales),
                BOLSAS_PER_KG_META
              );
              if (comp.totalBolsas <= 0) {
                form.setError("packs_de_3", { message: "Indicá al menos una bolsa" });
                return;
              }
              if (comp.cantidadMetaKilos < reservado - 1e-9) {
                form.setError("packs_de_3", { message: "La cantidad resultante es menor que el reservado" });
                return;
              }
              await props.onSubmit({
                batch_id: b.id,
                packs_de_3: comp.packsDe3,
                bolsas_individuales: comp.bolsasIndividuales,
                motivo: values.motivo,
                notas: values.notas || null,
              });
            })}
          >
            <p className="text-sm text-muted-foreground">
              Depósito: <strong>{b.deposito.nombre}</strong>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ec_packs">Packs de 3</Label>
                <Input id="ec_packs" type="number" min={0} step={1} {...form.register("packs_de_3")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ec_ind">Bolsas individuales</Label>
                <Input id="ec_ind" type="number" min={0} step={1} {...form.register("bolsas_individuales")} />
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              Total bolsas: <span className="font-mono">{preview.totalBolsas}</span> →{" "}
              <span className="font-mono font-medium">{preview.cantidadMetaKilos.toLocaleString("es-AR")} kg</span> meta
            </div>
            <div className="space-y-2">
              <Label htmlFor="ec_motivo">Motivo</Label>
              <Input id="ec_motivo" {...form.register("motivo")} />
              {form.formState.errors.motivo ? (
                <p className="text-xs text-red-400">{form.formState.errors.motivo.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ec_notas">Notas (opcional)</Label>
              <Textarea id="ec_notas" rows={2} {...form.register("notas")} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={props.isSubmitting}>
                {props.isSubmitting ? "Guardando…" : "Guardar composición"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
