import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
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
import {
  BOLSAS_PER_KG_META,
  metaKilosFromBagComposition,
  normalizeIntCount,
} from "@/lib/stock-intake-composition";
import { cn } from "@/lib/utils";
import type { DepositRowModel } from "@/hooks/useDeposits";
import type { RegisterIntakeInput, StockIntakeMetadata } from "@/services/stockBatchesService";

const QUICK_KGS = [0.5, 1, 2, 3, 4, 5] as const;

const intCountSchema = z.preprocess((v) => normalizeIntCount(v), z.number().int().min(0));

export type IntakeModo = "kg" | "rapido" | "composicion";

const baseSchema = z.object({
  deposito_id: z.string().min(1, "Depósito requerido"),
  fecha_guardado: z.string().min(1, "Fecha requerida"),
  observaciones: z.string().optional(),
  cantidad_meta_kilos: z.coerce.number().positive("Debe ser mayor que 0"),
  packs_de_3: intCountSchema,
  bolsas_individuales: intCountSchema,
  custom_rapido_kg: z.coerce.number().positive(),
});

type FormValues = z.infer<typeof baseSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposits: DepositRowModel[];
  /** Si viene del detalle de un depósito, preselecciona ese depósito. */
  preferredDepositoId?: string | null;
  onSubmit: (values: RegisterIntakeInput) => Promise<void>;
  isSubmitting?: boolean;
};

export function StockIntakeDialog(props: Props) {
  const activeDeposits = useMemo(() => props.deposits.filter((d) => d.is_active), [props.deposits]);

  const [modo, setModo] = useState<IntakeModo>("kg");
  const [rapidoPreset, setRapidoPreset] = useState<number | "otro">(1);

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      deposito_id: "",
      cantidad_meta_kilos: 1,
      fecha_guardado: format(new Date(), "yyyy-MM-dd"),
      observaciones: "",
      packs_de_3: 0,
      bolsas_individuales: 0,
      custom_rapido_kg: 1,
    },
  });

  const packs = form.watch("packs_de_3");
  const bolsas = form.watch("bolsas_individuales");
  const cantKgWatch = form.watch("cantidad_meta_kilos");

  const composicion = useMemo(
    () => metaKilosFromBagComposition(packs, bolsas, BOLSAS_PER_KG_META),
    [packs, bolsas]
  );

  const customRapido = form.watch("custom_rapido_kg");
  const rapidoKgEfectivo = rapidoPreset === "otro" ? Number(customRapido) || 0 : rapidoPreset;

  useEffect(() => {
    if (!props.open) return;
    const active = props.deposits.filter((d) => d.is_active);
    const preferred =
      props.preferredDepositoId && active.some((d) => d.id === props.preferredDepositoId)
        ? props.preferredDepositoId
        : active[0]?.id ?? "";
    setModo("kg");
    setRapidoPreset(1);
    form.reset({
      deposito_id: preferred,
      cantidad_meta_kilos: 1,
      fecha_guardado: format(new Date(), "yyyy-MM-dd"),
      observaciones: "",
      packs_de_3: 0,
      bolsas_individuales: 0,
      custom_rapido_kg: 1,
    });
  }, [props.open, props.deposits, props.preferredDepositoId, form]);

  const modoBtn = (m: IntakeModo, label: string) => (
    <Button
      key={m}
      type="button"
      size="sm"
      variant={modo === m ? "default" : "outline"}
      onClick={() => setModo(m)}
    >
      {label}
    </Button>
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar ingreso de stock</DialogTitle>
          <DialogDescription>
            Crea un lote y un movimiento de tipo <strong>ingreso</strong>. El vencimiento estimado se calcula con la
            configuración global (días de duración por defecto).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            let cantidad_meta_kilos = values.cantidad_meta_kilos;
            let metadata: StockIntakeMetadata | null = null;

            if (modo === "composicion") {
              const comp = metaKilosFromBagComposition(
                values.packs_de_3,
                values.bolsas_individuales,
                BOLSAS_PER_KG_META
              );
              if (comp.totalBolsas <= 0) {
                form.setError("packs_de_3", { message: "Indicá packs o bolsas (total debe ser mayor a 0)" });
                return;
              }
              cantidad_meta_kilos = comp.cantidadMetaKilos;
              metadata = {
                modo_ingreso: "composicion",
                packs_de_3: comp.packsDe3,
                bolsas_individuales: comp.bolsasIndividuales,
                total_bolsas: comp.totalBolsas,
              };
            } else if (modo === "rapido") {
              const kg = rapidoPreset === "otro" ? values.custom_rapido_kg : rapidoPreset;
              if (!Number.isFinite(kg) || kg <= 0) {
                form.setError("custom_rapido_kg", { message: "Cantidad inválida" });
                return;
              }
              cantidad_meta_kilos = kg;
              metadata = { modo_ingreso: "selector_rapido", selector_kg: kg };
            } else {
              metadata = { modo_ingreso: "kg_directo" };
            }

            await props.onSubmit({
              deposito_id: values.deposito_id,
              cantidad_meta_kilos,
              fecha_guardado: values.fecha_guardado,
              observaciones: values.observaciones || null,
              metadata,
            });
          })}
        >
          <div className="space-y-2">
            <Label>Modo de ingreso</Label>
            <div className="flex flex-wrap gap-2">
              {modoBtn("kg", "Kg directo")}
              {modoBtn("rapido", "Selector rápido")}
              {modoBtn("composicion", "Composición (bolsas)")}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deposito_id">Depósito</Label>
            <select
              id="deposito_id"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              {...form.register("deposito_id")}
            >
              {activeDeposits.length === 0 ? (
                <option value="">No hay depósitos activos</option>
              ) : (
                activeDeposits.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} ({d.tipo.nombre})
                  </option>
                ))
              )}
            </select>
            {form.formState.errors.deposito_id ? (
              <p className="text-xs text-red-400">{form.formState.errors.deposito_id.message}</p>
            ) : null}
          </div>

          {modo === "kg" ? (
            <div className="space-y-2">
              <Label htmlFor="cantidad_meta_kilos">Cantidad (kg de meta)</Label>
              <Input id="cantidad_meta_kilos" type="number" step="0.0001" {...form.register("cantidad_meta_kilos")} />
              {form.formState.errors.cantidad_meta_kilos ? (
                <p className="text-xs text-red-400">{form.formState.errors.cantidad_meta_kilos.message}</p>
              ) : null}
            </div>
          ) : null}

          {modo === "rapido" ? (
            <div className="space-y-3">
              <Label>Cantidad rápida</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_KGS.map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={rapidoPreset === k ? "default" : "outline"}
                    onClick={() => setRapidoPreset(k)}
                  >
                    {k} kg
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={rapidoPreset === "otro" ? "default" : "outline"}
                  onClick={() => setRapidoPreset("otro")}
                >
                  Otro
                </Button>
              </div>
              {rapidoPreset === "otro" ? (
                <div className="space-y-2">
                  <Label htmlFor="custom_rapido_kg">Kg de meta</Label>
                  <Input
                    id="custom_rapido_kg"
                    type="number"
                    step="0.0001"
                    {...form.register("custom_rapido_kg")}
                  />
                  {form.formState.errors.custom_rapido_kg ? (
                    <p className="text-xs text-red-400">{form.formState.errors.custom_rapido_kg.message}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Se registrará: </span>
                <span className="font-mono font-medium tabular-nums">{rapidoKgEfectivo.toLocaleString("es-AR")} kg</span>
              </div>
            </div>
          ) : null}

          {modo === "composicion" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="packs_de_3">Packs de 3 bolsas</Label>
                  <Input id="packs_de_3" type="number" min={0} step={1} {...form.register("packs_de_3")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bolsas_individuales">Bolsas individuales</Label>
                  <Input
                    id="bolsas_individuales"
                    type="number"
                    min={0}
                    step={1}
                    {...form.register("bolsas_individuales")}
                  />
                </div>
              </div>
              {form.formState.errors.packs_de_3 ? (
                <p className="text-xs text-red-400">{form.formState.errors.packs_de_3.message}</p>
              ) : null}
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Total bolsas: </span>
                  <span className="font-mono tabular-nums">{composicion.totalBolsas}</span>
                  <span className="text-muted-foreground"> (= packs×3 + individuales)</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Equivale a: </span>
                  <span className="font-mono font-medium tabular-nums">
                    {composicion.cantidadMetaKilos.toLocaleString("es-AR", { maximumFractionDigits: 6 })} kg de meta
                  </span>
                  <span className="text-muted-foreground"> (÷ {BOLSAS_PER_KG_META} bolsas/kg)</span>
                </p>
              </div>
            </div>
          ) : null}

          {modo === "kg" ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Resumen: <span className="font-mono text-foreground">{Number(cantKgWatch).toLocaleString("es-AR")} kg</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="fecha_guardado">Fecha de guardado</Label>
            <Input id="fecha_guardado" type="date" {...form.register("fecha_guardado")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea id="observaciones" rows={3} {...form.register("observaciones")} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={props.isSubmitting || props.deposits.filter((d) => d.is_active).length === 0}
            >
              {props.isSubmitting ? "Registrando…" : "Registrar ingreso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
