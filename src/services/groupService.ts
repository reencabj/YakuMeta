import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type StorageGroupRow = Database["public"]["Tables"]["storage_groups"]["Row"];
export type StorageGroupMemberRow = Database["public"]["Tables"]["storage_group_members"]["Row"];
export type StorageGroupMetricsRow = Database["public"]["Views"]["v_storage_group_metrics"]["Row"];

export type StorageGroupMemberWithLocation = StorageGroupMemberRow & {
  storage_location: {
    id: string;
    nombre: string;
    capacidad_meta_kilos: number;
    capacidad_guardado_kg: number;
    is_active: boolean;
    tipo: { id: string; nombre: string; slug: string };
  };
};

export async function fetchStorageGroupMetrics(): Promise<StorageGroupMetricsRow[]> {
  const { data, error } = await supabase
    .from("v_storage_group_metrics")
    .select("*")
    .order("nombre");

  if (error) throw error;
  return (data ?? []) as StorageGroupMetricsRow[];
}

export async function recommendStorageGroupsForMeta(
  cantidadMetaKilos: number
): Promise<StorageGroupMetricsRow[]> {
  const { data, error } = await supabase.rpc("recommend_storage_groups_for_meta", {
    p_cantidad_meta_kilos: cantidadMetaKilos,
  });

  if (error) throw error;
  return (data ?? []) as StorageGroupMetricsRow[];
}

export type UpsertStorageGroupInput = {
  nombre: string;
  descripcion?: string | null;
};

export async function createStorageGroup(
  input: UpsertStorageGroupInput,
  userId: string
): Promise<StorageGroupRow> {
  const { data, error } = await supabase
    .from("storage_groups")
    .insert({
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      activo: true,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateStorageGroup(
  id: string,
  input: UpsertStorageGroupInput,
  userId: string
): Promise<StorageGroupRow> {
  const { data, error } = await supabase
    .from("storage_groups")
    .update({
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      updated_by: userId,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setStorageGroupActive(id: string, activo: boolean, userId: string): Promise<void> {
  const { error } = await supabase
    .from("storage_groups")
    .update({ activo, updated_by: userId })
    .eq("id", id);

  if (error) throw error;
}

export async function fetchGroupMembersWithLocations(groupId: string): Promise<StorageGroupMemberWithLocation[]> {
  const { data, error } = await supabase
    .from("storage_group_members")
    .select(
      `
      *,
      storage_location:storage_locations (
        id,
        nombre,
        capacidad_meta_kilos,
        capacidad_guardado_kg,
        is_active,
        tipo:storage_location_types (
          id,
          nombre,
          slug
        )
      )
    `
    )
    .eq("group_id", groupId);

  if (error) throw error;

  const mapped = (data ?? []).map((row) => {
    const r = row as unknown as StorageGroupMemberRow & {
      storage_location: StorageGroupMemberWithLocation["storage_location"] | null;
    };
    if (!r.storage_location?.tipo) throw new Error(`Miembro ${r.id} sin depósito/tipo`);
    return {
      ...r,
      storage_location: r.storage_location as StorageGroupMemberWithLocation["storage_location"],
    };
  });

  mapped.sort((a, b) => {
    const ao = a.orden ?? 999999;
    const bo = b.orden ?? 999999;
    if (ao !== bo) return ao - bo;
    return a.storage_location.nombre.localeCompare(b.storage_location.nombre, "es");
  });

  return mapped;
}

/** Depósitos activos que no están en ningún grupo (para asignar). */
export async function fetchUnassignedActiveDepositIds(): Promise<{ id: string; nombre: string }[]> {
  const [{ data: members, error: e1 }, { data: locs, error: e2 }] = await Promise.all([
    supabase.from("storage_group_members").select("storage_location_id"),
    supabase
      .from("storage_locations")
      .select("id, nombre")
      .eq("is_active", true)
      .order("nombre"),
  ]);

  if (e1) throw e1;
  if (e2) throw e2;

  const used = new Set((members ?? []).map((m) => m.storage_location_id));
  return (locs ?? []).filter((l) => !used.has(l.id));
}

export async function addGroupMember(
  groupId: string,
  storageLocationId: string,
  orden: number | null
): Promise<StorageGroupMemberRow> {
  const { data, error } = await supabase
    .from("storage_group_members")
    .insert({
      group_id: groupId,
      storage_location_id: storageLocationId,
      orden,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeGroupMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("storage_group_members").delete().eq("id", memberId);

  if (error) throw error;
}

export async function updateMemberOrden(memberId: string, orden: number | null): Promise<void> {
  const { error } = await supabase.from("storage_group_members").update({ orden }).eq("id", memberId);

  if (error) throw error;
}
