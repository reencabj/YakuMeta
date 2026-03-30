import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env — la app arrancará en modo demo."
  );
}

/** Tipado genérico completo vía `supabase gen types` cuando el esquema esté estable. */
export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

/**
 * Origen público de la app (sin barra final). En producción conviene fijar `VITE_PUBLIC_APP_URL`
 * para que los enlaces de correo apunten al dominio real aunque se dispare el envío desde otro entorno.
 */
export function getPublicAppBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, "");
  }
  return "";
}

/** URL permitida en Supabase Auth → Redirect URLs (recuperación e invitación). */
export function authRecoveryRedirectUrl(): string {
  return `${getPublicAppBaseUrl()}/auth/recovery`;
}

/** Tras confirmar sesión por enlace (callback genérico). */
export function authCallbackRedirectUrl(): string {
  return `${getPublicAppBaseUrl()}/auth/callback`;
}
