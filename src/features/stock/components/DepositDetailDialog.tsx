import { Pencil, PlusCircle, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DepositRowModel } from "@/hooks/useDeposits";
import { depositFaltanteBolsas } from "@/lib/meta-bags";
import { cn } from "@/lib/utils";
import { depositTypeIcon } from "./deposit-type-icon";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: DepositRowModel | null;
  isAdmin: boolean;
  onRegisterIntake: () => void;
  onEditDeposit: () => void;
  onEmptyDeposit: () => void;
  /** Cierra el detalle y abre el flujo de desactivación (solo admin). */
  onDeactivateDeposit?: () => void;
};

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

export function DepositDetailDialog(props: Props) {
  const d = props.deposit;
  const Icon = d ? depositTypeIcon(d.tipo.slug) : Warehouse;
  const bag = d ? depositFaltanteBolsas(Number(d.capacidad_meta_kilos), d.total_meta_kg) : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader className="space-y-3 border-b border-subtle pb-4 text-left">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-subtle bg-background-secondary">
              <Icon className="size-6 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl leading-tight">{d?.nombre ?? "Depósito"}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{d?.tipo.nombre}</span>
                  {d?.is_active ? (
                    <Badge variant="success" className="align-middle">
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="align-middle">
                      Inactivo
                    </Badge>
                  )}
                </div>
              </DialogDescription>
            </div>
          </div>

          {d && bag ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stock</p>
                <p className="font-mono text-lg tabular-nums">{fmt(d.total_meta_kg)} kg</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bolsas</p>
                <p className="font-mono tabular-nums">
                  {bag.ocupadasBolsas}/{bag.capacidadBolsas}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Libre</p>
                <p className="font-mono tabular-nums">{fmt(d.libre_meta_kg)} kg</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Faltan</p>
                <p className="font-mono tabular-nums text-foreground">
                  {bag.faltanBolsas > 0 ? `${bag.faltanBolsas} (${bag.packs3Faltantes}p+${bag.individualesFaltantes}i)` : "—"}
                </p>
              </div>
            </div>
          ) : null}
        </DialogHeader>

        <div
          className={cn(
            "flex flex-col gap-2 border-t border-subtle pt-4 sm:flex-row sm:flex-wrap",
            "sm:justify-end"
          )}
        >
          <Button
            type="button"
            className="gap-2 sm:order-first sm:mr-auto"
            onClick={() => {
              props.onRegisterIntake();
              props.onOpenChange(false);
            }}
            disabled={!d?.is_active}
          >
            <PlusCircle className="h-4 w-4" />
            Ingreso
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={props.onEditDeposit} disabled={!d?.is_active}>
            <Pencil className="h-4 w-4" />
            Editar depósito
          </Button>
          {props.isAdmin ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={props.onEmptyDeposit}
              disabled={!d?.is_active || !d || d.total_meta_kg <= 0}
            >
              <Warehouse className="h-4 w-4" />
              Vaciar
            </Button>
          ) : null}
          {props.isAdmin && props.onDeactivateDeposit ? (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                props.onDeactivateDeposit?.();
                props.onOpenChange(false);
              }}
              disabled={!d?.is_active}
            >
              Desactivar
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
