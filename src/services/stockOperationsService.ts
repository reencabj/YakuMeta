import { supabase } from "@/lib/supabase";

export async function transferStockBatch(input: {
  source_batch_id: string;
  dest_deposito_id: string;
  cantidad_meta_kilos: number;
  notas?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("transfer_stock_batch", {
    p_source_batch_id: input.source_batch_id,
    p_dest_deposito_id: input.dest_deposito_id,
    p_cantidad_meta_kilos: input.cantidad_meta_kilos,
    p_notas: input.notas ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function adjustStockBatchQuantity(input: {
  batch_id: string;
  nueva_cantidad_meta_kilos: number;
  motivo?: string | null;
  notas?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("adjust_stock_batch_quantity", {
    p_batch_id: input.batch_id,
    p_nueva_cantidad_meta_kilos: input.nueva_cantidad_meta_kilos,
    p_motivo: input.motivo ?? null,
    p_notas: input.notas ?? null,
  });
  if (error) throw error;
}

export async function emptyStorageLocationStock(input: { deposito_id: string; motivo: string }): Promise<number> {
  const { data, error } = await supabase.rpc("empty_storage_location_stock", {
    p_deposito_id: input.deposito_id,
    p_motivo: input.motivo,
  });
  if (error) throw error;
  return data as number;
}

export async function extractStockFromDeposit(input: {
  deposito_id: string;
  cantidad_meta_kilos: number;
  motivo: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("extract_stock_from_deposit", {
    p_deposito_id: input.deposito_id,
    p_cantidad_meta_kilos: input.cantidad_meta_kilos,
    p_motivo: input.motivo,
  });
  if (error) throw error;
  return data as number;
}

export async function updateBatchComposition(input: {
  batch_id: string;
  packs_de_3: number;
  bolsas_individuales: number;
  motivo?: string | null;
  notas?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("update_batch_composition", {
    p_batch_id: input.batch_id,
    p_packs_de_3: input.packs_de_3,
    p_bolsas_individuales: input.bolsas_individuales,
    p_motivo: input.motivo ?? null,
    p_notas: input.notas ?? null,
  });
  if (error) throw error;
}
