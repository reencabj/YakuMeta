import { Fragment, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { ChevronDown, ScrollText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader, PageShell, PanelCard } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHistoryEvents } from "@/hooks/useHistoryEvents";
import { supabase } from "@/lib/supabase";
import type { HistoryEventRow } from "@/services/historyService";
import { cn } from "@/lib/utils";

function selectClass() {
  return cn(
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  );
}

function EventBadge(props: { kind: string; source: string }) {
  const tone =
    props.source === "audit"
      ? "border-primary/40 bg-primary/15 text-primary"
      : "border-sky-700/40 bg-sky-950/40 text-sky-200";
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", tone)}>
      {props.kind}
    </Badge>
  );
}

function JsonBlock(props: { label: string; value: unknown }) {
  if (props.value == null) return null;
  const text = typeof props.value === "string" ? props.value : JSON.stringify(props.value, null, 2);
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] leading-snug text-muted-foreground">
        {text}
      </pre>
    </div>
  );
}

function EventDetail({ row }: { row: HistoryEventRow }) {
  return (
    <div className="grid gap-4 border-t border-border/60 bg-muted/10 p-4 md:grid-cols-2">
      <JsonBlock label="Antes (old_values)" value={row.old_values} />
      <JsonBlock label="Después (new_values)" value={row.new_values} />
      <JsonBlock label="Metadata" value={row.metadata} />
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Origen:</span> {row.source}
        </p>
        <p>
          <span className="font-medium text-foreground">Entidad:</span> {row.entity_type}{" "}
          {row.entity_id ? <code className="rounded bg-muted px-1">{row.entity_id}</code> : null}
        </p>
        {row.motivo ? (
          <p>
            <span className="font-medium text-foreground">Notas / motivo:</span> {row.motivo}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = subDays(to, 13);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, []);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [usuarioId, setUsuarioId] = useState("");
  const [eventKind, setEventKind] = useState("");
  const [entityType, setEntityType] = useState("");
  const [orderId, setOrderId] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [search, setSearch] = useState("");

  const filters = useMemo(
    () => ({
      from,
      to,
      usuarioId: usuarioId || undefined,
      eventKind: eventKind || undefined,
      entityType: entityType || undefined,
      orderId: orderId || undefined,
      depositoId: depositoId || undefined,
      search: search || undefined,
    }),
    [from, to, usuarioId, eventKind, entityType, orderId, depositoId, search]
  );

  const q = useHistoryEvents(filters);

  const profilesQ = useQuery({
    queryKey: ["profiles", "history-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, username, display_name").order("username");
      if (error) throw error;
      return data ?? [];
    },
  });

  const depositsQ = useQuery({
    queryKey: ["storage_locations", "history-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("storage_locations").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [openId, setOpenId] = useState<string | null>(null);

  const userLabel = (id: string | null) => {
    if (!id) return "—";
    const p = profilesQ.data?.find((x) => x.id === id);
    return p?.display_name ?? p?.username ?? id.slice(0, 8);
  };

  return (
    <PageShell>
      <PageHeader
        title="Historial"
        description={
          isAdmin
            ? "Auditoría y movimientos unificados. Expandí una fila para ver valores anterior/nuevo y metadata."
            : "Solo ves los eventos donde participaste (movimientos y acciones bajo tu usuario)."
        }
      />

      <section className="rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          {isAdmin ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Usuario</Label>
              <select className={selectClass()} value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
                <option value="">Todos</option>
                {(profilesQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name ?? p.username}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo / acción</Label>
            <Input className="h-9" placeholder="ej. ingreso, entrega" value={eventKind} onChange={(e) => setEventKind(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entidad</Label>
            <Input className="h-9" placeholder="order, stock_batch…" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pedido (UUID)</Label>
            <Input className="h-9 font-mono text-xs" placeholder="id del pedido" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Depósito</Label>
            <select className={selectClass()} value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
              <option value="">Todos</option>
              {(depositsQ.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Búsqueda en texto</Label>
            <Input className="h-9" placeholder="Metadatos, notas, JSON…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </section>

      <PanelCard
        icon={ScrollText}
        title="Eventos"
        description={q.isLoading ? "Cargando…" : `${q.data?.length ?? 0} registros (límite 800).`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Resumen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((row) => {
              const expanded = openId === row.event_id;
              return (
                <Fragment key={row.event_id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpenId(expanded ? null : row.event_id)}>
                    <TableCell>
                      <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <EventBadge kind={row.event_kind} source={row.source} />
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{row.entity_type}</TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">{userLabel(row.usuario_id)}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {row.motivo ?? row.search_text.slice(0, 120)}
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EventDetail row={row} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {q.isError ? <p className="mt-2 text-sm text-red-400">No se pudo cargar el historial.</p> : null}
      </PanelCard>
    </PageShell>
  );
}
