import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type LocationTypeRow = Database["public"]["Tables"]["storage_location_types"]["Row"];

export async function fetchLocationTypes(includeInactive = false): Promise<LocationTypeRow[]> {
  let q = supabase.from("storage_location_types").select("*").order("nombre");
  if (!includeInactive) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
