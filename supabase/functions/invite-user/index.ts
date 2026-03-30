import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = (req: Request): HeadersInit => {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

type InviteBody = {
  email?: string;
  username?: string;
  display_name?: string | null;
  role?: string;
};

Deno.serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500, headers });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing_authorization" }), { status: 401, headers });
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.slice("Bearer ".length);
    const {
      data: { user: caller },
      error: userErr,
    } = await supabaseUser.auth.getUser(jwt);

    if (userErr || !caller) {
      return new Response(JSON.stringify({ error: "invalid_jwt" }), { status: 401, headers });
    }

    const { data: profile, error: profErr } = await supabaseUser
      .from("profiles")
      .select("role, is_active")
      .eq("id", caller.id)
      .maybeSingle();

    if (profErr || !profile || profile.role !== "admin" || !profile.is_active) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers });
    }

    const body = (await req.json()) as InviteBody;
    const email = (body.email ?? "").trim().toLowerCase();
    const username = (body.username ?? "").trim().toLowerCase();
    const displayName = body.display_name?.trim() ? body.display_name.trim() : null;
    const role: "admin" | "user" = body.role === "admin" ? "admin" : "user";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers });
    }
    if (!/^[a-z0-9][a-z0-9_.-]{1,47}$/.test(username)) {
      return new Response(JSON.stringify({ error: "invalid_username" }), { status: 400, headers });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: emailRow } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (emailRow) {
      return new Response(JSON.stringify({ error: "email_already_registered" }), { status: 409, headers });
    }

    const { data: nameRow } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (nameRow) {
      return new Response(JSON.stringify({ error: "username_taken" }), { status: 409, headers });
    }

    const redirectTo = Deno.env.get("INVITE_REDIRECT_TO")?.trim() || undefined;

    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        username,
        display_name: displayName ?? "",
      },
      redirectTo,
    });

    if (invErr) {
      const msg = (invErr.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return new Response(
          JSON.stringify({ error: "email_already_in_auth", message: invErr.message }),
          { status: 409, headers }
        );
      }
      return new Response(
        JSON.stringify({ error: "invite_failed", message: invErr.message }),
        { status: 400, headers }
      );
    }

    const uid = invited.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "no_user_id" }), { status: 500, headers });
    }

    const { error: upErr } = await admin
      .from("profiles")
      .update({
        username,
        display_name: displayName,
        role,
        email,
      })
      .eq("id", uid);

    if (upErr) {
      return new Response(
        JSON.stringify({ error: "profile_update_failed", message: upErr.message }),
        { status: 500, headers }
      );
    }

    return new Response(JSON.stringify({ ok: true, user_id: uid }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "server_error", message: String(e) }), { status: 500, headers });
  }
});
