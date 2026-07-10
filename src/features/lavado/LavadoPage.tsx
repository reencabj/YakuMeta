import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, DollarSign, Droplets, FlaskConical, PlayCircle, Settings, Timer, X } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader, PageShell, PanelCard, StatTile } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { cn } from "@/lib/utils";
import {
  cancelLavadoTanda,
  completeLavadoTanda,
  createLavadoTanda,
  fetchLavadoConfig,
  fetchLavadoMoneySummary,
  fetchLavadoTandas,
  sendLavadoDiscordWebhookFinished,
  sendLavadoDiscordWebhookStarted,
  updateLavadoConfig,
  type LavadoConfigRow,
  type LavadoMoneySummary,
} from "./lavadoService";
import { estimatePipeline, formatDuration, processDurationSeconds, type LavadoConfigSnapshot, type LavadoProcesoConfig, type LavadoProcesoId } from "./lavadoMath";
import {
  LAVADO_ALMACENES,
  lavadoAlmacenLabel,
  PROCESS_META,
  type LavadoAlmacenId,
} from "./lavadoConstants";
import type { LavadoTandaRow } from "./lavadoService";

function asPct(n: number) {
  return Math.round(n * 10000) / 100;
}

function num(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function moneyCompact(n: number) {
  const v = num(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${money(v)}`;
}

function playTandaFinishedBeep() {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = [880, 988, 1174, 1318];
    const toneDuration = 0.12;
    const gap = 0.06;
    const startAt = ctx.currentTime + 0.01;

    tones.forEach((freq, index) => {
      const t0 = startAt + index * (toneDuration + gap);
      const t1 = t0 + toneDuration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.01);
    });

    const total = tones.length * (toneDuration + gap) + 0.12;
    window.setTimeout(() => void ctx.close(), Math.ceil(total * 1000));
  } catch {
    // Si el navegador bloquea audio sin interacción previa, ignoramos silenciosamente.
  }
}

function tandaDurationLabel(cfg: LavadoProcesoConfig | null, amountRaw: string): string | null {
  if (!cfg) return null;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < cfg.minimo || amount > cfg.maximo) return null;
  return formatDuration(processDurationSeconds(cfg, amount));
}

function firstFreeStation(totalStations: number, occupied: Set<string>) {
  for (let i = 1; i <= Math.max(1, totalStations); i += 1) {
    const s = String(i);
    if (!occupied.has(s)) return s;
  }
  return "1";
}

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
  const [now, setNow] = useState(Date.now());
  const [calcAmount, setCalcAmount] = useState("100000");
  const [calcMode, setCalcMode] = useState<"pipeline" | "sequential">("pipeline");
  const finishedAlertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const configQ = useQuery({ queryKey: ["lavado", "config"], queryFn: fetchLavadoConfig });
  const appSettingsQ = useAppSettingsQuery();
  const tandasQ = useQuery({ queryKey: ["lavado", "tandas"], queryFn: fetchLavadoTandas, refetchInterval: 15_000 });
  const moneySummaryQ = useQuery({ queryKey: ["lavado", "money-summary"], queryFn: fetchLavadoMoneySummary });

  const invalidateLavado = () => {
    void qc.invalidateQueries({ queryKey: ["lavado", "tandas"] });
    void qc.invalidateQueries({ queryKey: ["lavado", "money-summary"] });
  };

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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado", "config"] }),
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
    onError: (e: Error) => window.alert(e.message),
  });
  const completeM = useMutation({
    mutationFn: completeLavadoTanda,
    onSuccess: invalidateLavado,
  });
  const cancelM = useMutation({
    mutationFn: cancelLavadoTanda,
    onSuccess: invalidateLavado,
  });

  const config = configQ.data;
  const tandas = useMemo(() => tandasQ.data ?? [], [tandasQ.data]);
  const active = useMemo(() => tandas.filter((t) => t.estado === "activo"), [tandas]);
  const activeByRemaining = useMemo(
    () =>
      [...active].sort(
        (a, b) => new Date(a.finaliza_estimado_at).getTime() - new Date(b.finaliza_estimado_at).getTime()
      ),
    [active]
  );
  const history = useMemo(() => tandas.filter((t) => t.estado !== "activo"), [tandas]);
  const totalInProcess = active
    .filter((t) => t.proceso === "imprimir")
    .reduce((acc, t) => acc + num(t.monto_entrada), 0);
  const totalOutEstimated = active
    .filter((t) => t.proceso === "secar")
    .reduce((acc, t) => acc + num(t.monto_salida_esperado), 0);
  const nextToFinish = [...active].sort(
    (a, b) => new Date(a.finaliza_estimado_at).getTime() - new Date(b.finaliza_estimado_at).getTime()
  )[0];

  useEffect(() => {
    const activeIds = new Set(active.map((t) => t.id));
    const alerted = finishedAlertedRef.current;
    for (const id of [...alerted]) {
      if (!activeIds.has(id)) alerted.delete(id);
    }

    for (const tanda of active) {
      const remaining = Math.max(0, Math.round((new Date(tanda.finaliza_estimado_at).getTime() - now) / 1000));
      if (remaining === 0 && !alerted.has(tanda.id)) {
        alerted.add(tanda.id);
        playTandaFinishedBeep();
      }
    }
  }, [active, now]);

  const snapshot = useMemo(() => (config ? toConfigSnapshot(config) : null), [config]);
  const calc = useMemo(
    () => (snapshot ? estimatePipeline(snapshot, Math.max(0, Number(calcAmount) || 0)) : null),
    [snapshot, calcAmount]
  );

  const printCfg = useMemo(() => snapshot?.procesos.find((p) => p.id === "imprimir") ?? null, [snapshot]);
  const dryCfg = useMemo(() => snapshot?.procesos.find((p) => p.id === "secar") ?? null, [snapshot]);

  useEffect(() => {
    if (!profile) return;
    const webhook = (appSettingsQ.data as { discord_webhook_url?: string | null } | undefined)?.discord_webhook_url?.trim();
    if (!webhook) return;
    const pendingStart = active.filter((t) => !t.webhook_started_notified_at);
    for (const tanda of pendingStart) {
      void sendLavadoDiscordWebhookStarted({
        tanda,
        username: profile.display_name ?? profile.username ?? "Usuario",
        webhookUrl: webhook,
      });
    }
  }, [active, appSettingsQ.data, profile]);

  useEffect(() => {
    if (!profile) return;
    const webhook = (appSettingsQ.data as { discord_webhook_url?: string | null } | undefined)?.discord_webhook_url?.trim();
    if (!webhook) return;
    const nowMs = now;
    const dueByTimer = active.filter(
      (t) => !t.webhook_notified_at && new Date(t.finaliza_estimado_at).getTime() <= nowMs
    );
    for (const tanda of dueByTimer) {
      void sendLavadoDiscordWebhookFinished({
        tanda,
        username: profile.display_name ?? profile.username ?? "Usuario",
        webhookUrl: webhook,
      });
    }
  }, [active, appSettingsQ.data, now, profile]);

  return (
    <PageShell className="gap-4">
      <PageHeader
        title="Lavado"
        description="Control operativo por almacén (Liquid y Growshop). Cada timer indica almacén, proceso y estación."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Timer} label="Lavado activo" value={String(active.length)} unit="tandas" tone="slate" dense />
        <StatTile icon={Droplets} label="En imprimir (activo)" value={`$${money(totalInProcess)}`} unit="USD" tone="amber" dense />
        <StatTile icon={FlaskConical} label="En secado (salida est.)" value={`$${money(totalOutEstimated)}`} unit="USD" tone="emerald" dense />
        <StatTile
          icon={Clock3}
          label="Próxima tanda en finalizar"
          value={nextToFinish ? formatDuration(Math.max(0, (new Date(nextToFinish.finaliza_estimado_at).getTime() - now) / 1000)) : "—"}
          unit=""
          tone="rose"
          dense
        />
      </section>

      <section className="grid min-h-0 gap-3 xl:grid-cols-2">
      <PanelCard
        icon={PlayCircle}
        title="Nueva tanda"
        description="Liquid y Growshop · imprimir E1 · secar E1/E2"
        className="self-start overflow-hidden xl:col-span-2"
      >
        <div className="grid gap-2 lg:grid-cols-2">
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
      </PanelCard>

      <PanelCard
        icon={Clock3}
        title="Tandas activas"
        description={`${active.length} en curso`}
        className="self-start overflow-hidden min-h-0 xl:col-span-2"
      >
        {activeByRemaining.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tandas activas.</p>
        ) : (
          <div className="flex flex-wrap content-start gap-1.5">
            {activeByRemaining.map((t) => (
              <ActiveTandaCard
                key={t.id}
                tanda={t}
                now={now}
                onComplete={() => completeM.mutate(t.id)}
                onCancel={() => cancelM.mutate(t.id)}
              />
            ))}
          </div>
        )}
      </PanelCard>

      {config ? (
        <PanelCard
          icon={Settings}
          title="Configuración"
          description="Editable por admin. Duración al máximo = tiempo con carga máxima de la máquina."
          className="overflow-visible min-h-0 self-start"
        >
          <div className="pr-1">
            <LavadoConfigForm
              config={config}
              canEdit={profile?.role === "admin"}
              saving={updateConfigM.isPending}
              onSave={(form) => updateConfigM.mutate(form)}
            />
          </div>
        </PanelCard>
      ) : null}

      <PanelCard
        icon={FlaskConical}
        title="Calculadora"
        description="Pérdidas encadenadas y tiempo (automáticos: proporcional al máximo de cada máquina)."
        className="min-h-0 overflow-hidden self-start"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-xs">
            <FieldInput label="Monto inicial" value={calcAmount} onChange={setCalcAmount} />
          </div>
          <div className="inline-flex rounded-md border border-border/60 bg-muted/20 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCalcMode("pipeline")}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                calcMode === "pipeline" ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setCalcMode("sequential")}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                calcMode === "sequential" ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Secuencial
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-muted/25 p-3 text-sm leading-relaxed">
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Final limpio</span>
              <span className="whitespace-nowrap">${money(calc?.finalAmount ?? 0)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Pérdida total</span>
              <span className="whitespace-nowrap">${money(calc?.totalLoss ?? 0)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Pérdida %</span>
              <span className="whitespace-nowrap">{((calc?.totalLossPct ?? 0) || 0).toFixed(2)}%</span>
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 p-3 text-sm leading-relaxed">
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Rendimiento final</span>
              <span className="whitespace-nowrap">{(calc?.finalPct ?? 0).toFixed(2)}%</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Tiempo total ({calcMode === "pipeline" ? "pipeline" : "secuencial"})</span>
              <span className="whitespace-nowrap">
                {formatDuration(calcMode === "pipeline" ? calc?.totalSeconds ?? 0 : calc?.sequentialTotalSeconds ?? 0)}
              </span>
            </p>
            {calcMode === "pipeline" ? (
              <>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Primera salida</span>
                  <span className="whitespace-nowrap">{formatDuration(calc?.firstOutputSeconds ?? 0)}</span>
                </p>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-8 w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proceso</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Pérdida</TableHead>
                <TableHead>Tandas</TableHead>
                <TableHead>Tiempo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(calc?.steps ?? []).map((s) => (
                <TableRow key={s.proceso}>
                  <TableCell>{s.nombre}</TableCell>
                  <TableCell>${money(s.entrada)}</TableCell>
                  <TableCell>${money(s.salida)}</TableCell>
                  <TableCell>{s.perdidaPct.toFixed(2)}%</TableCell>
                  <TableCell>{s.tandas}</TableCell>
                  <TableCell>{formatDuration(s.segundosAjustadoEstaciones)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>
      </section>

      <PanelCard icon={Clock3} title="Historial" description="Tandas completadas o canceladas." className="min-h-0">
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Ver historial</summary>
          <div className="mt-3 max-h-[280px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inicio</TableHead>
              <TableHead>Almacén</TableHead>
              <TableHead>Proceso</TableHead>
              <TableHead>Estación</TableHead>
              <TableHead>Monto entrada</TableHead>
              <TableHead>Monto salida</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Webhook</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{new Date(t.iniciado_at).toLocaleString("es-AR")}</TableCell>
                <TableCell>{lavadoAlmacenLabel(t.almacen)}</TableCell>
                <TableCell>{PROCESS_META[t.proceso].label}</TableCell>
                <TableCell>E{t.estacion}</TableCell>
                <TableCell>${money(num(t.monto_entrada))}</TableCell>
                <TableCell>${money(num(t.monto_salida_esperado))}</TableCell>
                <TableCell>{t.estado}</TableCell>
                <TableCell>{t.webhook_notified_at ? "enviado" : "pendiente"}</TableCell>
              </TableRow>
            ))}
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                  Sin tandas finalizadas todavía.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
          </div>
        </details>
      </PanelCard>

      <LavadoMoneyCounterPanel summary={moneySummaryQ.data} isLoading={moneySummaryQ.isLoading} />
    </PageShell>
  );
}

function LavadoMoneyCounterPanel(props: { summary: LavadoMoneySummary | undefined; isLoading: boolean }) {
  const totals = props.summary?.totals;
  const byAlmacen = props.summary?.byAlmacen ?? [];

  const ingresado = num(totals?.ingresado_completado);
  const salida = num(totals?.salida_completado);
  const perdida = ingresado - salida;
  const perdidaPct = ingresado > 0 ? (perdida / ingresado) * 100 : 0;
  const ingresadoActivo = num(totals?.ingresado_activo);
  const salidaActivo = num(totals?.salida_activo);
  const imprimirCompletadas = num(totals?.tandas_imprimir_completadas);
  const secarCompletadas = num(totals?.tandas_secar_completadas);

  const rowsByAlmacen = LAVADO_ALMACENES.map((alm) => {
    const row = byAlmacen.find((r) => r.almacen === alm.id);
    const ing = num(row?.ingresado_completado);
    const out = num(row?.salida_completado);
    return {
      id: alm.id,
      label: alm.label,
      ingresado: ing,
      salida: out,
      perdida: ing - out,
      imprimirCompletadas: num(row?.tandas_imprimir_completadas),
      secarCompletadas: num(row?.tandas_secar_completadas),
      ingresadoActivo: num(row?.ingresado_activo),
      salidaActivo: num(row?.salida_activo),
    };
  });

  return (
    <PanelCard
      icon={DollarSign}
      title="Contador de dinero lavado"
      description="Entrada acumulada en imprimir · salida acumulada en secar (tandas completadas)."
    >
      {props.isLoading && !props.summary ? (
        <p className="text-sm text-muted-foreground">Cargando totales…</p>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={DollarSign}
              label="Ingresado (imprimir)"
              value={`$${money(ingresado)}`}
              unit="USD"
              hint={`${imprimirCompletadas} tandas de impresión`}
              tone="amber"
              dense
            />
            <StatTile
              icon={FlaskConical}
              label="Sacado (secado)"
              value={`$${money(salida)}`}
              unit="USD"
              hint={`${secarCompletadas} tandas de secado`}
              tone="emerald"
              dense
            />
            <StatTile
              icon={Droplets}
              label="Pérdida acumulada"
              value={`$${money(perdida)}`}
              unit={ingresado > 0 ? `${asPct(perdidaPct / 100)}%` : ""}
              tone="rose"
              dense
            />
            <StatTile
              icon={Timer}
              label="En curso ahora"
              value={`$${money(ingresadoActivo)}`}
              unit={`→ $${moneyCompact(salidaActivo)}`}
              hint="Imprimir activo → secado activo (salida est.)"
              tone="slate"
              dense
            />
          </section>

          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Ingresado</TableHead>
                  <TableHead className="text-right">Sacado</TableHead>
                  <TableHead className="text-right">Pérdida</TableHead>
                  <TableHead className="text-right">Imp. / Sec.</TableHead>
                  <TableHead className="text-right">Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsByAlmacen.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">${money(row.ingresado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${money(row.salida)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">${money(row.perdida)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {row.imprimirCompletadas} / {row.secarCompletadas}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {row.ingresadoActivo > 0 || row.salidaActivo > 0
                        ? `$${moneyCompact(row.ingresadoActivo)} → $${moneyCompact(row.salidaActivo)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </PanelCard>
  );
}

function ActiveTandaCard(props: {
  tanda: LavadoTandaRow;
  now: number;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const t = props.tanda;
  const remaining = Math.max(0, Math.round((new Date(t.finaliza_estimado_at).getTime() - props.now) / 1000));
  const done = remaining === 0;

  return (
    <div
      className={cn(
        "flex size-[9.375rem] shrink-0 flex-col overflow-hidden rounded-md border border-border/60 bg-muted/15 p-2.5",
        done && "animate-pulse border-emerald-400/50 bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/35"
      )}
    >
      <div className="shrink-0 space-y-1">
        <p className="truncate text-xs font-semibold leading-none">{lavadoAlmacenLabel(t.almacen)}</p>
        <p className="truncate text-[11px] leading-none text-muted-foreground">
          {PROCESS_META[t.proceso].label} · E{t.estacion}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-1">
        <p
          className={cn(
            "max-w-full truncate text-center font-mono text-base font-semibold tabular-nums leading-none",
            done ? "text-emerald-400" : "text-foreground"
          )}
        >
          {formatDuration(remaining)}
        </p>
      </div>

      <p className="shrink-0 truncate text-center text-[11px] leading-none tabular-nums text-muted-foreground">
        {moneyCompact(num(t.monto_entrada))} → {moneyCompact(num(t.monto_salida_esperado))}
      </p>

      <div className="mt-1.5 grid shrink-0 grid-cols-2 gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 min-w-0 gap-1 px-1.5 text-[11px] leading-none"
          onClick={props.onComplete}
          title="Completar"
        >
          <Check className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Listo</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 min-w-0 gap-1 px-1.5 text-[11px] leading-none text-red-400 hover:text-red-300"
          onClick={props.onCancel}
          title="Cancelar"
        >
          <X className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Cancelar</span>
        </Button>
      </div>
    </div>
  );
}

function WarehouseTandaPanel(props: {
  almacen: LavadoAlmacenId;
  label: string;
  printCfg: LavadoProcesoConfig | null;
  dryCfg: LavadoProcesoConfig | null;
  active: LavadoTandaRow[];
  isPending: boolean;
  onStart: (input: { process: LavadoProcesoId; amount: number; station: number }) => void;
}) {
  const [printAmount, setPrintAmount] = useState("100000");
  const [printStation, setPrintStation] = useState("1");
  const [dryAmount, setDryAmount] = useState("100000");
  const [dryStation, setDryStation] = useState("1");

  const warehouseActive = useMemo(
    () => props.active.filter((t) => t.almacen === props.almacen),
    [props.active, props.almacen]
  );
  const occupiedPrintStations = useMemo(
    () => new Set(warehouseActive.filter((t) => t.proceso === "imprimir").map((t) => String(t.estacion))),
    [warehouseActive]
  );
  const occupiedDryStations = useMemo(
    () => new Set(warehouseActive.filter((t) => t.proceso === "secar").map((t) => String(t.estacion))),
    [warehouseActive]
  );

  useEffect(() => {
    const total = props.printCfg?.estaciones ?? 1;
    const currentBusy = occupiedPrintStations.has(printStation);
    const currentOutOfRange = Number(printStation) < 1 || Number(printStation) > total;
    if (currentBusy || currentOutOfRange) {
      setPrintStation(firstFreeStation(total, occupiedPrintStations));
    }
  }, [occupiedPrintStations, props.printCfg?.estaciones, printStation]);

  useEffect(() => {
    const total = props.dryCfg?.estaciones ?? 1;
    const currentBusy = occupiedDryStations.has(dryStation);
    const currentOutOfRange = Number(dryStation) < 1 || Number(dryStation) > total;
    if (currentBusy || currentOutOfRange) {
      setDryStation(firstFreeStation(total, occupiedDryStations));
    }
  }, [props.dryCfg?.estaciones, dryStation, occupiedDryStations]);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold leading-none">{props.label}</p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {warehouseActive.length} activa{warehouseActive.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CompactProcessBlock
          title="Imprimir · E1"
          hint={`${PROCESS_META.imprimir.in} → ${PROCESS_META.imprimir.out}`}
          amount={printAmount}
          onAmountChange={setPrintAmount}
          station={printStation}
          onStationSelect={setPrintStation}
          totalStations={props.printCfg?.estaciones ?? 1}
          occupied={occupiedPrintStations}
          expectedOutput={props.printCfg ? (Number(printAmount) || 0) * (1 - props.printCfg.perdida) : 0}
          estimatedDuration={tandaDurationLabel(props.printCfg, printAmount)}
          minAmount={props.printCfg?.minimo}
          maxAmount={props.printCfg?.maximo}
          buttonLabel="Imprimir"
          isPending={props.isPending}
          onStart={() =>
            props.onStart({ process: "imprimir", amount: Number(printAmount), station: Number(printStation) })
          }
        />
        <CompactProcessBlock
          title="Secar · E1, E2"
          hint={`${PROCESS_META.secar.in} → ${PROCESS_META.secar.out}`}
          amount={dryAmount}
          onAmountChange={setDryAmount}
          station={dryStation}
          onStationSelect={setDryStation}
          totalStations={props.dryCfg?.estaciones ?? 1}
          occupied={occupiedDryStations}
          expectedOutput={props.dryCfg ? (Number(dryAmount) || 0) * (1 - props.dryCfg.perdida) : 0}
          estimatedDuration={tandaDurationLabel(props.dryCfg, dryAmount)}
          minAmount={props.dryCfg?.minimo}
          maxAmount={props.dryCfg?.maximo}
          buttonLabel="Secar"
          isPending={props.isPending}
          onStart={() =>
            props.onStart({ process: "secar", amount: Number(dryAmount), station: Number(dryStation) })
          }
        />
      </div>
    </div>
  );
}

function CompactProcessBlock(props: {
  title: string;
  hint: string;
  amount: string;
  onAmountChange: (v: string) => void;
  station: string;
  onStationSelect: (v: string) => void;
  totalStations: number;
  occupied: Set<string>;
  expectedOutput: number;
  estimatedDuration: string | null;
  minAmount?: number;
  maxAmount?: number;
  buttonLabel: string;
  isPending: boolean;
  onStart: () => void;
}) {
  const amountNum = Number(props.amount);
  const hasAmount = props.amount.trim() !== "" && Number.isFinite(amountNum);
  const outOfRange =
    hasAmount &&
    props.minAmount != null &&
    props.maxAmount != null &&
    (amountNum < props.minAmount || amountNum > props.maxAmount);

  return (
    <div className="rounded-md border border-border/50 bg-muted/15 p-2" title={props.hint}>
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{props.title}</p>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">${money(props.expectedOutput)}</span>
      </div>
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="min-w-[72px] flex-1">
          <FieldInput compact label="Entrada" value={props.amount} onChange={props.onAmountChange} />
        </div>
        <div className={cn("shrink-0", props.totalStations > 1 ? "min-w-[5.5rem]" : "min-w-[2.75rem]")}>
          <StationButtons
            compact
            label="Est."
            selected={props.station}
            onSelect={props.onStationSelect}
            totalStations={props.totalStations}
            occupied={props.occupied}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-xs"
          disabled={props.isPending || !props.estimatedDuration}
          onClick={props.onStart}
        >
          {props.buttonLabel}
        </Button>
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
        {props.estimatedDuration ? (
          <>Tiempo estimado: {props.estimatedDuration}</>
        ) : outOfRange && props.minAmount != null && props.maxAmount != null ? (
          <>Rango: ${money(props.minAmount)} – ${money(props.maxAmount)}</>
        ) : (
          <>Tiempo proporcional al máximo de la máquina</>
        )}
      </p>
    </div>
  );
}

function FieldInput(props: { label: string; value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className={cn("space-y-1", props.compact && "space-y-0.5")}>
      <Label className={cn("text-xs", props.compact && "text-[10px]")}>{props.label}</Label>
      <Input
        className={cn("h-9", props.compact && "h-8 px-2 text-sm")}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function StationButtons(props: {
  label: string;
  selected: string;
  onSelect: (v: string) => void;
  totalStations: number;
  occupied: Set<string>;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-1", props.compact && "space-y-0.5")}>
      <Label className={cn("text-xs", props.compact && "text-[10px]")}>{props.label}</Label>
      <div className={cn("flex gap-1", props.compact ? "h-8" : "h-9 gap-2")}>
        {Array.from({ length: Math.max(1, props.totalStations) }, (_, i) => {
          const station = String(i + 1);
          const busy = props.occupied.has(station);
          const selected = props.selected === station;
          return (
            <button
              key={station}
              type="button"
              disabled={busy}
              onClick={() => props.onSelect(station)}
              className={cn(
                "inline-flex min-w-0 flex-1 items-center justify-center rounded-md border transition-colors",
                props.compact ? "px-1 text-xs" : "px-2 text-sm",
                selected
                  ? "border-primary/45 bg-primary/20 text-foreground"
                  : "border-input bg-background text-foreground hover:bg-muted/60",
                busy && "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground opacity-70"
              )}
              title={busy ? `Estación ${station} ocupada` : `Estación ${station}`}
            >
              E{station}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LavadoConfigForm(props: {
  config: LavadoConfigRow;
  canEdit: boolean;
  saving: boolean;
  onSave: (form: LavadoConfigRow) => void;
}) {
  const [form, setForm] = useState(props.config);

  useEffect(() => setForm(props.config), [props.config]);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <ProcessConfigCard title="Imprimir">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_1)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_1: Number(v) / 100 }))}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_1)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_1: Number(v) }))} />
          <FieldInput label="Máximo" value={String(form.max_proceso_1)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_1: Number(v) }))} />
          <FieldInput
            label="Duración al máximo (min)"
            value={String(form.duracion_base_p1_minutos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_base_p1_minutos: Number(v) }))}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p1)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p1: Number(v) }))} />
        </ProcessConfigCard>

        <ProcessConfigCard title="Cortar">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_2)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_2: Number(v) / 100 }))}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_2)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_2: Number(v) }))} />
          <FieldInput label="Máximo" value={String(form.max_proceso_2)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_2: Number(v) }))} />
          <FieldInput
            label="Duración manual (seg)"
            value={String(form.duracion_manual_p2_segundos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_manual_p2_segundos: Number(v) }))}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p2)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p2: Number(v) }))} />
        </ProcessConfigCard>

        <ProcessConfigCard title="Secar">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_3)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_3: Number(v) / 100 }))}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_3)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_3: Number(v) }))} />
          <FieldInput label="Máximo" value={String(form.max_proceso_3)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_3: Number(v) }))} />
          <FieldInput
            label="Duración al máximo (min)"
            value={String(form.duracion_base_p3_minutos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_base_p3_minutos: Number(v) }))}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p3)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p3: Number(v) }))} />
        </ProcessConfigCard>

        <ProcessConfigCard title="Contar">
          <FieldInput
            label="Pérdida (%)"
            value={String(asPct(num(form.perdida_proceso_4)))}
            onChange={(v) => setForm((f) => ({ ...f, perdida_proceso_4: Number(v) / 100 }))}
          />
          <FieldInput label="Mínimo" value={String(form.min_proceso_4)} onChange={(v) => setForm((f) => ({ ...f, min_proceso_4: Number(v) }))} />
          <FieldInput label="Máximo" value={String(form.max_proceso_4)} onChange={(v) => setForm((f) => ({ ...f, max_proceso_4: Number(v) }))} />
          <FieldInput
            label="Duración manual (seg)"
            value={String(form.duracion_manual_p4_segundos)}
            onChange={(v) => setForm((f) => ({ ...f, duracion_manual_p4_segundos: Number(v) }))}
          />
          <FieldInput label="Estaciones" value={String(form.estaciones_p4)} onChange={(v) => setForm((f) => ({ ...f, estaciones_p4: Number(v) }))} />
        </ProcessConfigCard>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" disabled={!props.canEdit || props.saving} onClick={() => props.onSave(form)}>
          {props.saving ? "Guardando…" : props.canEdit ? "Guardar configuración" : "Solo admin puede editar"}
        </Button>
      </div>
    </>
  );
}

function ProcessConfigCard(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.title}</p>
      <div className="grid gap-2 sm:grid-cols-2">{props.children}</div>
    </div>
  );
}
