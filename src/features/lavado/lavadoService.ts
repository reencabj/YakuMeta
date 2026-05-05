import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import { processDurationSeconds, processOutput, type LavadoProcesoId } from "./lavadoMath";

export type LavadoConfigRow = Database["public"]["Tables"]["lavado_config"]["Row"];
export type LavadoTandaRow = Database["public"]["Tables"]["lavado_tandas"]["Row"];

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

function processCfg(config: LavadoConfigRow, process: LavadoProcesoId) {
  if (process === "imprimir") {
    return {
      min: Number(config.min_proceso_1),
      max: Number(config.max_proceso_1),
      loss: Number(config.perdida_proceso_1),
      automatico: true,
      baseMinutos: Number(config.duracion_base_p1_minutos),
    };
  }
  if (process === "cortar") {
    return {
      min: Number(config.min_proceso_2),
      max: Number(config.max_proceso_2),
      loss: Number(config.perdida_proceso_2),
      automatico: false,
      manualSegundos: Number(config.duracion_manual_p2_segundos),
    };
  }
  if (process === "secar") {
    return {
      min: Number(config.min_proceso_3),
      max: Number(config.max_proceso_3),
      loss: Number(config.perdida_proceso_3),
      automatico: true,
      baseMinutos: Number(config.duracion_base_p3_minutos),
    };
  }
  return {
    min: Number(config.min_proceso_4),
    max: Number(config.max_proceso_4),
    loss: Number(config.perdida_proceso_4),
    automatico: false,
    manualSegundos: Number(config.duracion_manual_p4_segundos),
  };
}

export async function createLavadoTanda(input: {
  userId: string;
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
    .eq("proceso", input.process)
    .eq("estacion", input.station)
    .eq("estado", "activo")
    .limit(1);
  if (inUseErr) throw inUseErr;
  if ((inUse ?? []).length > 0) {
    throw new Error("La estación seleccionada ya está ocupada.");
  }

  const row: Database["public"]["Tables"]["lavado_tandas"]["Insert"] = {
    usuario_id: input.userId,
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

function durationLabel(fromIso: string, toIso: string) {
  const sec = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
    const start = new Date(input.tanda.iniciado_at);
    const end = new Date(input.tanda.finaliza_estimado_at);
    const endUnix = Math.floor(end.getTime() / 1000);
    const embed = {
      title: "Lavado iniciado",
      description: `Se inició el proceso ${input.tanda.proceso}.`,
      color: 10181046,
      fields: [
        { name: "Usuario", value: input.username || "—", inline: true },
        { name: "Proceso", value: input.tanda.proceso, inline: true },
        { name: "Estación", value: String(input.tanda.estacion), inline: true },
        { name: "Monto inicial", value: `$${Number(input.tanda.monto_entrada).toLocaleString("en-US")}`, inline: true },
        { name: "Salida esperada", value: `$${Number(input.tanda.monto_salida_esperado).toLocaleString("en-US")}`, inline: true },
        { name: "Duración", value: durationLabel(input.tanda.iniciado_at, input.tanda.finaliza_estimado_at), inline: true },
        { name: "Finaliza", value: `<t:${endUnix}:F>`, inline: true },
        { name: "Cuenta regresiva", value: `<t:${endUnix}:R>`, inline: true },
        { name: "Inicio", value: start.toLocaleString("es-AR"), inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
    const res = await fetch(input.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
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
    const start = new Date(input.tanda.iniciado_at);
    const end = new Date();
    const durationMs = end.getTime() - start.getTime();
    const endUnix = Math.floor(end.getTime() / 1000);

    const embed = {
      title: "Lavado finalizado",
      description: `El tiempo del proceso ${input.tanda.proceso} llegó a su fin.`,
      color: 5763719,
      fields: [
        { name: "Usuario", value: input.username || "—", inline: true },
        { name: "Proceso", value: input.tanda.proceso, inline: true },
        { name: "Estación", value: String(input.tanda.estacion), inline: true },
        { name: "Monto inicial", value: `$${Number(input.tanda.monto_entrada).toLocaleString("en-US")}`, inline: true },
        { name: "Monto final", value: `$${Number(input.tanda.monto_salida_esperado).toLocaleString("en-US")}`, inline: true },
        { name: "Inicio", value: start.toLocaleString("es-AR"), inline: true },
        { name: "Finalización", value: `<t:${endUnix}:F>`, inline: true },
        { name: "Duración", value: `${Math.max(0, Math.round(durationMs / 1000))}s`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(input.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
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
