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
import type { UpsertStorageGroupInput } from "@/services/groupService";

const schema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  descripcion: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type GroupNameDesc = Pick<{ nombre: string; descripcion: string | null }, "nombre" | "descripcion">;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  group: GroupNameDesc | null;
  isSubmitting?: boolean;
  onSubmit: (input: UpsertStorageGroupInput) => Promise<void>;
};

export function StorageGroupFormDialog(props: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nombre: "", descripcion: "" },
  });

  useEffect(() => {
    if (!props.open) return;
    if (props.mode === "edit" && props.group) {
      form.reset({
        nombre: props.group.nombre,
        descripcion: props.group.descripcion ?? "",
      });
    } else {
      form.reset({ nombre: "", descripcion: "" });
    }
  }, [props.open, props.mode, props.group, form]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "Nuevo grupo de depósitos" : "Editar grupo"}</DialogTitle>
          <DialogDescription>
            Los grupos permiten ver capacidad y stock agregados y preparan la recomendación de pedidos por unidad
            lógica.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            await props.onSubmit({
              nombre: values.nombre,
              descripcion: values.descripcion || null,
            });
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="sg_nombre">Nombre</Label>
            <Input id="sg_nombre" {...form.register("nombre")} />
            {form.formState.errors.nombre ? (
              <p className="text-xs text-red-400">{form.formState.errors.nombre.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sg_desc">Descripción (opcional)</Label>
            <Textarea id="sg_desc" rows={3} {...form.register("descripcion")} />
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
