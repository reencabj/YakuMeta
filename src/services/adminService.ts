import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type PricingRuleRow = Database["public"]["Tables"]["pricing_rules"]["Row"];
export type LocationTypeRow = Database["public"]["Tables"]["storage_location_types"]["Row"];

export async function fetchProfilesForAdmin(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("username");
  if (error) throw error;
  return data ?? [];
}

export async function updateProfileAdmin(
  id: string,
  patch: Pick<Database["public"]["Tables"]["profiles"]["Update"], "role" | "is_active" | "display_name">
) {
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as ProfileRow;
}

export async function fetchPricingRules(): Promise<PricingRuleRow[]> {
  const { data, error } = await supabase.from("pricing_rules").select("*").order("prioridad", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function insertPricingRule(row: Database["public"]["Tables"]["pricing_rules"]["Insert"]) {
  const { data, error } = await supabase.from("pricing_rules").insert(row).select("*").single();
  if (error) throw error;
  return data as PricingRuleRow;
}

export async function updatePricingRule(id: string, patch: Database["public"]["Tables"]["pricing_rules"]["Update"]) {
  const { data, error } = await supabase.from("pricing_rules").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as PricingRuleRow;
}

export async function deletePricingRule(id: string) {
  const { error } = await supabase.from("pricing_rules").delete().eq("id", id);
  if (error) throw error;
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

export async function insertCustomLocationType(nombre: string) {
  const slug = slugify(nombre) || `tipo_${Date.now()}`;
  const row: Database["public"]["Tables"]["storage_location_types"]["Insert"] = {
    nombre: nombre.trim(),
    slug,
    es_sistema: false,
    is_active: true,
  };
  const { data, error } = await supabase.from("storage_location_types").insert(row).select("*").single();
  if (error) throw error;
  return data as LocationTypeRow;
}

export async function updateCustomLocationType(
  id: string,
  patch: Partial<Pick<Database["public"]["Tables"]["storage_location_types"]["Update"], "nombre" | "is_active">>
) {
  const { data, error } = await supabase
    .from("storage_location_types")
    .update(patch)
    .eq("id", id)
    .eq("es_sistema", false)
    .select("*")
    .single();
  if (error) throw error;
  return data as LocationTypeRow;
}

export async function adminSystemSnapshot(): Promise<Json> {
  const { data, error } = await supabase.rpc("admin_system_snapshot");
  if (error) throw error;
  return data;
}
