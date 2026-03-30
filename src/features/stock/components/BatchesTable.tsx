import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeftRight, Package, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ageBandForBatch, daysSinceStored } from "@/lib/stock-aging";
import { batchBagsFromMetadataOrKg } from "@/lib/meta-bags";
import type { AppSettingsRow } from "@/services/appSettingsService";
import type { BatchWithRelations } from "@/services/stockBatchesService";

type Props = {
  batches: BatchWithRelations[];
  settings: AppSettingsRow;
  isAdmin?: boolean;
  onTransfer?: (batch: BatchWithRelations) => void;
  onAdjust?: (batch: BatchWithRelations) => void;
  onEditComposition?: (batch: BatchWithRelations) => void;
};

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

function bandLabel(band: ReturnType<typeof ageBandForBatch>) {
  if (band === "normal") return "Normal";
  if (band === "alerta") return "Alerta";
  return "Vencido / fuera de rango";
}

function bandVariant(band: ReturnType<typeof ageBandForBatch>): "success" | "warning" | "danger" {
  if (band === "normal") return "success";
  if (band === "alerta") return "warning";
  return "danger";
}

function bagsCell(b: BatchWithRelations) {
  const info = batchBagsFromMetadataOrKg(b.metadata, Number(b.cantidad_meta_kilos));
  if (info.fuente === "metadata") {
    return (
      <div className="text-xs leading-tight">
        <span className="font-mono tabular-nums">{info.totalBolsas} bolsas</span>
        <div className="text-[10px] text-muted-foreground">
          {info.packsDe3}p + {info.bolsasIndividuales} ind. · registro
        </div>
      </div>
    );
  }
  return (
    <div className="text-xs leading-tight">
      <span className="font-mono tabular-nums">{info.totalBolsas} bolsas</span>
      <div className="text-[10px] text-muted-foreground">estimado (kg×50)</div>
    </div>
  );
}

export function BatchesTable(props: Props) {
  const showActions = props.isAdmin && (props.onTransfer || props.onAdjust || props.onEditComposition);
  const colSpan = showActions ? 13 : 12;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Depósito</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Kilos meta</TableHead>
            <TableHead className="min-w-[100px]">Bolsas / composición</TableHead>
            <TableHead className="text-right">Reservado</TableHead>
            <TableHead className="text-right">Disponible</TableHead>
            <TableHead>Guardado</TableHead>
            <TableHead>Antigüedad</TableHead>
            <TableHead>Vencimiento est.</TableHead>
            <TableHead>Estado lote</TableHead>
            <TableHead>Riesgo</TableHead>
            <TableHead>Registró</TableHead>
            {showActions ? <TableHead className="w-[120px] text-right">Operaciones</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.batches.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                No hay lotes con los filtros actuales.
              </TableCell>
            </TableRow>
          ) : (
            props.batches.map((b) => {
              const days = daysSinceStored(b.fecha_guardado);
              const band = ageBandForBatch(b.fecha_guardado, props.settings);
              const venc = b.fecha_vencimiento_estimada
                ? format(parseISO(b.fecha_vencimiento_estimada), "dd/MM/yyyy", { locale: es })
                : "—";
              const guardado = format(parseISO(b.fecha_guardado), "dd/MM/yyyy", { locale: es });
              const who = b.guardado_por?.display_name?.trim() || b.guardado_por?.username || "—";
              const canMove = Number(b.cantidad_disponible_meta_kilos) > 0 && b.deposito.is_active;

              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.deposito.nombre}</TableCell>
                  <TableCell>{b.deposito.tipo.nombre}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">{fmt(Number(b.cantidad_meta_kilos))}</TableCell>
                  <TableCell>{bagsCell(b)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">
                    {fmt(Number(b.cantidad_reservada_meta_kilos))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">
                    {fmt(Number(b.cantidad_disponible_meta_kilos))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{guardado}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                    Hace {days} {days === 1 ? "día" : "días"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{venc}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{b.estado}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={bandVariant(band)}>{bandLabel(band)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate text-muted-foreground text-sm">{who}</TableCell>
                  {showActions ? (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-0.5">
                        {props.onTransfer ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Mover a otro depósito"
                            disabled={!canMove}
                            onClick={() => props.onTransfer?.(b)}
                          >
                            <ArrowLeftRight className="size-4" />
                          </Button>
                        ) : null}
                        {props.onAdjust ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Ajustar cantidad"
                            onClick={() => props.onAdjust?.(b)}
                          >
                            <SlidersHorizontal className="size-4" />
                          </Button>
                        ) : null}
                        {props.onEditComposition ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Editar composición (bolsas)"
                            onClick={() => props.onEditComposition?.(b)}
                          >
                            <Package className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
