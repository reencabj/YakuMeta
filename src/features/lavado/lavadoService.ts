import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { LavadoAlmacenId } from "./lavadoConstants";
import { lavadoTandaSlotLabel } from "./lavadoConstants";
import { processDurationSeconds, processOutput, type LavadoProcesoId } from "./lavadoMath";

export type LavadoConfigRow = Database["public"]["Tables"]["lavado_config"]["Row"];
export type LavadoTandaRow = Database["public"]["Tables"]["lavado_tandas"]["Row"];
export type LavadoMoneyTotalsRow = Database["public"]["Views"]["v_lavado_money_totals"]["Row"];
export type LavadoMoneyByAlmacenRow = Database["public"]["Views"]["v_lavado_money_by_almacen"]["Row"];

export type LavadoMoneySummary = {
  totals: LavadoMoneyTotalsRow;
  byAlmacen: LavadoMoneyByAlmacenRow[];
};

export async function fetchLavadoConfig(): Promise<LavadoConfigRow> {
  const { data, error } = await supabase.from("lavado_config").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as LavadoConfigRow;
}

export async function updateLavadoConfig(patch: Database["public"]["Tables"]["lavado_config"]["Update"]) {
  const { data, error } = await supabase.from("lavado_config").update(patch).eq("id", 1).select("*").single();
  if (error) throw error;
  return data as LavadoConfigRow;
}

export async function fetchLavadoTandas() {
  const { data, error } = await supabase
    .from("lavado_tandas")
    .select("*")
    .order("iniciado_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as LavadoTandaRow[];
}

export async function fetchLavadoMoneySummary(): Promise<LavadoMoneySummary> {
  const [totalsRes, byAlmacenRes] = await Promise.all([
    supabase.from("v_lavado_money_totals").select("*").maybeSingle(),
    supabase.from("v_lavado_money_by_almacen").select("*").order("almacen"),
  ]);
  if (totalsRes.error) throw totalsRes.error;
  if (byAlmacenRes.error) throw byAlmacenRes.error;

  const emptyTotals: LavadoMoneyTotalsRow = {
    ingresado_completado: 0,
    salida_completado: 0,
    ingresado_activo: 0,
    salida_activo: 0,
    tandas_imprimir_completadas: 0,
    tandas_secar_completadas: 0,
    tandas_imprimir_activas: 0,
    tandas_secar_activas: 0,
  };

  return {
    totals: (totalsRes.data as LavadoMoneyTotalsRow | null) ?? emptyTotals,
    byAlmacen: (byAlmacenRes.data ?? []) as LavadoMoneyByAlmacenRow[],
  };
}

function processCfg(config: LavadoConfigRow, process: LavadoProcesoId) {
  if (process === "imprimir") {
    const maximo = Number(config.max_proceso_1);
    return {
      min: Number(config.min_proceso_1),
      max: maximo,
      maximo,
      loss: Number(config.perdida_proceso_1),
      automatico: true,
      baseMinutos: Number(config.duracion_base_p1_minutos),
    };
  }
  if (process === "cortar") {
    const maximo = Number(config.max_proceso_2);
    return {
      min: Number(config.min_proceso_2),
      max: maximo,
      maximo,
      loss: Number(config.perdida_proceso_2),
      automatico: false,
      manualSegundos: Number(config.duracion_manual_p2_segundos),
    };
  }
  if (process === "secar") {
    const maximo = Number(config.max_proceso_3);
    return {
      min: Number(config.min_proceso_3),
      max: maximo,
      maximo,
      loss: Number(config.perdida_proceso_3),
      automatico: true,
      baseMinutos: Number(config.duracion_base_p3_minutos),
    };
  }
  const maximo = Number(config.max_proceso_4);
  return {
    min: Number(config.min_proceso_4),
    max: maximo,
    maximo,
    loss: Number(config.perdida_proceso_4),
    automatico: false,
    manualSegundos: Number(config.duracion_manual_p4_segundos),
  };
}

export async function createLavadoTanda(input: {
  userId: string;
  almacen: LavadoAlmacenId;
  process: LavadoProcesoId;
  amount: number;
  station: number;
  config: LavadoConfigRow;
}) {
  const cfg = processCfg(input.config, input.process);
  if (input.amount < cfg.min || input.amount > cfg.max) {
    throw new Error(`Monto inválido para ${input.process}: permitido ${cfg.min} - ${cfg.max}.`);
  }
  const durationSeconds = processDurationSeconds(cfg, input.amount);
  const finishAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  const expectedOutput = processOutput(input.amount, cfg.loss);

  const { data: inUse, error: inUseErr } = await supabase
    .from("lavado_tandas")
    .select("id")
    .eq("almacen", input.almacen)
    .eq("proceso", input.process)
    .eq("estacion", input.station)
    .eq("estado", "activo")
    .limit(1);
  if (inUseErr) throw inUseErr;
  if ((inUse ?? []).length > 0) {
    const slot = lavadoTandaSlotLabel({
      almacen: input.almacen,
      proceso: input.process,
      estacion: input.station,
    });
    throw new Error(`${slot} ya está ocupada.`);
  }

  const row: Database["public"]["Tables"]["lavado_tandas"]["Insert"] = {
    usuario_id: input.userId,
    almacen: input.almacen,
    proceso: input.process,
    monto_entrada: input.amount,
    monto_salida_esperado: expectedOutput,
    estacion: input.station,
    finaliza_estimado_at: finishAt,
    estado: "activo",
  };
  const { data, error } = await supabase.from("lavado_tandas").insert(row).select("*").single();
  if (error) throw error;
  return data as LavadoTandaRow;
}

export async function completeLavadoTanda(id: string) {
  const { data, error } = await supabase
    .from("lavado_tandas")
    .update({ estado: "completado", finalizado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "activo")
    .select("*")
    .single();
  if (error) throw error;
  return data as LavadoTandaRow;
}

export async function cancelLavadoTanda(id: string) {
  const { data, error } = await supabase
    .from("lavado_tandas")
    .update({ estado: "cancelado", finalizado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "activo")
    .select("*")
    .single();
  if (error) throw error;
  return data as LavadoTandaRow;
}

export async function reconcileExpiredLavadoTandas() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("lavado_tandas")
    .update({ estado: "completado", finalizado_at: nowIso })
    .eq("estado", "activo")
    .lte("finaliza_estimado_at", nowIso)
    .select("*");
  if (error) throw error;
  return (data ?? []) as LavadoTandaRow[];
}

function formatUsd(n: number) {
  return `$${Number(n).toLocaleString("en-US")}`;
}

/** Rol a pingear cuando termina una tanda de lavado. */
const LAVADO_FINISHED_ROLE_ID = "1501920920783290378";

function postLavadoDiscordWebhook(input: {
  webhookUrl: string;
  content?: string;
  embed: Record<string, unknown>;
  pingRole?: boolean;
}) {
  const body: Record<string, unknown> = { embeds: [input.embed] };
  if (input.content) body.content = input.content;
  if (input.pingRole) {
    body.allowed_mentions = { roles: [LAVADO_FINISHED_ROLE_ID] };
  }
  return fetch(input.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendLavadoDiscordWebhookStarted(input: { tanda: LavadoTandaRow; username: string; webhookUrl: string }) {
  const { data: lockData, error: lockErr } = await supabase
    .from("lavado_tandas")
    .update({ webhook_locked_at: new Date().toISOString() })
    .eq("id", input.tanda.id)
    .is("webhook_started_notified_at", null)
    .is("webhook_locked_at", null)
    .select("*")
    .single();
  if (lockErr || !lockData) return;

  try {
    const endUnix = Math.floor(new Date(input.tanda.finaliza_estimado_at).getTime() / 1000);
    const slot = lavadoTandaSlotLabel({
      almacen: input.tanda.almacen,
      proceso: input.tanda.proceso,
      estacion: input.tanda.estacion,
    });
    const embed = {
      title: "Lavado iniciado",
      description: [
        `**${slot}**`,
        `${formatUsd(input.tanda.monto_entrada)} → ${formatUsd(input.tanda.monto_salida_esperado)} · ${input.username || "—"}`,
        `Termina <t:${endUnix}:R>`,
      ].join("\n"),
      color: 10181046,
    };
    const res = await postLavadoDiscordWebhook({ webhookUrl: input.webhookUrl, embed });
    if (!res.ok) throw new Error(`discord_http_${res.status}`);
    await supabase
      .from("lavado_tandas")
      .update({ webhook_started_notified_at: new Date().toISOString(), webhook_locked_at: null })
      .eq("id", input.tanda.id);
  } catch {
    await supabase.from("lavado_tandas").update({ webhook_locked_at: null }).eq("id", input.tanda.id);
  }
}

export async function sendLavadoDiscordWebhookFinished(input: { tanda: LavadoTandaRow; username: string; webhookUrl: string }) {
  const estimatedEndMs = new Date(input.tanda.finaliza_estimado_at).getTime();
  if (Number.isFinite(estimatedEndMs) && Date.now() < estimatedEndMs) {
    return;
  }

  const { data: lockData, error: lockErr } = await supabase
    .from("lavado_tandas")
    .update({ webhook_locked_at: new Date().toISOString() })
    .eq("id", input.tanda.id)
    .is("webhook_notified_at", null)
    .is("webhook_locked_at", null)
    .select("*")
    .single();
  if (lockErr) return;
  if (!lockData) return;

  try {
    const slot = lavadoTandaSlotLabel({
      almacen: input.tanda.almacen,
      proceso: input.tanda.proceso,
      estacion: input.tanda.estacion,
    });
    const embed = {
      title: "Lavado finalizado",
      description: [`**${slot}**`, `${formatUsd(input.tanda.monto_entrada)} → ${formatUsd(input.tanda.monto_salida_esperado)}`].join(
        "\n"
      ),
      color: 5763719,
    };

    const res = await postLavadoDiscordWebhook({
      webhookUrl: input.webhookUrl,
      content: `<@&${LAVADO_FINISHED_ROLE_ID}>`,
      embed,
      pingRole: true,
    });
    if (!res.ok) {
      throw new Error(`discord_http_${res.status}`);
    }
    await supabase
      .from("lavado_tandas")
      .update({ webhook_notified_at: new Date().toISOString(), webhook_locked_at: null })
      .eq("id", input.tanda.id);
  } catch {
    await supabase.from("lavado_tandas").update({ webhook_locked_at: null }).eq("id", input.tanda.id);
  }
}
