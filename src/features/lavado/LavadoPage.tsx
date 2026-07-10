import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, PlayCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader, PageShell, PanelCard } from "@/components/shell";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { ActiveTandaCard } from "./components/ActiveTandaCard";
import { LavadoCalculatorPanel } from "./components/LavadoCalculatorPanel";
import { LavadoConfigPanel, LavadoHistoryPanel } from "./components/LavadoHistoryPanel";
import { LavadoMoneyCounterPanel } from "./components/LavadoMoneyCounterPanel";
import { lavadoActiveMetrics, LavadoStatsSection } from "./components/LavadoStatsSection";
import { WarehouseTandaPanel } from "./components/WarehouseTandaPanel";
import { useLavadoDiscordWebhooks } from "./hooks/useLavadoDiscordWebhooks";
import { useLavadoReconcile } from "./hooks/useLavadoReconcile";
import { LAVADO_ALMACENES, type LavadoAlmacenId } from "./lavadoConstants";
import { num } from "./lavadoFormatters";
import { type LavadoConfigSnapshot, type LavadoProcesoId } from "./lavadoMath";
import { lavadoQueryKeys } from "./lavadoQueryKeys";
import {
  cancelLavadoTanda,
  completeLavadoTanda,
  createLavadoTanda,
  fetchLavadoConfig,
  fetchLavadoMoneySummary,
  fetchLavadoTandasActivas,
  fetchLavadoTandasHistorial,
  updateLavadoConfig,
  type LavadoConfigRow,
} from "./lavadoService";

function toConfigSnapshot(c: LavadoConfigRow): LavadoConfigSnapshot {
  return {
    procesos: [
      {
        id: "imprimir",
        nombre: "Imprimir",
        perdida: num(c.perdida_proceso_1),
        minimo: num(c.min_proceso_1),
        maximo: num(c.max_proceso_1),
        estaciones: num(c.estaciones_p1),
        automatico: true,
        baseMinutos: num(c.duracion_base_p1_minutos),
      },
      {
        id: "cortar",
        nombre: "Cortar",
        perdida: num(c.perdida_proceso_2),
        minimo: num(c.min_proceso_2),
        maximo: num(c.max_proceso_2),
        estaciones: num(c.estaciones_p2),
        automatico: false,
        manualSegundos: num(c.duracion_manual_p2_segundos),
      },
      {
        id: "secar",
        nombre: "Secar",
        perdida: num(c.perdida_proceso_3),
        minimo: num(c.min_proceso_3),
        maximo: num(c.max_proceso_3),
        estaciones: num(c.estaciones_p3),
        automatico: true,
        baseMinutos: num(c.duracion_base_p3_minutos),
      },
      {
        id: "contar",
        nombre: "Contar",
        perdida: num(c.perdida_proceso_4),
        minimo: num(c.min_proceso_4),
        maximo: num(c.max_proceso_4),
        estaciones: num(c.estaciones_p4),
        automatico: false,
        manualSegundos: num(c.duracion_manual_p4_segundos),
      },
    ],
  };
}

export function LavadoPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const calcEditedRef = useRef(false);
  const [calcAmount, setCalcAmount] = useState("");
  const [calcMode, setCalcMode] = useState<"pipeline" | "sequential">("pipeline");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useLavadoReconcile();

  const configQ = useQuery({
    queryKey: lavadoQueryKeys.config,
    queryFn: fetchLavadoConfig,
    staleTime: 60_000,
  });
  const appSettingsQ = useAppSettingsQuery();
  const activeQ = useQuery({
    queryKey: lavadoQueryKeys.tandasActivas,
    queryFn: fetchLavadoTandasActivas,
    refetchInterval: 15_000,
  });
  const historyQ = useQuery({
    queryKey: lavadoQueryKeys.tandasHistorial(0),
    queryFn: () => fetchLavadoTandasHistorial(50, 0),
    enabled: historyOpen,
    staleTime: 30_000,
  });
  const moneySummaryQ = useQuery({
    queryKey: lavadoQueryKeys.moneySummary,
    queryFn: fetchLavadoMoneySummary,
    staleTime: 60_000,
  });

  const invalidateLavado = useCallback(() => {
    void qc.invalidateQueries({ queryKey: lavadoQueryKeys.tandasActivas });
    void qc.invalidateQueries({ queryKey: lavadoQueryKeys.moneySummary });
    if (historyOpen) void qc.invalidateQueries({ queryKey: lavadoQueryKeys.tandasHistorial(0) });
  }, [historyOpen, qc]);

  const updateConfigM = useMutation({
    mutationFn: (form: LavadoConfigRow) =>
      updateLavadoConfig({
        perdida_proceso_1: form.perdida_proceso_1,
        perdida_proceso_2: form.perdida_proceso_2,
        perdida_proceso_3: form.perdida_proceso_3,
        perdida_proceso_4: form.perdida_proceso_4,
        min_proceso_1: form.min_proceso_1,
        max_proceso_1: form.max_proceso_1,
        min_proceso_2: form.min_proceso_2,
        max_proceso_2: form.max_proceso_2,
        min_proceso_3: form.min_proceso_3,
        max_proceso_3: form.max_proceso_3,
        min_proceso_4: form.min_proceso_4,
        max_proceso_4: form.max_proceso_4,
        duracion_base_p1_minutos: form.duracion_base_p1_minutos,
        duracion_base_p3_minutos: form.duracion_base_p3_minutos,
        duracion_manual_p2_segundos: form.duracion_manual_p2_segundos,
        duracion_manual_p4_segundos: form.duracion_manual_p4_segundos,
        estaciones_p1: form.estaciones_p1,
        estaciones_p2: form.estaciones_p2,
        estaciones_p3: form.estaciones_p3,
        estaciones_p4: form.estaciones_p4,
        discord_webhook_url: form.discord_webhook_url,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: lavadoQueryKeys.config }),
  });

  const createM = useMutation({
    mutationFn: (input: { almacen: LavadoAlmacenId; process: LavadoProcesoId; amount: number; station: number }) => {
      if (!profile?.id || !configQ.data) throw new Error("Sesión o configuración no disponible.");
      return createLavadoTanda({
        userId: profile.id,
        almacen: input.almacen,
        process: input.process,
        amount: input.amount,
        station: input.station,
        config: configQ.data,
      });
    },
    onSuccess: invalidateLavado,
    onError: (e: Error) => setActionError(e.message),
  });

  const completeM = useMutation({
    mutationFn: completeLavadoTanda,
    onSuccess: invalidateLavado,
    onError: (e: Error) => setActionError(e.message),
  });

  const cancelM = useMutation({
    mutationFn: cancelLavadoTanda,
    onSuccess: invalidateLavado,
    onError: (e: Error) => setActionError(e.message),
  });

  const handleComplete = useCallback((id: string) => completeM.mutate(id), [completeM]);
  const handleCancel = useCallback((id: string) => cancelM.mutate(id), [cancelM]);

  const config = configQ.data;
  const active = activeQ.data ?? [];
  const { sorted: activeSorted, totalInProcess, totalOutEstimated } = useMemo(
    () => lavadoActiveMetrics(active),
    [active]
  );

  const snapshot = useMemo(() => (config ? toConfigSnapshot(config) : null), [config]);
  const printCfg = useMemo(() => snapshot?.procesos.find((p) => p.id === "imprimir") ?? null, [snapshot]);
  const dryCfg = useMemo(() => snapshot?.procesos.find((p) => p.id === "secar") ?? null, [snapshot]);

  useEffect(() => {
    if (printCfg && !calcEditedRef.current) setCalcAmount(String(printCfg.maximo));
  }, [printCfg?.maximo]);

  const webhookUrl = (appSettingsQ.data as { discord_webhook_url?: string | null } | undefined)?.discord_webhook_url?.trim();
  useLavadoDiscordWebhooks({ active, profile, webhookUrl: webhookUrl || undefined });

  const pageError =
    configQ.isError || activeQ.isError
      ? ((configQ.error ?? activeQ.error) as Error)?.message ?? "Error al cargar datos de lavado."
      : null;

  return (
    <PageShell className="flex flex-col gap-4">
      <PageHeader
        title="Lavado"
        description="Control operativo por almacén (Liquid y Growshop). Cada timer indica almacén, proceso y estación."
      />

      {pageError ? <p className="shrink-0 text-sm text-red-400">{pageError}</p> : null}
      {actionError ? (
        <p className="shrink-0 text-sm text-red-400">
          {actionError}{" "}
          <button type="button" className="underline" onClick={() => setActionError(null)}>
            Cerrar
          </button>
        </p>
      ) : null}

      <div className="shrink-0">
        <LavadoStatsSection active={activeSorted} totalInProcess={totalInProcess} totalOutEstimated={totalOutEstimated} />
      </div>

      <section className="grid shrink-0 gap-4 xl:grid-cols-5 xl:items-stretch">
        <PanelCard
          icon={PlayCircle}
          title="Nueva tanda"
          description="Imprimir E1 · Secar E1/E2 por almacén"
          className="h-full xl:col-span-3"
          contentClassName="flex min-h-0 flex-1 flex-col"
        >
          {configQ.isLoading && !config ? (
            <p className="text-sm text-muted-foreground">Cargando configuración…</p>
          ) : (
            <div className="grid h-full min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:items-stretch">
              {LAVADO_ALMACENES.map((alm) => (
                <WarehouseTandaPanel
                  key={alm.id}
                  almacen={alm.id}
                  label={alm.label}
                  printCfg={printCfg}
                  dryCfg={dryCfg}
                  active={active}
                  isPending={createM.isPending}
                  onStart={(input) => createM.mutate({ almacen: alm.id, ...input })}
                />
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard
          icon={Clock3}
          title="Tandas activas"
          description={`${active.length} en curso`}
          className="h-full xl:col-span-2"
          contentClassName="flex min-h-0 flex-1 flex-col"
        >
          {activeQ.isLoading && active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cargando tandas…</p>
          ) : activeSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tandas activas.</p>
          ) : (
            <div className="grid h-full min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-1.5 sm:grid-cols-3">
              {activeSorted.map((t) => (
                <ActiveTandaCard key={t.id} tanda={t} onComplete={handleComplete} onCancel={handleCancel} />
              ))}
            </div>
          )}
        </PanelCard>
      </section>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <LavadoMoneyCounterPanel
          summary={moneySummaryQ.data}
          isLoading={moneySummaryQ.isLoading}
          isError={moneySummaryQ.isError}
        />

        <section className="grid w-full shrink-0 gap-3 lg:grid-cols-2">
        <LavadoCalculatorPanel
          snapshot={snapshot}
          calcAmount={calcAmount}
          onCalcAmountChange={(v) => {
            calcEditedRef.current = true;
            setCalcAmount(v);
          }}
          calcMode={calcMode}
          onCalcModeChange={setCalcMode}
        />
        <LavadoHistoryPanel
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          history={historyQ.data ?? []}
          isLoading={historyQ.isLoading}
          isError={historyQ.isError}
        />
        {isAdmin && config ? (
          <LavadoConfigPanel config={config} saving={updateConfigM.isPending} onSave={(form) => updateConfigM.mutate(form)} />
        ) : null}
        </section>
      </div>
    </PageShell>
  );
}
