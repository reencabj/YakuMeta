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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DepositRowModel } from "@/hooks/useDeposits";

const schema = z.object({
  motivo: z.string().min(3, "Motivo requerido (mín. 3 caracteres)"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: DepositRowModel | null;
  isSubmitting?: boolean;
  onSubmit: (values: { deposito_id: string; motivo: string }) => Promise<void>;
};

export function EmptyDepositDialog(props: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { motivo: "" },
  });

  useEffect(() => {
    if (!props.open) return;
    form.reset({ motivo: "" });
  }, [props.open, form]);

  const d = props.deposit;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vaciar depósito</DialogTitle>
          <DialogDescription>
            Todos los lotes con stock en <strong>{d?.nombre}</strong> pasan a cantidad 0 (sin borrar filas). Se registra
            movimiento <code className="text-xs">vaciado_deposito</code> por cada lote y entrada en auditoría.
          </DialogDescription>
        </DialogHeader>

        {d ? (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              await props.onSubmit({ deposito_id: d.id, motivo: values.motivo });
            })}
          >
            <p className="text-sm text-primary">
              Stock actual aproximado: {d.total_meta_kg.toLocaleString("es-AR")} kg meta en este depósito.
            </p>
            <div className="space-y-2">
              <Label htmlFor="motivo_vaciar">Motivo (obligatorio)</Label>
              <Textarea id="motivo_vaciar" rows={3} {...form.register("motivo")} placeholder="Ej.: corrección operativa, mercadería movida físicamente…" />
              {form.formState.errors.motivo ? (
                <p className="text-xs text-red-400">{form.formState.errors.motivo.message}</p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={props.isSubmitting || d.total_meta_kg <= 0}>
                {props.isSubmitting ? "Vaciando…" : "Vaciar depósito"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
