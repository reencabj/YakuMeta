import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type TipoEvento = "nuevo_pedido" | "pedido_entregado";

type OrigenPedido = "admin" | "portal_clientes";

type NotifyBody = {
  tipo_evento: TipoEvento;
  cliente: string;
  kilos: number;
  monto?: number;
  origen_pedido?: OrigenPedido;
  /** KPI globales (misma vista `v_pedidos_kpis` que la app). */
  pedidos_abiertos_kg?: number;
  stock_disponible_kg?: number;
  tiradas_faltantes?: number;
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function isServiceRoleRequest(authHeader: string | null): boolean {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!service || !authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  return timingSafeEqual(token, service);
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

function origenLabel(origen?: OrigenPedido): string {
  if (origen === "portal_clientes") return "Portal de clientes";
  return "Panel interno";
}

function fmtKgKpi(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const s = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
  return `${s} kg`;
}

function fmtTiradas(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function buildEmbed(body: NotifyBody, timestampIso: string): DiscordEmbed {
  const cliente = (body.cliente ?? "").trim() || "—";
  const kilosStr = Number.isFinite(body.kilos) ? `${body.kilos} kg` : "—";

  if (body.tipo_evento === "nuevo_pedido") {
    const origen = origenLabel(body.origen_pedido);
    return {
      title: "🧾 Nuevo pedido",
      description: "Se registró un nuevo pedido",
      color: COLOR_NUEVO_PEDIDO,
      fields: [
        { name: "👤 Cliente", value: cliente, inline: true },
        { name: "📦 Cantidad", value: kilosStr, inline: true },
        { name: "🌐 Origen", value: origen, inline: true },
        { name: "📊 Pedidos abiertos", value: fmtKgKpi(body.pedidos_abiertos_kg), inline: true },
        { name: "📦 Stock disponible", value: fmtKgKpi(body.stock_disponible_kg), inline: true },
        { name: "🧪 Tiradas faltantes", value: fmtTiradas(body.tiradas_faltantes), inline: true },
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

function payloadWithinDiscordLimits(payload: DiscordWebhookPayload): boolean {
  return JSON.stringify(payload).length <= 5500;
}

/** PostgREST suele devolver `numeric` como string; el cliente a veces manda strings o omite claves. */
function coerceFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Misma vista que la UI; con service role se evita depender de que el cliente haya podido leer la fila
 * (NaN → JSON null, tipos string, etc.).
 */
async function loadPedidosKpisFromDb(): Promise<
  Pick<NotifyBody, "pedidos_abiertos_kg" | "stock_disponible_kg" | "tiradas_faltantes"> | null
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !service) {
    console.error("[notify-discord] loadPedidosKpisFromDb: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  const admin = createClient(supabaseUrl, service);
  const { data, error } = await admin.from("v_pedidos_kpis").select("*").maybeSingle();
  if (error) {
    console.error("[notify-discord] v_pedidos_kpis select", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    pedidos_abiertos_kg: coerceFiniteNumber(row.total_pedidos_abiertos_kg),
    stock_disponible_kg: coerceFiniteNumber(row.total_stock_disponible_kg),
    tiradas_faltantes: coerceFiniteNumber(row.tiradas_faltantes),
  };
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
    const rawOrigen = o.origen_pedido;
    let origen_pedido: OrigenPedido | undefined;
    if (rawOrigen === undefined || rawOrigen === null) {
      origen_pedido = undefined;
    } else if (rawOrigen === "admin" || rawOrigen === "portal_clientes") {
      origen_pedido = rawOrigen;
    } else {
      return { ok: false, error: "invalid_origen_pedido" };
    }

    return {
      ok: true,
      value: {
        tipo_evento: "nuevo_pedido",
        cliente: cliente.trim(),
        kilos,
        origen_pedido,
        pedidos_abiertos_kg: coerceFiniteNumber(o.pedidos_abiertos_kg),
        stock_disponible_kg: coerceFiniteNumber(o.stock_disponible_kg),
        tiradas_faltantes: coerceFiniteNumber(o.tiradas_faltantes),
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

async function assertUserJwt(authHeader: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[notify-discord] server_misconfigured (missing SUPABASE_URL or SUPABASE_ANON_KEY)");
    return { ok: false, error: "server_misconfigured" };
  }
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const jwt = authHeader.slice("Bearer ".length);
  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser(jwt);
  if (userErr || !user) {
    console.error("[notify-discord] invalid_jwt", userErr?.message);
    return { ok: false, error: "invalid_jwt" };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(req, { ok: false, error: "missing_authorization" }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    console.error("[notify-discord] json_parse_error", e);
    return jsonResponse(req, { ok: false, error: "invalid_json" }, 400);
  }

  const internal = isServiceRoleRequest(authHeader);
  if (!internal) {
    const authRes = await assertUserJwt(authHeader);
    if (!authRes.ok) {
      return jsonResponse(req, { ok: false, error: authRes.error }, authRes.error === "server_misconfigured" ? 500 : 401);
    }
  }

  const pr = parseBody(raw);
  if (!pr.ok) {
    console.error("[notify-discord] validation_error", pr.error);
    return jsonResponse(req, { ok: false, error: pr.error }, 400);
  }
  let parsed = pr.value;

  if (parsed.tipo_evento === "nuevo_pedido") {
    const fromDb = await loadPedidosKpisFromDb();
    if (fromDb) {
      parsed = {
        ...parsed,
        pedidos_abiertos_kg: fromDb.pedidos_abiertos_kg ?? parsed.pedidos_abiertos_kg,
        stock_disponible_kg: fromDb.stock_disponible_kg ?? parsed.stock_disponible_kg,
        tiradas_faltantes: fromDb.tiradas_faltantes ?? parsed.tiradas_faltantes,
      };
    }
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
