import { differenceInCalendarDays, parseISO } from "date-fns";
import type { AppSettingsRow } from "@/services/appSettingsService";

export type AgeBand = "normal" | "alerta" | "vencido";

/**
 * Días desde fecha_guardado (inicio del día) hasta hoy.
 */
export function daysSinceStored(fechaGuardado: string, now = new Date()): number {
  const d = parseISO(fechaGuardado.length > 10 ? fechaGuardado : `${fechaGuardado}T12:00:00`);
  return Math.max(0, differenceInCalendarDays(now, d));
}

/**
 * Banda visual según umbrales de app_settings (días transcurridos desde guardado).
 */
export function ageBandFromDays(days: number, settings: AppSettingsRow): AgeBand {
  if (days >= settings.alerta_meta_dias_vencido_desde) return "vencido";
  if (days > settings.alerta_meta_dias_normal_hasta) return "alerta";
  return "normal";
}

export function ageBandForBatch(fechaGuardado: string, settings: AppSettingsRow): AgeBand {
  return ageBandFromDays(daysSinceStored(fechaGuardado), settings);
}
