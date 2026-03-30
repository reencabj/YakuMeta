import { endOfDay, parseISO, startOfDay } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type HistoryEventRow = Database["public"]["Views"]["v_history_events"]["Row"];

export type HistoryFilters = {
  from: string;
  to: string;
  usuarioId?: string;
  eventKind?: string;
  entityType?: string;
  orderId?: string;
  depositoId?: string;
  search?: string;
};

export type HistoryScope = {
  isAdmin: boolean;
  userId: string;
};

function rangeIso(from: string, to: string) {
  return {
    fromIso: startOfDay(parseISO(from)).toISOString(),
    toIso: endOfDay(parseISO(to)).toISOString(),
  };
}

export async function fetchHistoryEvents(
  filters: HistoryFilters,
  scope: HistoryScope,
  limit = 500
): Promise<HistoryEventRow[]> {
  const { fromIso, toIso } = rangeIso(filters.from, filters.to);
  let q = supabase
    .from("v_history_events")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!scope.isAdmin) {
    q = q.eq("usuario_id", scope.userId);
  } else if (filters.usuarioId) {
    q = q.eq("usuario_id", filters.usuarioId);
  }

  if (filters.orderId) {
    q = q.eq("entity_id", filters.orderId);
  }

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as HistoryEventRow[];

  if (filters.eventKind?.trim()) {
    const t = filters.eventKind.trim().toLowerCase();
    rows = rows.filter((r) => r.event_kind.toLowerCase().includes(t));
  }
  if (filters.entityType?.trim()) {
    const t = filters.entityType.trim().toLowerCase();
    rows = rows.filter((r) => r.entity_type.toLowerCase().includes(t));
  }

  if (filters.search?.trim()) {
    const t = filters.search.trim().toLowerCase();
    rows = rows.filter((r) => r.search_text?.toLowerCase().includes(t));
  }

  if (filters.depositoId) {
    rows = rows.filter((r) => {
      if (r.entity_type === "storage_location" && r.entity_id === filters.depositoId) return true;
      const meta = r.metadata as Record<string, unknown> | null;
      const nv = r.new_values as Record<string, unknown> | null;
      const ov = r.old_values as Record<string, unknown> | null;
      const blob = JSON.stringify([meta, nv, ov]);
      return blob.includes(filters.depositoId!);
    });
  }

  return rows;
}
