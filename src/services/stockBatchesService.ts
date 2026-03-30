import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type StockBatchRow = Database["public"]["Tables"]["stock_batches"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type BatchWithRelations = StockBatchRow & {
  deposito: {
    id: string;
    nombre: string;
    is_active: boolean;
    tipo: { id: string; nombre: string; slug: string };
  };
  guardado_por: Pick<ProfileRow, "id" | "username" | "display_name"> | null;
};

export async function fetchBatchesWithRelations(): Promise<BatchWithRelations[]> {
  const { data, error } = await supabase
    .from("stock_batches")
    .select(
      `
      *,
      deposito:storage_locations (
        id,
        nombre,
        is_active,
        tipo:storage_location_types (
          id,
          nombre,
          slug
        )
      ),
      guardado_por:profiles!stock_batches_guardado_por_usuario_id_fkey (
        id,
        username,
        display_name
      )
    `
    )
    .eq("is_active", true)
    .order("fecha_guardado", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as StockBatchRow & {
      deposito: BatchWithRelations["deposito"] | null;
      guardado_por: BatchWithRelations["guardado_por"];
    };
    if (!r.deposito?.tipo) throw new Error(`Lote ${r.id} sin depósito/tipo`);
    return {
      ...r,
      deposito: r.deposito as BatchWithRelations["deposito"],
      guardado_por: r.guardado_por,
    };
  });
}

/** Metadata opcional en `stock_batches.metadata` (ingreso por composición o modo). */
export type StockIntakeMetadata = {
  modo_ingreso: "kg_directo" | "selector_rapido" | "composicion";
  packs_de_3?: number;
  bolsas_individuales?: number;
  total_bolsas?: number;
  selector_kg?: number;
};

export type RegisterIntakeInput = {
  deposito_id: string;
  cantidad_meta_kilos: number;
  fecha_guardado: string;
  observaciones?: string | null;
  metadata?: StockIntakeMetadata | null;
};

export async function registerStockIntake(input: RegisterIntakeInput): Promise<string> {
  const { data, error } = await supabase.rpc("register_stock_intake", {
    p_deposito_id: input.deposito_id,
    p_cantidad_meta_kilos: input.cantidad_meta_kilos,
    p_fecha_guardado: input.fecha_guardado,
    p_observaciones: input.observaciones ?? null,
    p_metadata: input.metadata ?? null,
  });

  if (error) throw error;
  return data as string;
}
