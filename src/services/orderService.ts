import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderDeliveryRow = Database["public"]["Tables"]["order_deliveries"]["Row"];
export type OrderDeliveryItemRow = Database["public"]["Tables"]["order_delivery_items"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];

export type OrderWithCreator = OrderRow & {
  creado_por: { id: string; username: string; display_name: string | null };
};

export type DeliveryWithItems = OrderDeliveryRow & {
  items: OrderDeliveryItemRow[];
  registrado_por: { id: string; username: string; display_name: string | null } | null;
};

export type OrderDetail = {
  order: OrderWithCreator;
  deliveries: DeliveryWithItems[];
  audit: Pick<AuditLogRow, "id" | "accion" | "created_at" | "motivo" | "new_values" | "metadata">[];
};

export type DeliverItemInput = {
  batch_id?: string;
  storage_location_id?: string;
  quantity_meta_kilos: number;
  source_type: "stock" | "produccion_directa";
};

export type DeliverPayload = {
  /** Usuario del sistema (profiles.id) que recibió el efectivo; la RPC valida que exista y esté activo. */
  recibio_dinero_usuario_id: string;
  amount_received: number;
  delivered_at?: string;
  notes?: string;
  items: DeliverItemInput[];
};

/** Cuerpo enviado a la Edge Function `notify-discord` (tipado compartido con el backend). */
export type NotifyDiscordPayload =
  | { tipo_evento: "nuevo_pedido"; cliente: string; kilos: number }
  | { tipo_evento: "pedido_entregado"; cliente: string; kilos: number; monto: number };

export type OpenOrderCoberturaRow = {
  order_id: string;
  cum_kg: number;
  alcanza_fifo: boolean;
};

export type LatestDeliverySummary = {
  order_id: string;
  recibio_dinero_nombre: string;
  entregado_por_nombre: string;
};

const orderSelect = `
  *,
  creado_por:profiles!orders_creado_por_usuario_id_fkey (
    id,
    username,
    display_name
  )
`;

/** Notificación secundaria a Discord; nunca lanza (errores solo en consola). */
async function notifyDiscordOrderEvent(payload: NotifyDiscordPayload): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn("[notify-discord] sin sesión: no se envía (el pedido ya se registró)");
      return;
    }
    const { data, error } = await supabase.functions.invoke<unknown>("notify-discord", {
      body: payload,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      console.error("[notify-discord] invoke error", error);
      return;
    }
    if (data && typeof data === "object" && "ok" in data && (data as { ok?: boolean }).ok === false) {
      console.error("[notify-discord] function returned ok: false", data);
    }
  } catch (e) {
    console.error("[notify-discord] unexpected failure", e);
  }
}

export async function fetchOrdersWithCreator(): Promise<OrderWithCreator[]> {
  const { data, error } = await supabase.from("orders").select(orderSelect).eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as OrderWithCreator[];
}

export async function fetchOpenOrdersCobertura(): Promise<OpenOrderCoberturaRow[]> {
  const { data, error } = await supabase.from("v_open_orders_cobertura").select("order_id, cum_kg, alcanza_fifo");
  if (error) throw error;
  return (data ?? []) as OpenOrderCoberturaRow[];
}

export async function fetchLatestDeliveriesByOrderIds(orderIds: string[]): Promise<Record<string, LatestDeliverySummary>> {
  if (orderIds.length === 0) return {};
  const { data, error } = await supabase
    .from("order_deliveries")
    .select(
      `
      order_id,
      recibio_dinero_nombre,
      entregado_at,
      entregado_por:profiles!order_deliveries_created_by_fkey ( username, display_name )
    `
    )
    .in("order_id", orderIds)
    .order("entregado_at", { ascending: false });
  if (error) throw error;

  const byOrder: Record<string, LatestDeliverySummary> = {};
  for (const row of data ?? []) {
    const orderId = row.order_id as string;
    if (byOrder[orderId]) continue;
    const entregadoPor =
      ((row as { entregado_por?: { display_name?: string | null; username?: string | null } | null }).entregado_por?.display_name ??
        (row as { entregado_por?: { display_name?: string | null; username?: string | null } | null }).entregado_por?.username ??
        "—") as string;
    byOrder[orderId] = {
      order_id: orderId,
      recibio_dinero_nombre: (row.recibio_dinero_nombre as string) ?? "—",
      entregado_por_nombre: entregadoPor,
    };
  }
  return byOrder;
}

export async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  const { data: ord, error: e1 } = await supabase.from("orders").select(orderSelect).eq("id", orderId).single();
  if (e1) throw e1;

  const { data: dels, error: e3 } = await supabase
    .from("order_deliveries")
    .select(
      `
      *,
      items:order_delivery_items (*),
      registrado_por:profiles!order_deliveries_created_by_fkey ( id, username, display_name )
    `
    )
    .eq("order_id", orderId)
    .order("entregado_at", { ascending: false });
  if (e3) throw e3;

  const { data: logs, error: e4 } = await supabase
    .from("audit_logs")
    .select("id, accion, created_at, motivo, new_values, metadata")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (e4) throw e4;

  return {
    order: ord as OrderWithCreator,
    deliveries: (dels ?? []) as DeliveryWithItems[],
    audit: logs ?? [],
  };
}

export async function createOrder(input: {
  cliente_nombre: string;
  cantidad_meta_kilos: number;
  fecha_pedido: string;
  fecha_encargo: string | null;
  notas: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_order", {
    p_cliente_nombre: input.cliente_nombre,
    p_cantidad_meta_kilos: input.cantidad_meta_kilos,
    p_fecha_pedido: input.fecha_pedido,
    p_fecha_encargo: input.fecha_encargo,
    p_notas: input.notas,
  });
  if (error) throw error;
  const orderId = data as string;
  await notifyDiscordOrderEvent({
    tipo_evento: "nuevo_pedido",
    cliente: input.cliente_nombre,
    kilos: input.cantidad_meta_kilos,
  });
  return orderId;
}

export async function markOrderCobradoPreEntrega(
  orderId: string,
  input: { recibio_dinero_usuario_id: string; amount_received: number }
): Promise<void> {
  const { error } = await supabase.rpc("mark_order_cobrado_pre_entrega", {
    p_order_id: orderId,
    p_recibio_dinero_usuario_id: input.recibio_dinero_usuario_id,
    p_monto: input.amount_received,
  });
  if (error) throw error;
}

/** Solo seguimiento operativo; no altera precios (usa RPC en BD). */
export async function setOrderKilosEntregadosAcumulado(orderId: string, kilos: number): Promise<void> {
  const { error } = await supabase.rpc("set_order_kilos_entregados_acumulado", {
    p_order_id: orderId,
    p_kilos: kilos,
  });
  if (error) throw error;
}

export async function updateOrderPatch(
  orderId: string,
  patch: Partial<{
    cliente_nombre: string;
    cantidad_meta_kilos: number;
    kilos_entregados_acumulado: number;
    notas: string | null;
    fecha_pedido: string;
    fecha_encargo: string | null;
    estado: Database["public"]["Tables"]["orders"]["Row"]["estado"];
    prioridad: number | null;
    precio_sugerido_por_kilo: number | null;
    total_sugerido: number | null;
  }>
): Promise<void> {
  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw error;
}

export async function deliverOrder(orderId: string, payload: DeliverPayload): Promise<string> {
  const { data: orderRow } = await supabase
    .from("orders")
    .select("cliente_nombre, cantidad_meta_kilos")
    .eq("id", orderId)
    .maybeSingle();

  const clienteNotify = (orderRow?.cliente_nombre as string | undefined)?.trim() || "—";
  const kilosNotify = Number(orderRow?.cantidad_meta_kilos ?? NaN);

  const p: Json = {
    recibio_dinero_usuario_id: payload.recibio_dinero_usuario_id,
    amount_received: payload.amount_received,
    delivered_at: payload.delivered_at ?? null,
    notes: payload.notes ?? null,
    items: payload.items.map((i) => ({
      batch_id: i.batch_id ?? null,
      storage_location_id: i.storage_location_id ?? null,
      quantity_meta_kilos: i.quantity_meta_kilos,
      source_type: i.source_type,
    })),
  } as unknown as Json;
  const { data, error } = await supabase.rpc("deliver_order", {
    p_order_id: orderId,
    p_payload: p,
  });
  if (error) throw error;
  const deliveryId = data as string;
  await notifyDiscordOrderEvent({
    tipo_evento: "pedido_entregado",
    cliente: clienteNotify,
    kilos: Number.isFinite(kilosNotify) && kilosNotify > 0 ? kilosNotify : payload.items.reduce((s, i) => s + i.quantity_meta_kilos, 0),
    monto: payload.amount_received,
  });
  return deliveryId;
}

export async function cancelOrder(orderId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
}
