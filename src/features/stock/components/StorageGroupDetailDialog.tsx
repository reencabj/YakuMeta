import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Package, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGroupMembersQuery, useStorageGroupMutations, useUnassignedDepositsQuery } from "@/hooks/useStorageGroups";
import { fetchBatchMetricsByDeposit } from "@/services/depositsService";
import type { StorageGroupMetricsRow } from "@/services/groupService";
import type { BatchWithRelations } from "@/services/stockBatchesService";
import { buildDepositContributions, filterBatchesForGroup } from "@/lib/group-stock-breakdown";

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: StorageGroupMetricsRow | null;
  userId: string | undefined;
  isAdmin: boolean;
  batches: BatchWithRelations[];
};

export function StorageGroupDetailDialog(props: Props) {
  const [addLocationId, setAddLocationId] = useState("");
  const [addOrden, setAddOrden] = useState<string>("");

  const groupId = props.group?.group_id ?? null;
  const membersQ = useGroupMembersQuery(groupId, props.open);
  const unassignedQ = useUnassignedDepositsQuery(props.open && props.isAdmin);
  const metricsQ = useQuery({
    queryKey: ["stock-batch-metrics"],
    queryFn: fetchBatchMetricsByDeposit,
    enabled: props.open && !!props.group,
  });

  const metricsMap = useMemo(
    () => new Map((metricsQ.data ?? []).map((m) => [m.deposito_id, m])),
    [metricsQ.data]
  );

  const memberIds = useMemo(() => (membersQ.data ?? []).map((m) => m.storage_location_id), [membersQ.data]);
  const idSet = useMemo(() => new Set(memberIds), [memberIds]);
  const nombreById = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of membersQ.data ?? []) {
      m.set(row.storage_location_id, row.storage_location.nombre);
    }
    return m;
  }, [membersQ.data]);

  const contributions = useMemo(() => {
    const grp = props.group;
    if (!membersQ.data?.length || !grp) return [];
    return buildDepositContributions(memberIds, metricsMap, nombreById, Number(grp.stock_total));
  }, [membersQ.data, memberIds, metricsMap, nombreById, props.group]);

  const groupBatches = useMemo(
    () => filterBatchesForGroup(props.batches, idSet),
    [props.batches, idSet]
  );

  const mut = useStorageGroupMutations(props.userId);

  const g = props.group;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{g?.nombre ?? "Grupo"}</DialogTitle>
          <DialogDescription>
            {g?.descripcion?.trim() || "Sin descripción."}{" "}
            {g ? (
              <Badge variant={g.activo ? "success" : "warning"} className="ml-2 align-middle">
                {g.activo ? "Activo" : "Inactivo"}
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {g ? (
          <div className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Cap. guardado (kg)</span>
              <p className="font-mono tabular-nums">{fmt(Number(g.capacidad_guardado_total))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Cap. meta (kg)</span>
              <p className="font-mono tabular-nums">{fmt(Number(g.capacidad_meta_total))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Stock total</span>
              <p className="font-mono tabular-nums">{fmt(Number(g.stock_total))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Reservado</span>
              <p className="font-mono tabular-nums">{fmt(Number(g.stock_reservado))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Libre</span>
              <p className="font-mono tabular-nums">{fmt(Number(g.stock_libre))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Ocupación</span>
              <p className="font-mono tabular-nums">{fmt(Number(g.porcentaje_ocupacion))} %</p>
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <Warehouse className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-primary" />
          <span className="text-foreground">Pedidos (próxima fase):</span> se podrá sugerir este{" "}
          <strong>grupo</strong> cuando su stock libre cubra la cantidad; las reservas y movimientos reales siguen siendo
          por <strong>lote</strong> y depósito. Debajo: aporte por depósito y lotes actuales.
        </div>

        {g && !membersQ.isLoading ? (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              Aporte por depósito físico (% del stock del grupo)
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Depósito</TableHead>
                  <TableHead className="text-right">Stock (kg meta)</TableHead>
                  <TableHead className="text-right">% grupo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Sin miembros o sin stock.
                    </TableCell>
                  </TableRow>
                ) : (
                  contributions.map((c) => (
                    <TableRow key={c.depositoId}>
                      <TableCell>{c.nombre}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmt(c.totalMetaKg)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{fmt(c.pctOfGroupStock)} %</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <h3 className="text-sm font-medium">Lotes en los depósitos del grupo</h3>
            {groupBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay lotes activos en estos depósitos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Depósito</TableHead>
                    <TableHead className="text-right">Kg meta</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead>Guardado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupBatches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.deposito.nombre}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {fmt(Number(b.cantidad_meta_kilos))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {fmt(Number(b.cantidad_disponible_meta_kilos))}
                      </TableCell>
                      <TableCell className="text-sm">{b.fecha_guardado}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Administración de miembros</h3>
          {membersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando miembros…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cap. meta</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Libre</TableHead>
                  <TableHead className="text-right">Orden</TableHead>
                  {props.isAdmin ? <TableHead className="w-[100px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(membersQ.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={props.isAdmin ? 7 : 6} className="text-center text-muted-foreground">
                      No hay depósitos asignados.
                    </TableCell>
                  </TableRow>
                ) : (
                  (membersQ.data ?? []).map((m) => {
                    const met = metricsMap.get(m.storage_location_id);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {m.storage_location.nombre}
                          {!m.storage_location.is_active ? (
                            <Badge variant="warning" className="ml-2">
                              inactivo
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{m.storage_location.tipo.nombre}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmt(Number(m.storage_location.capacidad_meta_kilos))}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {met ? fmt(met.total_meta_kg) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {met ? fmt(met.libre_meta_kg) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="ml-auto h-8 w-16 text-right font-mono text-xs"
                            type="number"
                            min={0}
                            disabled={!props.isAdmin || mut.patchOrden.isPending}
                            defaultValue={m.orden ?? ""}
                            key={`${m.id}-${m.orden ?? "x"}`}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const n = raw === "" ? null : Number.parseInt(raw, 10);
                              if (raw !== "" && Number.isNaN(n)) return;
                              if ((n ?? null) === (m.orden ?? null)) return;
                              void mut.patchOrden.mutateAsync({ memberId: m.id, orden: n });
                            }}
                          />
                        </TableCell>
                        {props.isAdmin ? (
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-red-400"
                              disabled={mut.removeMember.isPending}
                              onClick={() => void mut.removeMember.mutateAsync(m.id)}
                            >
                              Quitar
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {props.isAdmin && g?.activo ? (
          <div className="space-y-3 rounded-md border border-dashed border-border p-3">
            <p className="text-sm font-medium">Asignar depósito</p>
            <p className="text-xs text-muted-foreground">
              Un depósito solo puede estar en un grupo. Si no aparece, ya está asignado a otro.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="add_dep">Depósito</Label>
                <select
                  id="add_dep"
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={addLocationId}
                  onChange={(e) => setAddLocationId(e.target.value)}
                >
                  <option value="">Elegir…</option>
                  {(unassignedQ.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full space-y-1 sm:w-28">
                <Label htmlFor="add_ord">Orden</Label>
                <Input
                  id="add_ord"
                  type="number"
                  min={0}
                  placeholder="opc."
                  value={addOrden}
                  onChange={(e) => setAddOrden(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={
                  !addLocationId || !groupId || mut.addMember.isPending || unassignedQ.isLoading
                }
                onClick={async () => {
                  if (!groupId || !addLocationId) return;
                  const ordenRaw = addOrden.trim();
                  const orden =
                    ordenRaw === "" ? null : Number.parseInt(ordenRaw, 10);
                  if (ordenRaw !== "" && Number.isNaN(orden)) return;
                  await mut.addMember.mutateAsync({
                    groupId,
                    storageLocationId: addLocationId,
                    orden,
                  });
                  setAddLocationId("");
                  setAddOrden("");
                }}
              >
                Añadir
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
