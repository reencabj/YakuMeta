import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { ScrollText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import {
  EmptyState,
  FilterBar,
  PageHeader,
  PageShell,
  PanelCard,
  TablePagination,
  selectClassName,
} from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHistoryEvents } from "@/hooks/useHistoryEvents";
import { supabase } from "@/lib/supabase";
import type { HistoryEventRow } from "@/services/historyService";

function EventBadge(props: { kind: string; source: string }) {
  return (
    <Badge variant={props.source === "audit" ? "violet" : "secondary"} className="font-mono text-[10px]">
      {props.kind}
    </Badge>
  );
}

function JsonBlock(props: { label: string; value: unknown }) {
  if (props.value == null) return null;
  const text = typeof props.value === "string" ? props.value : JSON.stringify(props.value, null, 2);
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">{props.label}</p>
      <pre className="max-h-48 overflow-auto rounded-md border border-subtle bg-background-secondary p-3 text-[11px] leading-snug text-muted-foreground">
        {text}
      </pre>
    </div>
  );
}

function EventDetail({ row }: { row: HistoryEventRow }) {
  return (
    <div className="grid gap-4">
      <JsonBlock label="Antes (old_values)" value={row.old_values} />
      <JsonBlock label="Después (new_values)" value={row.new_values} />
      <JsonBlock label="Metadata" value={row.metadata} />
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Origen:</span> {row.source}
        </p>
        <p>
          <span className="font-medium text-foreground">Entidad:</span> {row.entity_type}{" "}
          {row.entity_id ? <code className="rounded bg-surface px-1">{row.entity_id}</code> : null}
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

function HistoryTableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [filters]);

  const allRows = q.data ?? [];
  const total = allRows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allRows.slice(start, start + pageSize);
  }, [allRows, page, pageSize]);

  const selectedRow = useMemo(
    () => allRows.find((r) => r.event_id === selectedId) ?? null,
    [allRows, selectedId]
  );

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
            ? "Auditoría y movimientos unificados con filtros avanzados."
            : "Eventos donde participaste como usuario."
        }
      />

      <FilterBar sticky className="rounded-lg border border-subtle bg-surface px-3">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          {isAdmin ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Usuario</Label>
              <select className={selectClassName} value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
                <option value="">Todos</option>
                {(profilesQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name ?? p.username}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tipo / acción</Label>
            <Input className="h-9" placeholder="ej. ingreso" value={eventKind} onChange={(e) => setEventKind(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Entidad</Label>
            <Input className="h-9" placeholder="order, stock_batch…" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pedido (UUID)</Label>
            <Input className="h-9 font-mono text-xs" placeholder="id del pedido" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Depósito</Label>
            <select className={selectClassName} value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
              <option value="">Todos</option>
              {(depositsQ.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Búsqueda</Label>
            <Input className="h-9" placeholder="Metadatos, notas, JSON…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </FilterBar>

      <PanelCard
        icon={ScrollText}
        title="Eventos"
        description={q.isLoading ? "Cargando…" : `${total} registros (máx. 800).`}
        flush
      >
        {q.isLoading ? (
          <HistoryTableSkeleton />
        ) : q.isError ? (
          <EmptyState title="No se pudo cargar el historial" description="Revisá la conexión e intentá de nuevo." />
        ) : total === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Sin eventos"
            description="Ajustá el rango de fechas o los filtros para ver registros."
          />
        ) : (
          <>
            <Table bordered>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Resumen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow
                    key={row.event_id}
                    className="cursor-pointer"
                    data-state={selectedId === row.event_id ? "selected" : undefined}
                    onClick={() => setSelectedId(row.event_id)}
                  >
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
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </PanelCard>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="sm:max-w-lg">
          {selectedRow ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{selectedRow.event_kind}</SheetTitle>
                <SheetDescription>
                  {format(new Date(selectedRow.created_at), "dd/MM/yyyy HH:mm")} · {userLabel(selectedRow.usuario_id)}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <EventDetail row={selectedRow} />
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
