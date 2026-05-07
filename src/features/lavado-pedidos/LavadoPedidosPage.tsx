import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarClock, ClipboardCopy, Filter, Settings, Timer, WalletCards } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader, PageShell, PanelCard, StatTile } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Database, LavadoPedidoEstado, LavadoPedidoTipoPago } from "@/types/database";
import {
  createLavadoPedido,
  deleteLavadoPedido,
  fetchLavadoPedidos,
  fetchLavadoPedidosConfig,
  sendLavadoPedidoCreatedWebhook,
  sendLavadoPedidoDueTodayWebhook,
  sendLavadoPedidoInstantCompletedWebhook,
  updateLavadoPedidoEstado,
  updateLavadoPedidoNotas,
  updateLavadoPedidosConfig,
  type LavadoPedidoConfigRow,
  type LavadoPedidoWithUsers,
} from "./lavadoPedidosService";
import { calcLavadoPedido, deliveryCountdownLabel, deliveryDateFor, daysDiffFromToday, money, pct } from "./lavadoPedidosMath";

const ACTIVE_STATES: LavadoPedidoEstado[] = ["recibido", "dinero_recibido", "dinero_entregado", "en_espera", "listo_para_entregar"];
const CLOSED_STATES: LavadoPedidoEstado[] = ["completado", "cancelado"];
const HISTORY_STATES: (LavadoPedidoEstado | "all")[] = ["all", "completado", "cancelado"];
const PAYMENT_TYPES: (LavadoPedidoTipoPago | "all")[] = ["all", "instantaneo", "plazo_7_dias"];

function paymentLabel(value: LavadoPedidoTipoPago) {
  return value === "instantaneo" ? "Instantáneo" : "7 días";
}

function estadoLabel(value: LavadoPedidoEstado) {
  const labels: Record<LavadoPedidoEstado, string> = {
    recibido: "Recibido",
    dinero_recibido: "Dinero recibido",
    dinero_entregado: "Dinero entregado",
    en_espera: "En espera",
    listo_para_entregar: "Listo para entregar",
    completado: "Completado",
    cancelado: "Cancelado",
  };
  return labels[value];
}

function userName(user?: { username?: string | null; display_name?: string | null } | null) {
  return user?.display_name?.trim() || user?.username || "—";
}

function estadoClass(value: LavadoPedidoEstado) {
  if (value === "completado") return "border-emerald-500/40 bg-emerald-500/12 text-emerald-300";
  if (value === "cancelado") return "border-red-500/35 bg-red-500/10 text-red-300";
  if (value === "listo_para_entregar" || value === "dinero_entregado") {
    return "border-primary/45 bg-primary/16 text-foreground";
  }
  return "border-border/70 bg-muted/25 text-muted-foreground";
}

function paymentClass(value: LavadoPedidoTipoPago) {
  return value === "instantaneo"
    ? "border-primary/45 bg-primary/15 text-foreground"
    : "border-amber-500/35 bg-amber-500/10 text-amber-200";
}

export function LavadoPedidosPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const configQ = useQuery({ queryKey: ["lavado-pedidos", "config"], queryFn: fetchLavadoPedidosConfig });
  const pedidosQ = useQuery({
    queryKey: ["lavado-pedidos"],
    queryFn: fetchLavadoPedidos,
    refetchInterval: 30_000,
  });

  const createM = useMutation({
    mutationFn: (input: { orgPersona: string; monto: number; tipoPago: LavadoPedidoTipoPago; notas: string | null }) => {
      if (!profile?.id || !configQ.data) throw new Error("Sesión o configuración no disponible.");
      return createLavadoPedido({ ...input, userId: profile.id, config: configQ.data });
    },
    onSuccess: (pedido) => {
      void qc.invalidateQueries({ queryKey: ["lavado-pedidos"] });
      void sendLavadoPedidoCreatedWebhook({ pedido, webhookUrl: configQ.data?.discord_webhook_url }).catch((e) =>
        console.error("[lavado-pedidos] webhook pedido creado", e)
      );
      setOrgPersona("");
      setMonto("1000000");
      setNotas("");
    },
    onError: (e: Error) => window.alert(e.message),
  });

  const estadoM = useMutation({
    mutationFn: (input: { id: string; estado: LavadoPedidoEstado }) => {
      if (!profile?.id) throw new Error("Sesión requerida.");
      return updateLavadoPedidoEstado({ ...input, userId: profile.id });
    },
    onSuccess: (pedido) => {
      void qc.invalidateQueries({ queryKey: ["lavado-pedidos"] });
      if (pedido.estado === "completado") {
        void sendLavadoPedidoInstantCompletedWebhook({ pedido, webhookUrl: configQ.data?.discord_webhook_url }).catch((e) =>
          console.error("[lavado-pedidos] webhook completado instantaneo", e)
        );
      }
    },
    onError: (e: Error) => window.alert(e.message),
  });

  const notasM = useMutation({
    mutationFn: (input: { id: string; notas: string | null }) => {
      if (!profile?.id) throw new Error("Sesión requerida.");
      return updateLavadoPedidoNotas({ ...input, userId: profile.id });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado-pedidos"] }),
    onError: (e: Error) => window.alert(e.message),
  });

  const deleteM = useMutation({
    mutationFn: deleteLavadoPedido,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado-pedidos"] }),
    onError: (e: Error) => window.alert(e.message),
  });

  const configM = useMutation({
    mutationFn: updateLavadoPedidosConfig,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lavado-pedidos", "config"] }),
    onError: (e: Error) => window.alert(e.message),
  });

  const [orgPersona, setOrgPersona] = useState("");
  const [monto, setMonto] = useState("1000000");
  const [tipoPago, setTipoPago] = useState<LavadoPedidoTipoPago>("instantaneo");
  const [notas, setNotas] = useState("");

  const [historyType, setHistoryType] = useState<LavadoPedidoTipoPago | "all">("all");
  const [historyState, setHistoryState] = useState<LavadoPedidoEstado | "all">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [onlyToday, setOnlyToday] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const config = configQ.data;
  const pedidos = useMemo(() => pedidosQ.data ?? [], [pedidosQ.data]);
  const montoNum = Number(monto.replace(",", "."));
  const calc = useMemo(
    () => (config ? calcLavadoPedido(montoNum, tipoPago, config) : null),
    [config, montoNum, tipoPago]
  );
  const previewDeliveryDate = config ? deliveryDateFor(tipoPago, config.dias_entrega_plazo) : null;

  const active = useMemo(
    () => pedidos.filter((p) => ACTIVE_STATES.includes(p.estado)).sort(sortActive),
    [pedidos, nowTick]
  );
  const history = useMemo(() => pedidos.filter((p) => CLOSED_STATES.includes(p.estado)), [pedidos]);

  const activeFiltered = useMemo(() => {
    let list = active;
    if (onlyToday) {
      list = list.filter((p) => p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null && daysDiffFromToday(p.fecha_entrega) === 0);
    }
    if (onlyOverdue) {
      list = list.filter((p) => p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null && daysDiffFromToday(p.fecha_entrega) < 0);
    }
    return list;
  }, [active, onlyOverdue, onlyToday, nowTick]);

  const historyFiltered = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return history.filter((p) => {
      if (historyType !== "all" && p.tipo_pago !== historyType) return false;
      if (historyState !== "all" && p.estado !== historyState) return false;
      if (q && !p.org_persona.toLowerCase().includes(q)) return false;
      const date = p.fecha_creacion.slice(0, 10);
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    });
  }, [fromDate, history, historySearch, historyState, historyType, toDate]);

  const summary = useMemo(() => {
    const sevenDue = active.filter(
      (p) => p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null && daysDiffFromToday(p.fecha_entrega) <= 0
    ).length;
    const nextDelivery = active
      .filter((p) => p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null)
      .sort((a, b) => daysDiffFromToday(a.fecha_entrega!) - daysDiffFromToday(b.fecha_entrega!))[0];
    return {
      pedidosHechos: pedidos.length,
      plataIngresada: pedidos.reduce((s, p) => s + Number(p.monto), 0),
      gananciaReal: pedidos
        .filter((p) => p.estado === "completado")
        .reduce((s, p) => s + Number(p.ganancia_real_banda), 0),
      dineroPorEntregar: active.reduce((s, p) => s + Number(p.monto_entregar), 0),
      proximaEntrega: nextDelivery ? deliveryCountdownLabel(nextDelivery.tipo_pago, nextDelivery.fecha_entrega) : "Sin entregas",
      porEntregar: sevenDue,
    };
  }, [active, nowTick, pedidos]);

  useEffect(() => {
    const webhookUrl = config?.discord_webhook_url?.trim();
    if (!webhookUrl) return;
    const due = active.filter(
      (p) =>
        p.tipo_pago === "plazo_7_dias" &&
        p.fecha_entrega != null &&
        daysDiffFromToday(p.fecha_entrega) <= 0 &&
        !p.webhook_entrega_hoy_notified_at
    );
    for (const pedido of due) {
      void sendLavadoPedidoDueTodayWebhook({
        pedido,
        webhookUrl,
        roleId: config?.discord_entrega_role_id,
      })
        .catch((e) => console.error("[lavado-pedidos] webhook entrega hoy", e))
        .finally(() => {
          void qc.invalidateQueries({ queryKey: ["lavado-pedidos"] });
        });
    }
  }, [active, config?.discord_entrega_role_id, config?.discord_webhook_url, nowTick, qc]);

  return (
    <PageShell className="gap-4">
      <PageHeader
        title="Pedidos Lavado"
        description="Control operativo de pedidos de lavado: comisiones, entregas, estados, vencimientos y ganancia real."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile dense icon={Banknote} label="Pedidos hechos" value={String(summary.pedidosHechos)} unit="pedidos" tone="slate" />
        <StatTile dense icon={WalletCards} label="Plata ingresada" value={money(summary.plataIngresada)} unit="" tone="amber" />
        <StatTile dense icon={Banknote} label="Ganancia acumulada" value={money(summary.gananciaReal)} unit="" tone="emerald" />
        <StatTile dense icon={WalletCards} label="Dinero por entregar" value={money(summary.dineroPorEntregar)} unit="" tone="slate" />
        <StatTile dense icon={Timer} label="Próxima entrega" value={summary.proximaEntrega} unit="" tone="amber" />
        <StatTile dense icon={CalendarClock} label="Hoy / vencidos" value={String(summary.porEntregar)} unit="pedidos" tone="rose" emphasize />
      </section>

      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.65fr)]">
        <PanelCard icon={Banknote} title="Crear pedido rápido" description="Calcula automáticamente entrega, descuento, pérdida del script y ganancia real.">
          <div className="grid gap-4 2xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
                <div className="space-y-1">
                  <Label>Org/Persona</Label>
                  <Input value={orgPersona} onChange={(e) => setOrgPersona(e.target.value)} placeholder="Nombre u organización" />
                </div>
                <div className="space-y-1">
                  <Label>Cantidad a lavar</Label>
                  <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Tipo de pago</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["instantaneo", "plazo_7_dias"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={tipoPago === value ? "default" : "outline"}
                      onClick={() => setTipoPago(value)}
                      aria-pressed={tipoPago === value}
                    >
                      {paymentLabel(value)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notas internas</Label>
                <Textarea className="min-h-[88px]" value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
              </div>
            </div>

            <div className="flex min-h-full flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">
                <Metric label="Comisión aplicada" value={calc ? pct(calc.comisionPct) : "—"} />
                <Metric label="Script come" value={calc ? pct(calc.scriptPct) : "—"} />
                <Metric label="Monto a entregar" value={calc ? money(calc.montoEntregar) : "—"} strong />
                <Metric label="Total descontado" value={calc ? money(calc.descuentoTotal) : "—"} />
                <Metric label="Pérdida script" value={calc ? money(calc.perdidaScript) : "—"} />
                <Metric label="Ganancia real banda" value={calc ? money(calc.gananciaRealBanda) : "—"} strong />
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                Fecha entrega:{" "}
                <span className="font-medium text-foreground">
                  {tipoPago === "instantaneo" ? "Inmediata / sin fecha" : previewDeliveryDate ? new Date(`${previewDeliveryDate}T00:00:00`).toLocaleDateString("es-AR") : "—"}
                </span>
              </div>
              <div className="flex justify-end border-t border-border/50 pt-3">
                <Button
                  className="min-w-36"
                  type="button"
                  disabled={createM.isPending || !config || !orgPersona.trim() || !Number.isFinite(montoNum) || montoNum <= 0}
                  onClick={() =>
                    createM.mutate({
                      orgPersona,
                      monto: montoNum,
                      tipoPago,
                      notas: notas.trim() ? notas.trim() : null,
                    })
                  }
                >
                  Crear pedido
                </Button>
              </div>
            </div>
          </div>
        </PanelCard>

        {config ? (
          <LavadoPedidosConfigCard
            config={config}
            canEdit={profile?.role === "admin"}
            saving={configM.isPending}
            onSave={(patch) => configM.mutate(patch)}
          />
        ) : null}
      </section>

      <PanelCard
        icon={Timer}
        title="Pedidos activos"
        description="Flujo operativo diario. Los pedidos a plazo resaltan entregas de hoy y vencidos."
        headerExtra={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={onlyToday ? "default" : "outline"} size="sm" onClick={() => setOnlyToday((v) => !v)}>
              Entregas de hoy
            </Button>
            <Button type="button" variant={onlyOverdue ? "default" : "outline"} size="sm" onClick={() => setOnlyOverdue((v) => !v)}>
              Vencidos
            </Button>
          </div>
        }
      >
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org/Persona</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Monto a entregar</TableHead>
                <TableHead>Fecha entrega</TableHead>
                <TableHead>Días restantes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ganancia banda</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeFiltered.map((pedido) => (
                <ActivePedidoRow
                  key={pedido.id}
                  pedido={pedido}
                  busy={estadoM.isPending || notasM.isPending}
                  onEstado={(estado) => estadoM.mutate({ id: pedido.id, estado })}
                  onCancel={() => {
                    if (window.confirm(`¿Cancelar pedido de ${pedido.org_persona}?`)) {
                      estadoM.mutate({ id: pedido.id, estado: "cancelado" });
                    }
                  }}
                  onNotes={(next) => notasM.mutate({ id: pedido.id, notas: next })}
                />
              ))}
              {activeFiltered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-muted-foreground">
                    No hay pedidos activos con estos filtros.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <PanelCard icon={Filter} title="Historial" description="Pedidos completados y cancelados, con filtros para revisar cierres.">
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <Input placeholder="Org/Persona…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={historyType} onChange={(e) => setHistoryType(e.target.value as LavadoPedidoTipoPago | "all")}>
            {PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "Todos los tipos" : paymentLabel(t)}
              </option>
            ))}
          </select>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={historyState} onChange={(e) => setHistoryState(e.target.value as LavadoPedidoEstado | "all")}>
            {HISTORY_STATES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Todos los estados" : estadoLabel(s)}
              </option>
            ))}
          </select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="Desde" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} title="Hasta" />
        </div>
        <div className="max-h-[420px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Org/Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Entregado</TableHead>
                <TableHead>Ganancia real</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creó / completó</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyFiltered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(p.fecha_creacion).toLocaleString("es-AR")}</TableCell>
                  <TableCell className="font-medium">{p.org_persona}</TableCell>
                  <TableCell>
                    <Badge className={paymentClass(p.tipo_pago)}>{paymentLabel(p.tipo_pago)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{money(Number(p.monto))}</TableCell>
                  <TableCell className="font-mono tabular-nums">{money(Number(p.monto_entregar))}</TableCell>
                  <TableCell className="font-mono tabular-nums">{money(Number(p.ganancia_real_banda))}</TableCell>
                  <TableCell>
                    <Badge className={estadoClass(p.estado)}>{estadoLabel(p.estado)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {userName(p.creado_por)} / {userName(p.completado_por)}
                  </TableCell>
                  <TableCell>
                    {profile?.role === "admin" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-400"
                        disabled={deleteM.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Borrar definitivamente el pedido de ${p.org_persona}?`)) {
                            deleteM.mutate(p.id);
                          }
                        }}
                      >
                        Borrar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {historyFiltered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-muted-foreground">
                    Sin historial para estos filtros.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </PanelCard>
    </PageShell>
  );
}

function sortActive(a: LavadoPedidoWithUsers, b: LavadoPedidoWithUsers) {
  const ad = a.fecha_entrega ? daysDiffFromToday(a.fecha_entrega) : 9999;
  const bd = b.fecha_entrega ? daysDiffFromToday(b.fecha_entrega) : 9999;
  return ad - bd || new Date(a.fecha_creacion).getTime() - new Date(b.fecha_creacion).getTime();
}

function Metric(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p className={cn("mt-0.5 font-mono tabular-nums", props.strong ? "text-lg font-semibold text-foreground" : "text-sm")}>
        {props.value}
      </p>
    </div>
  );
}

function Badge(props: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[10px] uppercase", props.className)}>{props.children}</span>;
}

function ActivePedidoRow(props: {
  pedido: LavadoPedidoWithUsers;
  busy: boolean;
  onEstado: (estado: LavadoPedidoEstado) => void;
  onCancel: () => void;
  onNotes: (notas: string | null) => void;
}) {
  const p = props.pedido;
  const canCompleteInstant = p.tipo_pago === "instantaneo" && p.estado === "dinero_entregado";
  const canCompletePlazo = p.tipo_pago === "plazo_7_dias" && p.estado === "listo_para_entregar";
  const countdown = deliveryCountdownLabel(p.tipo_pago, p.fecha_entrega);
  const dueTone = p.tipo_pago === "plazo_7_dias" && p.fecha_entrega != null && daysDiffFromToday(p.fecha_entrega) <= 0;

  return (
    <TableRow className={cn(dueTone && "bg-primary/8")}>
      <TableCell>
        <div>
          <p className="font-medium">{p.org_persona}</p>
          <p className="text-[10px] text-muted-foreground">Creó: {userName(p.creado_por)}</p>
        </div>
      </TableCell>
      <TableCell className="font-mono tabular-nums">{money(Number(p.monto))}</TableCell>
      <TableCell>
        <Badge className={paymentClass(p.tipo_pago)}>{paymentLabel(p.tipo_pago)}</Badge>
      </TableCell>
      <TableCell className="font-mono tabular-nums">{money(Number(p.monto_entregar))}</TableCell>
      <TableCell>{p.fecha_entrega ? new Date(`${p.fecha_entrega}T00:00:00`).toLocaleDateString("es-AR") : "—"}</TableCell>
      <TableCell className={cn("text-xs", dueTone ? "font-semibold text-primary" : "text-muted-foreground")}>{countdown}</TableCell>
      <TableCell>
        <Badge className={estadoClass(p.estado)}>{estadoLabel(p.estado)}</Badge>
      </TableCell>
      <TableCell className="font-mono tabular-nums">{money(Number(p.ganancia_real_banda))}</TableCell>
      <TableCell>
        <div className="flex min-w-[260px] flex-wrap gap-1.5">
          {p.tipo_pago === "instantaneo" ? (
            <>
              <Button size="sm" variant="outline" disabled={props.busy || p.estado !== "recibido"} onClick={() => props.onEstado("dinero_recibido")}>
                Dinero recibido
              </Button>
              <Button size="sm" variant="outline" disabled={props.busy || p.estado !== "dinero_recibido"} onClick={() => props.onEstado("dinero_entregado")}>
                Dinero entregado
              </Button>
              <Button size="sm" disabled={props.busy || !canCompleteInstant} onClick={() => props.onEstado("completado")}>
                Completar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={props.busy || p.estado !== "en_espera"} onClick={() => props.onEstado("listo_para_entregar")}>
                Listo para entregar
              </Button>
              <Button size="sm" disabled={props.busy || !canCompletePlazo} onClick={() => props.onEstado("completado")}>
                Completar
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => copyDiscordSummary(p)}>
            <ClipboardCopy className="size-3.5" />
            Copiar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const next = window.prompt("Notas internas", p.notas ?? "");
              if (next !== null) props.onNotes(next.trim() ? next.trim() : null);
            }}
          >
            Notas
          </Button>
          <Button size="sm" variant="ghost" className="text-red-400" disabled={props.busy} onClick={props.onCancel}>
            Cancelar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function copyDiscordSummary(p: LavadoPedidoWithUsers) {
  const lines = [
    `Pedido Lavado - ${p.org_persona}`,
    `Tipo: ${paymentLabel(p.tipo_pago)}`,
    `Monto recibido: ${money(Number(p.monto))}`,
    `Cliente recibe: ${money(Number(p.monto_entregar))}`,
    `Descuento total: ${money(Number(p.descuento_total))} (${pct(Number(p.comision_pct))})`,
    `Pérdida script: ${money(Number(p.perdida_script))} (${pct(Number(p.script_pct))})`,
    `Ganancia real banda: ${money(Number(p.ganancia_real_banda))}`,
    `Entrega: ${deliveryCountdownLabel(p.tipo_pago, p.fecha_entrega)}`,
    `Estado: ${estadoLabel(p.estado)}`,
  ];
  void navigator.clipboard?.writeText(lines.join("\n"));
}

function LavadoPedidosConfigCard(props: {
  config: LavadoPedidoConfigRow;
  canEdit: boolean;
  saving: boolean;
  onSave: (patch: Database["public"]["Tables"]["lavado_pedidos_config"]["Update"]) => void;
}) {
  const [form, setForm] = useState(props.config);
  useEffect(() => setForm(props.config), [props.config]);

  return (
    <PanelCard
      className="h-full"
      icon={Settings}
      title="Configuración"
      description="Porcentajes usados para nuevos pedidos. Los pedidos existentes no se recalculan."
    >
      <div className="flex h-full flex-col">
      <div className="grid gap-3">
        <PercentInput label="Comisión instantánea" value={form.comision_instantaneo} onChange={(v) => setForm((f) => ({ ...f, comision_instantaneo: v }))} />
        <PercentInput label="Comisión 7 días" value={form.comision_7_dias} onChange={(v) => setForm((f) => ({ ...f, comision_7_dias: v }))} />
        <PercentInput label="Script come" value={form.script_porcentaje} onChange={(v) => setForm((f) => ({ ...f, script_porcentaje: v }))} />
        <div className="space-y-1">
          <Label className="text-xs">Días entrega plazo</Label>
          <Input
            type="number"
            value={form.dias_entrega_plazo}
            onChange={(e) => setForm((f) => ({ ...f, dias_entrega_plazo: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="mt-auto flex justify-end border-t border-border/50 pt-4">
        <Button className="w-full" type="button" disabled={!props.canEdit || props.saving} onClick={() => props.onSave(form)}>
          {props.saving ? "Guardando…" : props.canEdit ? "Guardar configuración" : "Solo admin puede editar"}
        </Button>
      </div>
      </div>
    </PanelCard>
  );
}

function PercentInput(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Input type="number" step="0.01" value={Math.round(props.value * 10000) / 100} onChange={(e) => props.onChange(Number(e.target.value) / 100)} />
    </div>
  );
}
