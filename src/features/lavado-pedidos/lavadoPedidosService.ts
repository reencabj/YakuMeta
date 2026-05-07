import { supabase } from "@/lib/supabase";
import type { Database, LavadoPedidoEstado, LavadoPedidoTipoPago } from "@/types/database";
import { calcLavadoPedido, deliveryCountdownLabel, deliveryDateFor, money, pct } from "./lavadoPedidosMath";

export type LavadoPedidoConfigRow = Database["public"]["Tables"]["lavado_pedidos_config"]["Row"];
export type LavadoPedidoRow = Database["public"]["Tables"]["lavado_pedidos"]["Row"];

export type LavadoPedidoWithUsers = LavadoPedidoRow & {
  creado_por?: { id: string; username: string; display_name: string | null } | null;
  completado_por?: { id: string; username: string; display_name: string | null } | null;
};

const pedidoSelect = `
  *,
  creado_por:profiles!lavado_pedidos_creado_por_usuario_id_fkey (
    id,
    username,
    display_name
  ),
  completado_por:profiles!lavado_pedidos_completado_por_usuario_id_fkey (
    id,
    username,
    display_name
  )
`;

export async function fetchLavadoPedidosConfig(): Promise<LavadoPedidoConfigRow> {
  const { data, error } = await supabase.from("lavado_pedidos_config").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as LavadoPedidoConfigRow;
}

export async function updateLavadoPedidosConfig(
  patch: Database["public"]["Tables"]["lavado_pedidos_config"]["Update"]
): Promise<LavadoPedidoConfigRow> {
  const { data, error } = await supabase.from("lavado_pedidos_config").update(patch).eq("id", 1).select("*").single();
  if (error) throw error;
  return data as LavadoPedidoConfigRow;
}

export async function fetchLavadoPedidos(): Promise<LavadoPedidoWithUsers[]> {
  const { data, error } = await supabase
    .from("lavado_pedidos")
    .select(pedidoSelect)
    .order("fecha_creacion", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as LavadoPedidoWithUsers[];
}

export async function createLavadoPedido(input: {
  userId: string;
  orgPersona: string;
  monto: number;
  tipoPago: LavadoPedidoTipoPago;
  notas: string | null;
  config: LavadoPedidoConfigRow;
}): Promise<LavadoPedidoRow> {
  const org = input.orgPersona.trim();
  if (!org) throw new Error("Org/Persona es requerido.");
  if (!Number.isFinite(input.monto) || input.monto <= 0) throw new Error("Cantidad a lavar inválida.");

  const calc = calcLavadoPedido(input.monto, input.tipoPago, input.config);
  const row: Database["public"]["Tables"]["lavado_pedidos"]["Insert"] = {
    org_persona: org,
    monto: input.monto,
    tipo_pago: input.tipoPago,
    comision_pct: calc.comisionPct,
    script_pct: calc.scriptPct,
    monto_entregar: calc.montoEntregar,
    descuento_total: calc.descuentoTotal,
    perdida_script: calc.perdidaScript,
    ganancia_real_banda: calc.gananciaRealBanda,
    fecha_entrega: deliveryDateFor(input.tipoPago, input.config.dias_entrega_plazo),
    estado: input.tipoPago === "instantaneo" ? "recibido" : "en_espera",
    creado_por_usuario_id: input.userId,
    notas: input.notas,
  };

  const { data, error } = await supabase.from("lavado_pedidos").insert(row).select("*").single();
  if (error) throw error;
  return data as LavadoPedidoRow;
}

export async function updateLavadoPedidoEstado(input: {
  id: string;
  estado: LavadoPedidoEstado;
  userId: string;
}): Promise<LavadoPedidoRow> {
  const patch: Database["public"]["Tables"]["lavado_pedidos"]["Update"] = {
    estado: input.estado,
    updated_by: input.userId,
  };
  if (input.estado === "completado") {
    patch.completado_at = new Date().toISOString();
    patch.completado_por_usuario_id = input.userId;
  }
  if (input.estado === "cancelado") {
    patch.cancelado_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from("lavado_pedidos").update(patch).eq("id", input.id).select("*").single();
  if (error) throw error;
  return data as LavadoPedidoRow;
}

export async function updateLavadoPedidoNotas(input: {
  id: string;
  notas: string | null;
  userId: string;
}): Promise<LavadoPedidoRow> {
  const { data, error } = await supabase
    .from("lavado_pedidos")
    .update({ notas: input.notas, updated_by: input.userId })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as LavadoPedidoRow;
}

export async function deleteLavadoPedido(id: string): Promise<void> {
  const { error } = await supabase.from("lavado_pedidos").delete().eq("id", id);
  if (error) throw error;
}

function displayUser(pedido: LavadoPedidoWithUsers | LavadoPedidoRow) {
  const maybe = pedido as LavadoPedidoWithUsers;
  return maybe.creado_por?.display_name?.trim() || maybe.creado_por?.username || "—";
}

function deliveryUnix(fechaEntrega: string | null) {
  if (!fechaEntrega) return null;
  return Math.floor(new Date(`${fechaEntrega}T12:00:00`).getTime() / 1000);
}

function baseFields(pedido: LavadoPedidoWithUsers | LavadoPedidoRow) {
  return [
    { name: "Org/Persona", value: pedido.org_persona, inline: true },
    { name: "Tipo", value: pedido.tipo_pago === "instantaneo" ? "Instantáneo" : "7 días", inline: true },
    { name: "Estado", value: pedido.estado.replace(/_/g, " "), inline: true },
    { name: "Monto recibido", value: money(Number(pedido.monto)), inline: true },
    { name: "Cliente recibe", value: money(Number(pedido.monto_entregar)), inline: true },
    { name: "Descuento total", value: `${money(Number(pedido.descuento_total))} (${pct(Number(pedido.comision_pct))})`, inline: true },
    { name: "Pérdida script", value: `${money(Number(pedido.perdida_script))} (${pct(Number(pedido.script_pct))})`, inline: true },
    { name: "Ganancia real banda", value: money(Number(pedido.ganancia_real_banda)), inline: true },
    { name: "Creado por", value: displayUser(pedido), inline: true },
  ];
}

async function postDiscordWebhook(input: {
  webhookUrl: string;
  content?: string;
  embed: Record<string, unknown>;
  roleId?: string | null;
}) {
  const body: Record<string, unknown> = {
    embeds: [input.embed],
  };
  if (input.content) body.content = input.content;
  if (input.roleId) {
    body.allowed_mentions = { roles: [input.roleId] };
  }
  const res = await fetch(input.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`discord_http_${res.status}`);
}

export async function sendLavadoPedidoCreatedWebhook(input: {
  pedido: LavadoPedidoWithUsers | LavadoPedidoRow;
  webhookUrl: string | null | undefined;
}) {
  const webhookUrl = input.webhookUrl?.trim();
  const pedido = input.pedido;
  if (!webhookUrl || pedido.tipo_pago !== "plazo_7_dias" || pedido.webhook_creado_notified_at) return;

  const deliveryTs = deliveryUnix(pedido.fecha_entrega);
  const embed = {
    title: "Nuevo pedido de lavado a 7 días",
    description: deliveryTs
      ? `Entrega programada: <t:${deliveryTs}:F>\nCuenta regresiva: <t:${deliveryTs}:R>`
      : "Entrega programada sin fecha.",
    color: 10181046,
    fields: baseFields(pedido),
    timestamp: new Date().toISOString(),
  };
  await postDiscordWebhook({ webhookUrl, embed });
  await supabase
    .from("lavado_pedidos")
    .update({ webhook_creado_notified_at: new Date().toISOString() })
    .eq("id", pedido.id)
    .is("webhook_creado_notified_at", null);
}

export async function sendLavadoPedidoInstantCompletedWebhook(input: {
  pedido: LavadoPedidoWithUsers | LavadoPedidoRow;
  webhookUrl: string | null | undefined;
}) {
  const webhookUrl = input.webhookUrl?.trim();
  const pedido = input.pedido;
  if (!webhookUrl || pedido.tipo_pago !== "instantaneo" || pedido.webhook_completado_notified_at) return;

  const embed = {
    title: "Pedido instantáneo completado",
    description: "Se completó un pedido de lavado instantáneo.",
    color: 5763719,
    fields: baseFields(pedido),
    timestamp: new Date().toISOString(),
  };
  await postDiscordWebhook({ webhookUrl, embed });
  await supabase
    .from("lavado_pedidos")
    .update({ webhook_completado_notified_at: new Date().toISOString() })
    .eq("id", pedido.id)
    .is("webhook_completado_notified_at", null);
}

export async function sendLavadoPedidoDueTodayWebhook(input: {
  pedido: LavadoPedidoWithUsers;
  webhookUrl: string | null | undefined;
  roleId: string | null | undefined;
}) {
  const webhookUrl = input.webhookUrl?.trim();
  const roleId = input.roleId?.trim();
  const pedido = input.pedido;
  if (!webhookUrl || pedido.tipo_pago !== "plazo_7_dias" || pedido.webhook_entrega_hoy_notified_at) return;

  const { data: locked, error: lockErr } = await supabase
    .from("lavado_pedidos")
    .update({ webhook_locked_at: new Date().toISOString() })
    .eq("id", pedido.id)
    .is("webhook_entrega_hoy_notified_at", null)
    .is("webhook_locked_at", null)
    .select("*")
    .single();
  if (lockErr || !locked) return;

  try {
    const deliveryTs = deliveryUnix(pedido.fecha_entrega);
    const content = roleId ? `<@&${roleId}>` : undefined;
    const embed = {
      title: "ENTREGA DE LAVADO HOY",
      description: [
        "Hoy hay que entregar este pedido de lavado.",
        `Estado de entrega: ${deliveryCountdownLabel(pedido.tipo_pago, pedido.fecha_entrega)}`,
        deliveryTs ? `Fecha objetivo: <t:${deliveryTs}:F>` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      color: 15548997,
      fields: baseFields(pedido),
      timestamp: new Date().toISOString(),
    };
    await postDiscordWebhook({ webhookUrl, content, embed, roleId });
    await supabase
      .from("lavado_pedidos")
      .update({ webhook_entrega_hoy_notified_at: new Date().toISOString(), webhook_locked_at: null })
      .eq("id", pedido.id);
  } catch (e) {
    await supabase.from("lavado_pedidos").update({ webhook_locked_at: null }).eq("id", pedido.id);
    throw e;
  }
}

function testPedido(tipoPago: LavadoPedidoTipoPago, estado: LavadoPedidoEstado, fechaEntrega: string | null): LavadoPedidoRow {
  const monto = 1_000_000;
  const config = {
    comision_instantaneo: 0.4,
    comision_7_dias: 0.33,
    script_porcentaje: 0.27,
    dias_entrega_plazo: 7,
  };
  const calc = calcLavadoPedido(monto, tipoPago, config);
  return {
    id: "test-webhook",
    org_persona: "TEST Org/Persona",
    monto,
    tipo_pago: tipoPago,
    comision_pct: calc.comisionPct,
    script_pct: calc.scriptPct,
    monto_entregar: calc.montoEntregar,
    descuento_total: calc.descuentoTotal,
    perdida_script: calc.perdidaScript,
    ganancia_real_banda: calc.gananciaRealBanda,
    fecha_creacion: new Date().toISOString(),
    fecha_entrega: fechaEntrega,
    estado,
    creado_por_usuario_id: "test",
    completado_por_usuario_id: null,
    completado_at: estado === "completado" ? new Date().toISOString() : null,
    cancelado_at: null,
    webhook_creado_notified_at: null,
    webhook_completado_notified_at: null,
    webhook_entrega_hoy_notified_at: null,
    webhook_locked_at: null,
    notas: "Mensaje de prueba desde Admin.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

export async function sendLavadoPedidoWebhookTest(input: {
  kind: "created_7_days" | "instant_completed" | "due_today";
  webhookUrl: string;
  roleId?: string | null;
}) {
  const webhookUrl = input.webhookUrl.trim();
  if (!webhookUrl) throw new Error("Configurá el webhook primero.");

  const today = new Date().toISOString().slice(0, 10);
  const sevenDays = deliveryDateFor("plazo_7_dias", 7) ?? today;
  if (input.kind === "created_7_days") {
    const pedido = testPedido("plazo_7_dias", "en_espera", sevenDays);
    const deliveryTs = deliveryUnix(pedido.fecha_entrega);
    await postDiscordWebhook({
      webhookUrl,
      embed: {
        title: "[TEST] Nuevo pedido de lavado a 7 días",
        description: deliveryTs
          ? `Entrega programada: <t:${deliveryTs}:F>\nCuenta regresiva: <t:${deliveryTs}:R>`
          : "Entrega programada sin fecha.",
        color: 10181046,
        fields: baseFields(pedido),
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (input.kind === "instant_completed") {
    const pedido = testPedido("instantaneo", "completado", null);
    await postDiscordWebhook({
      webhookUrl,
      embed: {
        title: "[TEST] Pedido instantáneo completado",
        description: "Se completó un pedido de lavado instantáneo.",
        color: 5763719,
        fields: baseFields(pedido),
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const pedido = testPedido("plazo_7_dias", "listo_para_entregar", today);
  const deliveryTs = deliveryUnix(pedido.fecha_entrega);
  const roleId = input.roleId?.trim();
  await postDiscordWebhook({
    webhookUrl,
    roleId,
    content: roleId ? `<@&${roleId}>` : undefined,
    embed: {
      title: "[TEST] ENTREGA DE LAVADO HOY",
      description: [
        "Hoy hay que entregar este pedido de lavado.",
        `Estado de entrega: ${deliveryCountdownLabel(pedido.tipo_pago, pedido.fecha_entrega)}`,
        deliveryTs ? `Fecha objetivo: <t:${deliveryTs}:F>` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      color: 15548997,
      fields: baseFields(pedido),
      timestamp: new Date().toISOString(),
    },
  });
}
