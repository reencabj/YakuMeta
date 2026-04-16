import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type TipoEvento = "nuevo_pedido" | "pedido_entregado";

type NotifyBody = {
  tipo_evento: TipoEvento;
  cliente: string;
  kilos: number;
  monto?: number;
};

type OkResponse = { ok: true } | { ok: false; error: string };

/** Rol @lab — debe existir en el servidor y el webhook tener permiso para mencionar roles. */
const LAB_ROLE_ID = "1376987062389178388";

const COLOR_NUEVO_PEDIDO = 16753920;
const COLOR_PEDIDO_ENTREGADO = 5763719;

type DiscordEmbed = {
  title: string;
  description?: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer: { text: string };
  timestamp: string;
};

type DiscordWebhookPayload = {
  content: string;
  allowed_mentions: { parse: string[] };
  embeds: DiscordEmbed[];
};

const corsHeaders = (req: Request): HeadersInit => {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

function jsonResponse(req: Request, body: OkResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function formatMonto(monto: number): string {
  if (!Number.isFinite(monto)) return "—";
  const rounded = Math.round(monto * 100) / 100;
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  const n = isInt ? Math.round(rounded) : rounded;
  const s = new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(n);
  return `$${s}`;
}

function buildEmbed(body: NotifyBody, timestampIso: string): DiscordEmbed {
  const cliente = (body.cliente ?? "").trim() || "—";
  const kilosStr = Number.isFinite(body.kilos) ? `${body.kilos} kg` : "—";

  if (body.tipo_evento === "nuevo_pedido") {
    return {
      title: "🧾 Nuevo pedido",
      description: "Se registró un nuevo pedido",
      color: COLOR_NUEVO_PEDIDO,
      fields: [
        { name: "👤 Cliente", value: cliente, inline: true },
        { name: "📦 Cantidad", value: kilosStr, inline: true },
      ],
      footer: { text: "Sistema de pedidos" },
      timestamp: timestampIso,
    };
  }

  const montoStr = body.monto !== undefined && body.monto !== null ? formatMonto(body.monto) : "—";
  return {
    title: "✅ Pedido entregado",
    description: "Pedido completado correctamente",
    color: COLOR_PEDIDO_ENTREGADO,
    fields: [
      { name: "👤 Cliente", value: cliente, inline: true },
      { name: "📦 Cantidad", value: kilosStr, inline: true },
      { name: "💰 Monto", value: montoStr, inline: true },
    ],
    footer: { text: "Sistema de pedidos" },
    timestamp: timestampIso,
  };
}

function buildPayload(embed: DiscordEmbed): DiscordWebhookPayload {
  return {
    content: `<@&${LAB_ROLE_ID}>`,
    allowed_mentions: { parse: ["roles"] },
    embeds: [embed],
  };
}

/** Límite práctico de Discord para el cuerpo del embed (documentación ~6000 chars en embeds combinados). */
function payloadWithinDiscordLimits(payload: DiscordWebhookPayload): boolean {
  const n = JSON.stringify(payload).length;
  return n <= 5500;
}

function parseBody(raw: unknown): { ok: true; value: NotifyBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_json" };
  }
  const o = raw as Record<string, unknown>;
  const tipo = o.tipo_evento;
  if (tipo !== "nuevo_pedido" && tipo !== "pedido_entregado") {
    return { ok: false, error: "invalid_tipo_evento" };
  }
  const cliente = o.cliente;
  if (typeof cliente !== "string" || !cliente.trim()) {
    return { ok: false, error: "cliente_required" };
  }
  const kilos = o.kilos;
  if (typeof kilos !== "number" || !Number.isFinite(kilos) || kilos <= 0) {
    return { ok: false, error: "invalid_kilos" };
  }

  if (tipo === "nuevo_pedido") {
    return {
      ok: true,
      value: {
        tipo_evento: "nuevo_pedido",
        cliente: cliente.trim(),
        kilos,
      },
    };
  }

  const monto = o.monto;
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: "invalid_monto" };
  }
  return {
    ok: true,
    value: {
      tipo_evento: "pedido_entregado",
      cliente: cliente.trim(),
      kilos,
      monto,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[notify-discord] server_misconfigured (missing SUPABASE_URL or SUPABASE_ANON_KEY)");
    return jsonResponse(req, { ok: false, error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(req, { ok: false, error: "missing_authorization" }, 401);
  }

  const jwt = authHeader.slice("Bearer ".length);
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser(jwt);

  if (userErr || !user) {
    console.error("[notify-discord] invalid_jwt", userErr?.message);
    return jsonResponse(req, { ok: false, error: "invalid_jwt" }, 401);
  }

  let parsed: NotifyBody;
  try {
    const raw = await req.json();
    const pr = parseBody(raw);
    if (!pr.ok) {
      console.error("[notify-discord] validation_error", pr.error);
      return jsonResponse(req, { ok: false, error: pr.error }, 400);
    }
    parsed = pr.value;
  } catch (e) {
    console.error("[notify-discord] json_parse_error", e);
    return jsonResponse(req, { ok: false, error: "invalid_json" }, 400);
  }

  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL")?.trim();
  if (!webhookUrl) {
    console.error("[notify-discord] DISCORD_WEBHOOK_URL not configured");
    return jsonResponse(req, { ok: false, error: "webhook_not_configured" }, 500);
  }

  const timestampIso = new Date().toISOString();
  const embed = buildEmbed(parsed, timestampIso);
  const payload = buildPayload(embed);

  if (!payloadWithinDiscordLimits(payload)) {
    console.error("[notify-discord] payload_too_long");
    return jsonResponse(req, { ok: false, error: "payload_too_long" }, 400);
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[notify-discord] discord_http_error", res.status, detail.slice(0, 500));
      return jsonResponse(req, { ok: false, error: `discord_http_${res.status}` }, 502);
    }

    return jsonResponse(req, { ok: true });
  } catch (e) {
    console.error("[notify-discord] discord_request_failed", e);
    return jsonResponse(req, { ok: false, error: "discord_request_failed" }, 502);
  }
});
