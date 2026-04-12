import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { ArrowRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell, PanelCard, SegmentTabs } from "@/components/shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { useDepositMutations, useDepositsData, type DepositRowModel } from "@/hooks/useDeposits";
import { useLocationTypesQuery } from "@/hooks/useLocationTypesQuery";
import { useRegisterStockIntakeMutation, useStockBatchesQuery } from "@/hooks/useStockBatches";
import { useStockOperationsMutations } from "@/hooks/useStockOperations";
import { cn } from "@/lib/utils";
import { DepositFormDialog } from "./components/DepositFormDialog";
import { DepositDetailDialog } from "./components/DepositDetailDialog";
import { DepositsByZone } from "./components/DepositsByZone";
import { EmptyDepositDialog } from "./components/EmptyDepositDialog";
import { ExtractDepositDialog } from "./components/ExtractDepositDialog";
import { StockIntakeDialog } from "./components/StockIntakeDialog";
import { StorageGroupsSection } from "./components/StorageGroupsSection";

type StockMainView = "deposits" | "groups";

type DepositSort = "fullness" | "emptiness" | "nombre";
type ActiveFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "with" | "without";

const selectClass = cn(
  "h-9 rounded-lg border border-border/60 bg-background/50 px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

export function StockPage() {
  const { user, profile } = useAuth();
  const settingsQ = useAppSettingsQuery();
  const typesQ = useLocationTypesQuery(false);
  const { rows, isLoading, error, depositsQuery, metricsQuery } = useDepositsData();
  const batchesQ = useStockBatchesQuery();
  const { create, update, deactivate } = useDepositMutations(user?.id);
  const intakeMut = useRegisterStockIntakeMutation();
  const stockOps = useStockOperationsMutations();

  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [depositSort, setDepositSort] = useState<DepositSort>("fullness");

  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositMode, setDepositMode] = useState<"create" | "edit">("create");
  const [depositEditing, setDepositEditing] = useState<DepositRowModel | null>(null);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<DepositRowModel | null>(null);
  const [stockMainView, setStockMainView] = useState<StockMainView>("deposits");

  const [emptyDepositOpen, setEmptyDepositOpen] = useState(false);
  const [emptyDepositRow, setEmptyDepositRow] = useState<DepositRowModel | null>(null);
  const [extractDepositOpen, setExtractDepositOpen] = useState(false);
  const [extractDepositRow, setExtractDepositRow] = useState<DepositRowModel | null>(null);
  const [depositDetailOpen, setDepositDetailOpen] = useState(false);
  const [selectedDepositDetail, setSelectedDepositDetail] = useState<DepositRowModel | null>(null);
  const [intakePreferredDepositoId, setIntakePreferredDepositoId] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";

  const filteredSortedDeposits = useMemo(() => {
    if (!rows) return [];
    let list = [...rows];

    if (tipoFilter !== "all") {
      list = list.filter((d) => d.tipo_id === tipoFilter);
    }
    if (activeFilter === "active") list = list.filter((d) => d.is_active);
    if (activeFilter === "inactive") list = list.filter((d) => !d.is_active);
    if (stockFilter === "with") list = list.filter((d) => d.total_meta_kg > 0);
    if (stockFilter === "without") list = list.filter((d) => d.total_meta_kg <= 0);

    list.sort((a, b) => {
      if (depositSort === "nombre") {
        return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
      }
      if (depositSort === "fullness") {
        const pa = a.ocupacion_pct ?? -1;
        const pb = b.ocupacion_pct ?? -1;
        return pb - pa;
      }
      if (depositSort === "emptiness") {
        const pa = a.ocupacion_pct ?? 999;
        const pb = b.ocupacion_pct ?? 999;
        return pa - pb;
      }
      return 0;
    });

    return list;
  }, [rows, tipoFilter, activeFilter, stockFilter, depositSort]);

  return (
    <PageShell className="gap-8">
      <PageHeader
        title="Stock"
        description={
          stockMainView === "deposits"
            ? "Depósitos físicos (capacidad en kg de guardado y meta) y lotes con antigüedad / vencimiento estimado."
            : "Grupos lógicos que agrupan varios depósitos físicos para métricas y recomendación de pedidos."
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Link to="/">
                Dashboard
                <ArrowRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDepositMode("create");
                setDepositEditing(null);
                setDepositDialogOpen(true);
              }}
            >
              Crear depósito
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIntakePreferredDepositoId(null);
                setIntakeOpen(true);
              }}
            >
              Registrar ingreso
            </Button>
          </>
        }
      />

      <div className="space-y-2">
        <SegmentTabs
          aria-label="Vista de stock"
          value={stockMainView}
          onChange={(v) => setStockMainView(v as StockMainView)}
          options={[
            { value: "deposits", label: "Por depósitos" },
            { value: "groups", label: "Por grupos" },
          ]}
        />
        {stockMainView === "groups" ? (
          <p className="max-w-2xl border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground">
            Los grupos son conjuntos lógicos de depósitos físicos usados para tratar varios depósitos como una sola unidad
            operativa (capacidad y stock sumados). El movimiento de stock sigue registrándose por lotes y por depósito.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-400">
          Error cargando datos: {error instanceof Error ? error.message : String(error)}
        </p>
      ) : null}
      {batchesQ.error ? (
        <p className="text-sm text-red-400">
          Error lotes: {batchesQ.error instanceof Error ? batchesQ.error.message : String(batchesQ.error)}
        </p>
      ) : null}
      {settingsQ.error ? (
        <p className="text-sm text-red-400">No se pudo cargar configuración para badges de riesgo.</p>
      ) : null}

      {stockMainView === "deposits" ? (
      <PanelCard
        icon={Package}
        title="Depósitos"
        description="Agrupados por la primera palabra del nombre. Elegí una zona y tocá un depósito para ver resumen y acciones."
      >
          <div className="mb-5 flex flex-wrap gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select className={selectClass} value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
                <option value="all">Todos</option>
                {(typesQ.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Activo</span>
              <select
                className={selectClass}
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Stock</span>
              <select
                className={selectClass}
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              >
                <option value="all">Todos</option>
                <option value="with">Con stock</option>
                <option value="without">Sin stock</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Orden</span>
              <select
                className={selectClass}
                value={depositSort}
                onChange={(e) => setDepositSort(e.target.value as DepositSort)}
              >
                <option value="fullness">Más llenos</option>
                <option value="emptiness">Más vacíos</option>
                <option value="nombre">Nombre A-Z</option>
              </select>
            </label>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando depósitos…</p>
          ) : filteredSortedDeposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún depósito con estos filtros.</p>
          ) : (
            <div className="space-y-2">
              {(depositsQuery.isFetching || metricsQuery.isFetching) ? (
                <p className="text-xs text-muted-foreground">Actualizando datos…</p>
              ) : null}
              <DepositsByZone
                deposits={filteredSortedDeposits}
                depositSort={depositSort}
                onSelectDeposit={(d) => {
                  setSelectedDepositDetail(d);
                  setDepositDetailOpen(true);
                }}
                onExtractDeposit={(d) => {
                  setExtractDepositRow(d);
                  setExtractDepositOpen(true);
                }}
                onQuickAdjust={(d, deltaKg) => {
                  void (async () => {
                    if (deltaKg < 0) {
                      await stockOps.extractFromDeposit.mutateAsync({
                        deposito_id: d.id,
                        cantidad_meta_kilos: Math.abs(deltaKg),
                        motivo: `Shortcut rápido ${deltaKg} kg`,
                      });
                      return;
                    }
                    await intakeMut.mutateAsync({
                      deposito_id: d.id,
                      cantidad_meta_kilos: deltaKg,
                      fecha_guardado: format(new Date(), "yyyy-MM-dd"),
                      observaciones: `Shortcut rápido +${deltaKg} kg`,
                      metadata: { modo_ingreso: "selector_rapido", selector_kg: deltaKg },
                    });
                  })();
                }}
                quickAdjustBusy={stockOps.extractFromDeposit.isPending || intakeMut.isPending}
              />
            </div>
          )}
      </PanelCard>
      ) : (
        <StorageGroupsSection userId={user?.id} isAdmin={isAdmin} batches={batchesQ.data ?? []} />
      )}

      <DepositFormDialog
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
        mode={depositMode}
        deposit={depositMode === "edit" ? depositEditing : null}
        types={typesQ.data ?? []}
        isSubmitting={create.isPending || update.isPending}
        onSubmit={async (input) => {
          if (depositMode === "create") {
            await create.mutateAsync(input);
          } else if (depositEditing) {
            await update.mutateAsync({ id: depositEditing.id, input });
          }
          setDepositDialogOpen(false);
        }}
      />

      <DepositDetailDialog
        open={depositDetailOpen}
        onOpenChange={setDepositDetailOpen}
        deposit={selectedDepositDetail}
        isAdmin={isAdmin}
        onRegisterIntake={() => {
          setIntakePreferredDepositoId(selectedDepositDetail?.id ?? null);
          setIntakeOpen(true);
        }}
        onEditDeposit={() => {
          if (!selectedDepositDetail) return;
          setDepositMode("edit");
          setDepositEditing(selectedDepositDetail);
          setDepositDialogOpen(true);
          setDepositDetailOpen(false);
        }}
        onEmptyDeposit={() => {
          if (!selectedDepositDetail) return;
          setEmptyDepositRow(selectedDepositDetail);
          setEmptyDepositOpen(true);
          setDepositDetailOpen(false);
        }}
        onDeactivateDeposit={
          isAdmin
            ? () => {
                if (!selectedDepositDetail) return;
                setPendingDeactivate(selectedDepositDetail);
              }
            : undefined
        }
      />

      <StockIntakeDialog
        open={intakeOpen}
        onOpenChange={(open) => {
          setIntakeOpen(open);
          if (!open) setIntakePreferredDepositoId(null);
        }}
        deposits={rows ?? []}
        preferredDepositoId={intakePreferredDepositoId}
        isSubmitting={intakeMut.isPending}
        onSubmit={async (input) => {
          await intakeMut.mutateAsync(input);
          setIntakeOpen(false);
        }}
      />

      <EmptyDepositDialog
        open={emptyDepositOpen}
        onOpenChange={(o) => {
          setEmptyDepositOpen(o);
          if (!o) setEmptyDepositRow(null);
        }}
        deposit={emptyDepositRow}
        isSubmitting={stockOps.emptyDeposit.isPending}
        onSubmit={async (input) => {
          await stockOps.emptyDeposit.mutateAsync(input);
          setEmptyDepositOpen(false);
          setEmptyDepositRow(null);
        }}
      />

      <ExtractDepositDialog
        open={extractDepositOpen}
        onOpenChange={(o) => {
          setExtractDepositOpen(o);
          if (!o) setExtractDepositRow(null);
        }}
        deposit={extractDepositRow}
        isSubmitting={stockOps.extractFromDeposit.isPending}
        onSubmit={async (input) => {
          await stockOps.extractFromDeposit.mutateAsync(input);
        }}
      />

      <Dialog open={pendingDeactivate !== null} onOpenChange={(o) => !o && setPendingDeactivate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar depósito</DialogTitle>
            <DialogDescription>
              No se borra el registro. Quedará inactivo y no podrás editarlo desde esta tabla hasta que se reactiva
              (próximas versiones). Depósito:{" "}
              <strong>{pendingDeactivate?.nombre}</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPendingDeactivate(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deactivate.isPending}
              onClick={async () => {
                if (!pendingDeactivate) return;
                await deactivate.mutateAsync(pendingDeactivate.id);
                setPendingDeactivate(null);
              }}
            >
              {deactivate.isPending ? "Desactivando…" : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
