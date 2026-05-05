import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Droplets, FlaskConical, PlayCircle, Settings, Timer } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader, PageShell, PanelCard, StatTile } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import {
  cancelLavadoTanda,
  completeLavadoTanda,
  createLavadoTanda,
  fetchLavadoConfig,
  fetchLavadoTandas,
  sendLavadoDiscordWebhookFinished,
  sendLavadoDiscordWebhookStarted,
  updateLavadoConfig,
  type LavadoConfigRow,
} from "./lavadoService";
import { estimatePipeline, formatDuration, type LavadoConfigSnapshot, type LavadoProcesoId } from "./lavadoMath";

const PROCESS_META: Record<LavadoProcesoId, { label: string; in: string; out: string }> = {
  imprimir: { label: "Imprimir", in: "Billetes Enrollados", out: "Hojas de billetes" },
  cortar: { label: "Cortar", in: "Hojas de billetes", out: "Dinero Mojado" },
  secar: { label: "Secar", in: "Dinero Mojado", out: "Dinero Seco" },
  contar: { label: "Contar", in: "Dinero Seco", out: "Dinero en Efectivo" },
};

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
  const [printAmount, setPrintAmount] = useState("100000");
  const [printStation, setPrintStation] = useState("1");
  const [dryAmount, setDryAmount] = useState("100000");
  const [dryStation, setDryStation] = useState("1");
  const [calcAmount, setCalcAmount] = useState("100000");
  const finishedAlertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const configQ = useQuery({ queryKey: ["lavado", "config"], queryFn: fetchLavadoConfig });
  const appSettingsQ = useAppSettingsQuery();
  const tandasQ = useQuery({ queryKey: ["lavado", "tandas"], queryFn: fetchLavadoTandas, refetchInterval: 15_000 });

  const updateConfigM = useMutation({
    mutationFn: updateLavadoConfig,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado", "config"] }),
  });
  const createM = useMutation({
    mutationFn: (input: { process: LavadoProcesoId; amount: number; station: number }) => {
      if (!profile?.id || !configQ.data) throw new Error("Sesión o configuración no disponible.");
      return createLavadoTanda({
        userId: profile.id,
        process: input.process,
        amount: input.amount,
        station: input.station,
        config: configQ.data,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lavado", "tandas"] });
    },
    onError: (e: Error) => window.alert(e.message),
  });
  const completeM = useMutation({
    mutationFn: completeLavadoTanda,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado", "tandas"] }),
  });
  const cancelM = useMutation({
    mutationFn: cancelLavadoTanda,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado", "tandas"] }),
  });

  const config = configQ.data;
  const tandas = tandasQ.data ?? [];
  const active = tandas.filter((t) => t.estado === "activo");
  const history = tandas.filter((t) => t.estado !== "activo");
  const totalInProcess = active.reduce((acc, t) => acc + num(t.monto_entrada), 0);
  const totalOutEstimated = active.reduce((acc, t) => acc + num(t.monto_salida_esperado), 0);
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
  const occupiedPrintStations = useMemo(
    () => new Set(active.filter((t) => t.proceso === "imprimir").map((t) => String(t.estacion))),
    [active]
  );
  const occupiedDryStations = useMemo(
    () => new Set(active.filter((t) => t.proceso === "secar").map((t) => String(t.estacion))),
    [active]
  );

  useEffect(() => {
    const total = printCfg?.estaciones ?? 1;
    const currentBusy = occupiedPrintStations.has(printStation);
    const currentOutOfRange = Number(printStation) < 1 || Number(printStation) > total;
    if (currentBusy || currentOutOfRange) {
      setPrintStation(firstFreeStation(total, occupiedPrintStations));
    }
  }, [occupiedPrintStations, printCfg?.estaciones, printStation]);

  useEffect(() => {
    const total = dryCfg?.estaciones ?? 1;
    const currentBusy = occupiedDryStations.has(dryStation);
    const currentOutOfRange = Number(dryStation) < 1 || Number(dryStation) > total;
    if (currentBusy || currentOutOfRange) {
      setDryStation(firstFreeStation(total, occupiedDryStations));
    }
  }, [dryCfg?.estaciones, dryStation, occupiedDryStations]);

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
    const dueByTimer = active.filter(
      (t) => !t.webhook_notified_at && new Date(t.finaliza_estimado_at).getTime() <= now
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
        description="Control operativo de tandas, cálculo de pérdidas y cronómetro por estación para el flujo de lavado."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Timer} label="Lavado activo" value={String(active.length)} unit="tandas" tone="slate" dense />
        <StatTile icon={Droplets} label="Dinero en proceso" value={`$${money(totalInProcess)}`} unit="USD" tone="amber" dense />
        <StatTile icon={FlaskConical} label="Dinero limpio estimado" value={`$${money(totalOutEstimated)}`} unit="USD" tone="emerald" dense />
        <StatTile
          icon={Clock3}
          label="Próxima tanda en finalizar"
          value={nextToFinish ? formatDuration(Math.max(0, (new Date(nextToFinish.finaliza_estimado_at).getTime() - now) / 1000)) : "—"}
          unit=""
          tone="rose"
          dense
        />
      </section>

      <section className="grid min-h-0 gap-3 xl:grid-cols-2 xl:auto-rows-fr">
      <PanelCard
        icon={PlayCircle}
        title="Nueva tanda"
        description="Procesos con duración: imprimir y secar."
        className="min-h-0 overflow-hidden"
      >
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Imprimir</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <FieldInput label="Monto entrada" value={printAmount} onChange={setPrintAmount} />
              <StationButtons
                label="Estación"
                selected={printStation}
                onSelect={setPrintStation}
                totalStations={printCfg?.estaciones ?? 1}
                occupied={occupiedPrintStations}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Salida esperada</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm">
                  ${money(printCfg ? (Number(printAmount) || 0) * (1 - printCfg.perdida) : 0)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Entrada: {PROCESS_META.imprimir.in}. Salida: {PROCESS_META.imprimir.out}. Límite: $
              {money(printCfg?.minimo ?? 0)} - ${money(printCfg?.maximo ?? 0)}.
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                disabled={createM.isPending}
                onClick={() => createM.mutate({ process: "imprimir", amount: Number(printAmount), station: Number(printStation) })}
              >
                Iniciar imprimir
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secar</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <FieldInput label="Monto entrada" value={dryAmount} onChange={setDryAmount} />
              <StationButtons
                label="Estación"
                selected={dryStation}
                onSelect={setDryStation}
                totalStations={dryCfg?.estaciones ?? 1}
                occupied={occupiedDryStations}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Salida esperada</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm">
                  ${money(dryCfg ? (Number(dryAmount) || 0) * (1 - dryCfg.perdida) : 0)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Entrada: {PROCESS_META.secar.in}. Salida: {PROCESS_META.secar.out}. Límite: ${money(dryCfg?.minimo ?? 0)} - $
              {money(dryCfg?.maximo ?? 0)}.
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                disabled={createM.isPending}
                onClick={() => createM.mutate({ process: "secar", amount: Number(dryAmount), station: Number(dryStation) })}
              >
                Iniciar secado
              </Button>
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        icon={Clock3}
        title="Tandas activas"
        description="Cronómetro en tiempo real por tanda."
        className="min-h-0 overflow-hidden"
      >
        <div className="max-h-[260px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proceso</TableHead>
              <TableHead>Estación</TableHead>
              <TableHead>Monto entrada</TableHead>
              <TableHead>Monto salida</TableHead>
              <TableHead>Restante</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((t) => {
              const remaining = Math.max(0, Math.round((new Date(t.finaliza_estimado_at).getTime() - now) / 1000));
              return (
                <TableRow
                  key={t.id}
                  className={cn(
                    remaining === 0 && "animate-pulse bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/40"
                  )}
                >
                  <TableCell>{PROCESS_META[t.proceso].label}</TableCell>
                  <TableCell>{t.estacion}</TableCell>
                  <TableCell>${money(num(t.monto_entrada))}</TableCell>
                  <TableCell>${money(num(t.monto_salida_esperado))}</TableCell>
                  <TableCell className={cn("font-mono text-xs", remaining === 0 && "font-semibold text-emerald-400")}>
                    {formatDuration(remaining)}
                  </TableCell>
                  <TableCell>activo</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => completeM.mutate(t.id)}>
                      Completar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={() => cancelM.mutate(t.id)}>
                      Cancelar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {active.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No hay tandas activas.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      </PanelCard>

      <PanelCard
        icon={FlaskConical}
        title="Calculadora"
        description="Pérdidas encadenadas y tiempo estimado."
        className="min-h-0 overflow-hidden"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <FieldInput label="Monto inicial" value={calcAmount} onChange={setCalcAmount} />
          <div className="rounded-xl border border-border/60 bg-muted/25 p-3 text-sm">
            <p>Final limpio: ${money(calc?.finalAmount ?? 0)}</p>
            <p>Pérdida total: ${money(calc?.totalLoss ?? 0)}</p>
            <p>Pérdida %: {((calc?.totalLossPct ?? 0) || 0).toFixed(2)}%</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 p-3 text-sm">
            <p>Rendimiento final: {(calc?.finalPct ?? 0).toFixed(2)}%</p>
            <p>Tiempo total: {formatDuration(calc?.totalSeconds ?? 0)}</p>
            <p>Cuello de botella: {calc?.bottleneck?.nombre ?? "—"}</p>
          </div>
        </div>
        <div className="mt-3 max-h-[175px] overflow-auto">
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

      {config ? (
        <PanelCard
          icon={Settings}
          title="Configuración"
          description="Editable por admin."
          className="min-h-0 overflow-hidden"
        >
          <div className="max-h-[260px] overflow-auto pr-1">
            <LavadoConfigForm
              config={config}
              canEdit={profile?.role === "admin"}
              saving={updateConfigM.isPending}
              onSave={(patch) => updateConfigM.mutate(patch)}
            />
          </div>
        </PanelCard>
      ) : null}
      </section>

      <PanelCard icon={Clock3} title="Historial" description="Tandas completadas o canceladas." className="min-h-0">
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Ver historial</summary>
          <div className="mt-3 max-h-[280px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inicio</TableHead>
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
                <TableCell>{PROCESS_META[t.proceso].label}</TableCell>
                <TableCell>{t.estacion}</TableCell>
                <TableCell>${money(num(t.monto_entrada))}</TableCell>
                <TableCell>${money(num(t.monto_salida_esperado))}</TableCell>
                <TableCell>{t.estado}</TableCell>
                <TableCell>{t.webhook_notified_at ? "enviado" : "pendiente"}</TableCell>
              </TableRow>
            ))}
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  Sin tandas finalizadas todavía.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
          </div>
        </details>
      </PanelCard>
    </PageShell>
  );
}

function FieldInput(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{props.label}</Label>
      <Input className="h-9" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function StationButtons(props: {
  label: string;
  selected: string;
  onSelect: (v: string) => void;
  totalStations: number;
  occupied: Set<string>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{props.label}</Label>
      <div className="flex h-9 gap-2">
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
                "inline-flex min-w-0 flex-1 items-center justify-center rounded-md border px-2 text-sm transition-colors",
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
  onSave: (patch: Database["public"]["Tables"]["lavado_config"]["Update"]) => void;
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
            label="Duración base (min)"
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
            label="Duración base (min)"
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
