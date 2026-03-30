import { Ban, Pencil, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DepositRowModel } from "@/hooks/useDeposits";
import { depositFaltanteBolsas } from "@/lib/meta-bags";

type Props = {
  rows: DepositRowModel[];
  onEdit: (row: DepositRowModel) => void;
  onDeactivate: (row: DepositRowModel) => void;
  isAdmin?: boolean;
  onEmptyDeposit?: (row: DepositRowModel) => void;
};

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

export function DepositsTable(props: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Cap. guardado (kg)</TableHead>
            <TableHead className="text-right">Cap. meta (kg)</TableHead>
            <TableHead className="text-right">Stock actual</TableHead>
            <TableHead className="text-right">Reservado</TableHead>
            <TableHead className="text-right">Libre</TableHead>
            <TableHead className="min-w-[140px] text-right">Bolsas (cap · ocup · faltan)</TableHead>
            <TableHead className="min-w-[120px]">Sugerido para completar</TableHead>
            <TableHead className="text-right">Ocupación</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground">
                No hay depósitos con los filtros actuales.
              </TableCell>
            </TableRow>
          ) : (
            props.rows.map((d) => {
              const bag = depositFaltanteBolsas(Number(d.capacidad_meta_kilos), d.total_meta_kg);
              const sug =
                bag.faltanBolsas > 0
                  ? `${bag.packs3Faltantes} packs + ${bag.individualesFaltantes} ind.`
                  : "—";
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.nombre}</TableCell>
                  <TableCell>{d.tipo.nombre}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs sm:text-sm">
                    {fmt(Number(d.capacidad_guardado_kg))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs sm:text-sm">
                    {fmt(Number(d.capacidad_meta_kilos))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs sm:text-sm">{fmt(d.total_meta_kg)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs sm:text-sm">
                    {fmt(d.reservado_meta_kg)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs sm:text-sm">{fmt(d.libre_meta_kg)}</TableCell>
                  <TableCell className="text-right align-top text-xs leading-snug">
                    <span className="font-mono tabular-nums">
                      {bag.capacidadBolsas} · {bag.ocupadasBolsas} · {bag.faltanBolsas}
                    </span>
                    <div className="text-[10px] text-muted-foreground">cap · ocup · faltan</div>
                  </TableCell>
                  <TableCell className="align-top text-xs font-mono">{sug}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs sm:text-sm">
                    {d.ocupacion_pct === null ? "—" : `${d.ocupacion_pct.toFixed(1)} %`}
                  </TableCell>
                  <TableCell>
                    {d.is_active ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Editar"
                        onClick={() => props.onEdit(d)}
                        disabled={!d.is_active}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Desactivar"
                        onClick={() => props.onDeactivate(d)}
                        disabled={!d.is_active}
                      >
                        <Ban className="size-4 text-destructive" />
                      </Button>
                      {props.isAdmin && props.onEmptyDeposit ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Vaciar stock del depósito"
                          onClick={() => props.onEmptyDeposit?.(d)}
                          disabled={!d.is_active || d.total_meta_kg <= 0}
                        >
                          <Warehouse className="size-4 text-amber-200" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
