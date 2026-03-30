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
  const { data, error } = await supabase
    .from("stock_batches")
    .select("deposito_id, cantidad_meta_kilos, cantidad_reservada_meta_kilos, cantidad_disponible_meta_kilos, fecha_guardado, fecha_vencimiento_estimada, is_active")
    .eq("is_active", true);

  if (error) throw error;

  const map = new Map<
    string,
    {
      total: number;
      reservado: number;
      libre: number;
      minDate: string | null;
      minExpiry: string | null;
    }
  >();

  for (const b of data ?? []) {
    const id = b.deposito_id;
    const cur = map.get(id) ?? {
      total: 0,
      reservado: 0,
      libre: 0,
      minDate: null as string | null,
      minExpiry: null as string | null,
    };
    cur.total += Number(b.cantidad_meta_kilos);
    cur.reservado += Number(b.cantidad_reservada_meta_kilos);
    cur.libre += Number(b.cantidad_disponible_meta_kilos);
    const fg = b.fecha_guardado;
    if (fg && (!cur.minDate || fg < cur.minDate)) cur.minDate = fg;
    const fe = b.fecha_vencimiento_estimada;
    if (fe && (!cur.minExpiry || fe < cur.minExpiry)) cur.minExpiry = fe;
    map.set(id, cur);
  }

  return [...map.entries()].map(([deposito_id, m]) => ({
    deposito_id,
    total_meta_kg: m.total,
    reservado_meta_kg: m.reservado,
    libre_meta_kg: m.libre,
    oldest_batch_date: m.minDate,
    nearest_expiry: m.minExpiry,
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
