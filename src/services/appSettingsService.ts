import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type AppSettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];

export async function fetchAppSettings(): Promise<AppSettingsRow> {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("app_settings no encontrado");
  return data;
}

export async function updateAppSettings(patch: Database["public"]["Tables"]["app_settings"]["Update"]): Promise<AppSettingsRow> {
  const { data, error } = await supabase.from("app_settings").update(patch).eq("id", 1).select("*").single();
  if (error) throw error;
  return data;
}
