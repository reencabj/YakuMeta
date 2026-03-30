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
import { cn } from "@/lib/utils";
import type { DepositRowModel } from "@/hooks/useDeposits";
import type { LocationTypeRow } from "@/services/locationTypesService";
import type { UpsertDepositInput } from "@/services/depositsService";

const schema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  tipo_id: z.string().min(1, "Tipo requerido"),
  dueno: z.string().optional(),
  capacidad_guardado_kg: z.coerce.number().positive("Debe ser mayor que 0"),
  descripcion: z.string().optional(),
});

export type DepositFormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  deposit?: DepositRowModel | null;
  types: LocationTypeRow[];
  onSubmit: (values: UpsertDepositInput) => Promise<void>;
  isSubmitting?: boolean;
};

export function DepositFormDialog(props: Props) {
  const form = useForm<DepositFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: "",
      tipo_id: "",
      dueno: "",
      capacidad_guardado_kg: 120,
      descripcion: "",
    },
  });

  useEffect(() => {
    if (!props.open) return;
    if (props.mode === "edit" && props.deposit) {
      form.reset({
        nombre: props.deposit.nombre,
        tipo_id: props.deposit.tipo_id,
        dueno: props.deposit.dueno ?? "",
        capacidad_guardado_kg: Number(props.deposit.capacidad_guardado_kg),
        descripcion: props.deposit.descripcion ?? "",
      });
    } else if (props.mode === "create") {
      form.reset({
        nombre: "",
        tipo_id: props.types[0]?.id ?? "",
        dueno: "",
        capacidad_guardado_kg: 120,
        descripcion: "",
      });
    }
  }, [props.open, props.mode, props.deposit, props.types, form]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "Crear depósito" : "Editar depósito"}</DialogTitle>
          <DialogDescription>
            Capacidad en kg de guardado in-game. La capacidad en kg de meta se calcula automáticamente (÷ 120).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            await props.onSubmit({
              nombre: values.nombre,
              tipo_id: values.tipo_id,
              dueno: values.dueno || null,
              descripcion: values.descripcion || null,
              capacidad_guardado_kg: values.capacidad_guardado_kg,
            });
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" {...form.register("nombre")} />
            {form.formState.errors.nombre ? (
              <p className="text-xs text-red-400">{form.formState.errors.nombre.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo_id">Tipo</Label>
            <select
              id="tipo_id"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              {...form.register("tipo_id")}
            >
              {props.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueno">Dueño (opcional)</Label>
            <Input id="dueno" placeholder="Ej. banda / persona" {...form.register("dueno")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacidad_guardado_kg">Capacidad guardado (kg)</Label>
            <Input id="capacidad_guardado_kg" type="number" step="0.0001" {...form.register("capacidad_guardado_kg")} />
            {form.formState.errors.capacidad_guardado_kg ? (
              <p className="text-xs text-red-400">{form.formState.errors.capacidad_guardado_kg.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea id="descripcion" rows={3} {...form.register("descripcion")} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={props.isSubmitting}>
              {props.isSubmitting ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
