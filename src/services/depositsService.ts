import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type StorageLocationRow = Database["public"]["Tables"]["storage_locations"]["Row"];
export type LocationTypeRow = Database["public"]["Tables"]["storage_location_types"]["Row"];

export type DepositWithType = StorageLocationRow & {
  tipo: Pick<LocationTypeRow, "id" | "nombre" | "slug">;
};

export type DepositMetrics = {
  deposito_id: string;
  total_meta_kg: number;
  reservado_meta_kg: number;
  libre_meta_kg: number;
  oldest_batch_date: string | null;
  nearest_expiry: string | null;
};

export async function fetchDepositsWithTypes(): Promise<DepositWithType[]> {
  const { data, error } = await supabase
    .from("storage_locations")
    .select(
      `
      *,
      tipo:storage_location_types (
        id,
        nombre,
        slug
      )
    `
    )
    .order("nombre");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as StorageLocationRow & {
      tipo: Pick<LocationTypeRow, "id" | "nombre" | "slug"> | null;
    };
    if (!r.tipo) {
      throw new Error(`Depósito ${r.id} sin tipo`);
    }
    return { ...r, tipo: r.tipo };
  });
}

export async function fetchBatchMetricsByDeposit(): Promise<DepositMetrics[]> {
  const { data, error } = await supabase.from("v_deposit_stock_metrics").select("*");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    deposito_id: row.deposito_id,
    total_meta_kg: Number(row.total_meta_kg),
    reservado_meta_kg: Number(row.reservado_meta_kg),
    libre_meta_kg: Number(row.libre_meta_kg),
    oldest_batch_date: row.oldest_batch_date,
    nearest_expiry: row.nearest_expiry,
  }));
}

export type UpsertDepositInput = {
  nombre: string;
  tipo_id: string;
  dueno?: string | null;
  descripcion?: string | null;
  capacidad_guardado_kg: number;
};

export async function createDeposit(input: UpsertDepositInput, userId: string): Promise<StorageLocationRow> {
  const { data, error } = await supabase
    .from("storage_locations")
    .insert({
      nombre: input.nombre.trim(),
      tipo_id: input.tipo_id,
      dueno: input.dueno?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
      capacidad_guardado_kg: input.capacidad_guardado_kg,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDeposit(
  id: string,
  input: UpsertDepositInput,
  userId: string
): Promise<StorageLocationRow> {
  const { data, error } = await supabase
    .from("storage_locations")
    .update({
      nombre: input.nombre.trim(),
      tipo_id: input.tipo_id,
      dueno: input.dueno?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
      capacidad_guardado_kg: input.capacidad_guardado_kg,
      updated_by: userId,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deactivateDeposit(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("storage_locations")
    .update({ is_active: false, updated_by: userId })
    .eq("id", id);

  if (error) throw error;
}
