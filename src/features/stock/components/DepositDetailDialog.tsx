import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeftRight,
  Package,
  Pencil,
  PlusCircle,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react";
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
import { batchBagsFromMetadataOrKg } from "@/lib/meta-bags";
import { depositFaltanteBolsas } from "@/lib/meta-bags";
import { cn } from "@/lib/utils";
import type { BatchWithRelations } from "@/services/stockBatchesService";
import { depositTypeIcon } from "./deposit-type-icon";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: DepositRowModel | null;
  batches: BatchWithRelations[];
  isAdmin: boolean;
  onRegisterIntake: () => void;
  onEditDeposit: () => void;
  onEmptyDeposit: () => void;
  /** Cierra el detalle y abre el flujo de desactivación (solo admin). */
  onDeactivateDeposit?: () => void;
  onTransferBatch: (b: BatchWithRelations) => void;
  onAdjustBatch: (b: BatchWithRelations) => void;
  onEditComposition: (b: BatchWithRelations) => void;
};

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

export function DepositDetailDialog(props: Props) {
  const d = props.deposit;
  const Icon = d ? depositTypeIcon(d.tipo.slug) : Warehouse;
  const depositBatches = d
    ? props.batches.filter((b) => b.deposito_id === d.id).sort((a, b) => b.fecha_guardado.localeCompare(a.fecha_guardado))
    : [];
  const bag = d ? depositFaltanteBolsas(Number(d.capacidad_meta_kilos), d.total_meta_kg) : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/80 sm:max-w-xl">
        <DialogHeader className="space-y-3 border-b border-border/60 pb-4 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl leading-tight">{d?.nombre ?? "Depósito"}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {d?.tipo.nombre}
                {d?.is_active ? (
                  <Badge variant="success" className="ml-2 align-middle">
                    Activo
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-2 align-middle">
                    Inactivo
                  </Badge>
                )}
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
                <p className="font-mono tabular-nums text-primary">
                  {bag.faltanBolsas > 0 ? `${bag.faltanBolsas} (${bag.packs3Faltantes}p+${bag.individualesFaltantes}i)` : "—"}
                </p>
              </div>
            </div>
          ) : null}
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lotes</p>
          {depositBatches.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 py-8 text-center text-sm text-muted-foreground">
              Sin lotes
            </p>
          ) : (
            <ul className="space-y-2">
              {depositBatches.map((b) => {
                const bags = batchBagsFromMetadataOrKg(b.metadata, Number(b.cantidad_meta_kilos));
                const guardado = format(parseISO(b.fecha_guardado), "dd/MM/yy", { locale: es });
                const canMove = Number(b.cantidad_disponible_meta_kilos) > 0 && b.deposito.is_active;
                return (
                  <li
                    key={b.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-mono text-sm tabular-nums">
                        {fmt(Number(b.cantidad_meta_kilos))} kg
                        <span className="ml-2 text-xs text-muted-foreground">
                          {bags.fuente === "metadata"
                            ? `${bags.totalBolsas} bol. · ${bags.packsDe3}p+${bags.bolsasIndividuales}i`
                            : `${bags.totalBolsas} bol. est.`}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {guardado} · {b.estado}
                      </p>
                    </div>
                    {props.isAdmin ? (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Mover"
                          disabled={!canMove}
                          onClick={() => props.onTransferBatch(b)}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Ajustar"
                          onClick={() => props.onAdjustBatch(b)}
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Composición"
                          onClick={() => props.onEditComposition(b)}
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className={cn(
            "flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:flex-wrap",
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
              className="gap-2 border-primary/45 text-primary hover:bg-primary/12"
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
