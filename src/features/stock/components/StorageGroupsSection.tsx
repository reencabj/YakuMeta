import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Layers, Package, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useGroupMembersQuery,
  useRecommendStorageGroupsQuery,
  useStorageGroupMetricsQuery,
  useStorageGroupMutations,
} from "@/hooks/useStorageGroups";
import { cn } from "@/lib/utils";
import {
  allocateOrderAcrossGroupDeposits,
  buildDepositContributions,
  filterBatchesForGroup,
} from "@/lib/group-stock-breakdown";
import { fetchBatchMetricsByDeposit, type DepositMetrics } from "@/services/depositsService";
import type { StorageGroupMetricsRow } from "@/services/groupService";
import type { BatchWithRelations } from "@/services/stockBatchesService";
import { StorageGroupDetailDialog } from "./StorageGroupDetailDialog";
import { StorageGroupFormDialog } from "./StorageGroupFormDialog";

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

type Props = {
  userId: string | undefined;
  isAdmin: boolean;
  batches: BatchWithRelations[];
};

export function StorageGroupsSection(props: Props) {
  const q = useStorageGroupMetricsQuery();
  const metricsQ = useQuery({
    queryKey: ["stock-batch-metrics"],
    queryFn: fetchBatchMetricsByDeposit,
  });
  const mut = useStorageGroupMutations(props.userId);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<StorageGroupMetricsRow | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewKg, setPreviewKg] = useState<string>("1");

  const previewNum = Number.parseFloat(previewKg.replace(",", "."));
  const previewValid = Number.isFinite(previewNum) && previewNum > 0;
  const recommendQ = useRecommendStorageGroupsQuery(previewNum, previewValid);

  const metricsMap = useMemo(
    () => new Map((metricsQ.data ?? []).map((m) => [m.deposito_id, m])),
    [metricsQ.data]
  );

  const editingRow = q.data?.find((g) => g.group_id === editingId);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 shrink-0 text-primary" />
            Grupos = unidad lógica de almacenamiento
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Un <strong>depósito</strong> es un lugar físico (una casa, camioneta, etc.). Un <strong>grupo</strong> es un
            conjunto de esos depósitos que operativamente tratamos como una sola unidad: se suman capacidades y stock. Los{" "}
            <strong>pedidos</strong> podrán sugerir primero un grupo que cubra la cantidad y luego desglosar el aporte por
            cada depósito y por lote; el movimiento real sigue siendo por lotes y depósitos.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulación de cobertura (base para Pedidos)</CardTitle>
          <CardDescription>
            Cantidad de meta pedida (kg). El sistema lista los <strong>grupos activos</strong> cuyo stock libre alcanza
            esa cantidad — misma lógica que usará la fase Pedidos para priorizar grupos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="preview_kg">
              Cantidad (kg meta)
            </label>
            <input
              id="preview_kg"
              type="text"
              inputMode="decimal"
              className={cn(
                "h-9 w-full max-w-[140px] rounded-md border border-input bg-card px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[140px]"
              )}
              value={previewKg}
              onChange={(e) => setPreviewKg(e.target.value)}
              placeholder="ej. 1"
            />
          </div>
          <div className="min-h-[2rem] flex-1 text-sm">
            {!previewValid ? (
              <span className="text-muted-foreground">Ingresá un número mayor que 0.</span>
            ) : recommendQ.isLoading ? (
              <span className="text-muted-foreground">Buscando grupos que cubran {fmt(previewNum)} kg…</span>
            ) : recommendQ.error ? (
              <span className="text-red-400">Error: {String(recommendQ.error)}</span>
            ) : (recommendQ.data ?? []).length === 0 ? (
              <span className="text-primary">
                Ningún grupo activo tiene stock libre ≥ {fmt(previewNum)} kg.
              </span>
            ) : (
              <div className="space-y-1">
                <p className="font-medium text-primary">
                  Grupos que cubren {fmt(previewNum)} kg (stock libre suficiente):
                </p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {(recommendQ.data ?? []).map((g) => (
                    <li key={g.group_id}>
                      <span className="text-foreground">{g.nombre}</span> — libre {fmt(Number(g.stock_libre))} kg
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  En Pedidos, al elegir un grupo se podrá ver el detalle por depósito (y por lote) como en la expansión de
                  cada tarjeta.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Grupos configurados</h2>
          <p className="text-sm text-muted-foreground">
            Cada tarjeta es una unidad lógica formada por varios depósitos físicos. Expandí para ver miembros, lotes y
            aporte al total.
          </p>
        </div>
        {props.isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setFormMode("create");
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            Nuevo grupo
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando grupos…</p>
      ) : q.error ? (
        <p className="text-sm text-red-400">{q.error instanceof Error ? q.error.message : String(q.error)}</p>
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay grupos todavía. {props.isAdmin ? "Creá uno y asigná depósitos físicos." : ""}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(q.data ?? []).map((g) => (
            <StorageGroupCard
              key={g.group_id}
              group={g}
              batches={props.batches}
              metricsMap={metricsMap}
              expanded={expandedId === g.group_id}
              onToggleExpand={() => toggleExpand(g.group_id)}
              previewOrderKg={previewValid ? previewNum : null}
              isAdmin={props.isAdmin}
              onManage={() => {
                setDetailGroup(g);
                setDetailOpen(true);
              }}
              onEdit={() => {
                setFormMode("edit");
                setEditingId(g.group_id);
                setFormOpen(true);
              }}
              onToggleActive={() => void mut.setActive.mutateAsync({ id: g.group_id, activo: !g.activo })}
              setActivePending={mut.setActive.isPending}
            />
          ))}
        </div>
      )}

      {!props.isAdmin ? (
        <p className="text-xs text-muted-foreground">
          Solo administradores pueden crear grupos, editarlos y asignar depósitos.
        </p>
      ) : null}

      <StorageGroupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        group={formMode === "edit" && editingRow ? { nombre: editingRow.nombre, descripcion: editingRow.descripcion } : null}
        isSubmitting={mut.create.isPending || mut.update.isPending}
        onSubmit={async (input) => {
          if (formMode === "create") {
            await mut.create.mutateAsync(input);
          } else if (editingId) {
            await mut.update.mutateAsync({ id: editingId, input });
          }
          setFormOpen(false);
        }}
      />

      <StorageGroupDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        group={detailGroup}
        userId={props.userId}
        isAdmin={props.isAdmin}
        batches={props.batches}
      />
    </div>
  );
}

type CardProps = {
  group: StorageGroupMetricsRow;
  batches: BatchWithRelations[];
  metricsMap: Map<string, DepositMetrics>;
  expanded: boolean;
  onToggleExpand: () => void;
  previewOrderKg: number | null;
  isAdmin: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  setActivePending: boolean;
};

function StorageGroupCard(props: CardProps) {
  const { group: g } = props;
  const membersQ = useGroupMembersQuery(g.group_id, true);

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
    if (!membersQ.data?.length) return [];
    return buildDepositContributions(memberIds, props.metricsMap, nombreById, Number(g.stock_total));
  }, [membersQ.data, memberIds, props.metricsMap, nombreById, g.stock_total]);

  const groupBatches = useMemo(
    () => filterBatchesForGroup(props.batches, idSet).sort((a, b) => b.fecha_guardado.localeCompare(a.fecha_guardado)),
    [props.batches, idSet]
  );

  const allocationPreview = useMemo(() => {
    if (props.previewOrderKg == null || props.previewOrderKg <= 0) return null;
    if (Number(g.stock_libre) < props.previewOrderKg) return null;
    const deps = (membersQ.data ?? []).map((m) => {
      const met = props.metricsMap.get(m.storage_location_id);
      return {
        id: m.storage_location_id,
        nombre: m.storage_location.nombre,
        libreMetaKg: met?.libre_meta_kg ?? 0,
      };
    });
    return allocateOrderAcrossGroupDeposits(props.previewOrderKg, deps);
  }, [props.previewOrderKg, g.stock_libre, membersQ.data, props.metricsMap]);

  const memberSummary = (membersQ.data ?? [])
    .slice(0, 4)
    .map((m) => m.storage_location.nombre)
    .join(" · ");
  const extra = (membersQ.data ?? []).length > 4 ? ` +${(membersQ.data ?? []).length - 4}` : "";

  return (
    <Card className="overflow-hidden border-border/80">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Warehouse className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-base font-semibold leading-tight">{g.nombre}</CardTitle>
              <Badge variant={g.activo ? "success" : "warning"}>{g.activo ? "Activo" : "Inactivo"}</Badge>
              <Badge variant="secondary" className="font-normal">
                Grupo lógico
              </Badge>
            </div>
            {g.descripcion?.trim() ? (
              <p className="text-sm text-muted-foreground">{g.descripcion.trim()}</p>
            ) : (
              <p className="text-xs italic text-muted-foreground">Sin descripción</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={props.onToggleExpand}>
              {props.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {props.expanded ? "Ocultar detalle" : "Ver depósitos y lotes"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={props.onManage}>
              Gestionar
            </Button>
            {props.isAdmin ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={props.onEdit}>
                  Editar nombre
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-primary"
                  disabled={props.setActivePending}
                  onClick={props.onToggleActive}
                >
                  {g.activo ? "Desactivar" : "Activar"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/90">Depósitos físicos:</span>
          {membersQ.isLoading ? (
            <span>Cargando…</span>
          ) : (membersQ.data ?? []).length === 0 ? (
            <span>Ninguno asignado</span>
          ) : (
            <span>
              {memberSummary}
              {extra}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <MetricPill label="Cap. guardado (kg)" value={fmt(Number(g.capacidad_guardado_total))} />
          <MetricPill label="Cap. meta (kg)" value={fmt(Number(g.capacidad_meta_total))} />
          <MetricPill label="Stock total" value={fmt(Number(g.stock_total))} highlight />
          <MetricPill label="Reservado" value={fmt(Number(g.stock_reservado))} />
          <MetricPill label="Libre" value={fmt(Number(g.stock_libre))} highlight />
          <MetricPill label="Ocupación" value={`${fmt(Number(g.porcentaje_ocupacion))} %`} />
          <MetricPill label="Estado" value={g.activo ? "Operativo" : "Inactivo"} />
        </div>
      </CardHeader>

      {props.expanded ? (
        <CardContent className="border-t border-border/60 bg-muted/20 pt-4 space-y-6">
          {membersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando miembros…</p>
          ) : (
            <>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Package className="h-4 w-4" />
                  Aporte por depósito al stock del grupo
                </h4>
                <p className="mb-3 text-xs text-muted-foreground">
                  Porcentaje sobre el <strong>stock total del grupo</strong> (suma de lotes en estos depósitos).
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Depósito físico</TableHead>
                      <TableHead className="text-right">Stock (kg meta)</TableHead>
                      <TableHead className="text-right">% del grupo</TableHead>
                      <TableHead className="hidden sm:table-cell">Distribución</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contributions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          Sin datos de miembros.
                        </TableCell>
                      </TableRow>
                    ) : (
                      contributions.map((c) => (
                        <TableRow key={c.depositoId}>
                          <TableCell className="font-medium">{c.nombre}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{fmt(c.totalMetaKg)}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {fmt(c.pctOfGroupStock)} %
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-primary/80 transition-all"
                                style={{ width: `${Math.min(100, c.pctOfGroupStock)}%` }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Lotes en estos depósitos (movimiento real)</h4>
                <p className="mb-3 text-xs text-muted-foreground">
                  Las reservas y entregas siguen aplicando sobre <strong>lotes</strong> y depósitos; el grupo solo agrupa
                  la vista y la recomendación.
                </p>
                {groupBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay lotes activos en los depósitos del grupo.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lote</TableHead>
                        <TableHead>Depósito</TableHead>
                        <TableHead className="text-right">Kg meta</TableHead>
                        <TableHead className="text-right">Disponible</TableHead>
                        <TableHead>Guardado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupBatches.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{b.id.slice(0, 8)}…</TableCell>
                          <TableCell>{b.deposito.nombre}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {fmt(Number(b.cantidad_meta_kilos))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {fmt(Number(b.cantidad_disponible_meta_kilos))}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{b.fecha_guardado}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {allocationPreview && allocationPreview.length > 0 && props.previewOrderKg != null ? (
                <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
                  <p className="text-sm font-medium text-foreground">
                    Reparto ilustrativo para un pedido de {fmt(props.previewOrderKg)} kg (misma cantidad que arriba)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Proporcional al stock libre en cada depósito. En Pedidos el desglose final será por lotes elegibles.
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {allocationPreview.map((a) => (
                      <li key={a.id}>
                        <span className="font-medium">{a.nombre}</span> → {fmt(a.kg)} kg meta
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function MetricPill(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-card px-2 py-1.5 text-center",
        props.highlight && "border-primary/30 bg-primary/10"
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{props.label}</div>
      <div className="font-mono text-sm tabular-nums text-foreground">{props.value}</div>
    </div>
  );
}
