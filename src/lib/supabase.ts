import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env — la app arrancará en modo demo."
  );
}

/** Tipado genérico completo vía `supabase gen types` cuando el esquema esté estable. */
export const supabase = createClient(url ?? "", anon ?? "");

/** Dominio interno para cumplir con email en Supabase Auth */
export const INTERNAL_EMAIL_DOMAIN = "internal.rp.local";

export function usernameToEmail(username: string) {
  const u = username.trim().toLowerCase();
  return `${u}@${INTERNAL_EMAIL_DOMAIN}`;
}
