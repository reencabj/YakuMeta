import type { Locale } from "date-fns";
import { format, isValid, parseISO } from "date-fns";

const FALLBACK = "—";

/** Parsea ISO/date string de Supabase; devuelve null si es inválida o vacía. */
export function parseIsoSafe(iso: string | null | undefined): Date | null {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

/** Igual que format(parseISO(x)), pero sin tirar si el valor viene mal. */
export function formatIsoSafe(
  iso: string | null | undefined,
  pattern: string,
  options?: { locale?: Locale }
): string {
  const d = parseIsoSafe(iso);
  if (!d) return FALLBACK;
  return format(d, pattern, options?.locale ? { locale: options.locale } : undefined);
}
