import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type GlobalStockSummaryRow = {
  total_meta_kilos: number;
  total_reservado_kilos: number;
  total_libre_kilos: number;
};

export type PendingOrderGapRow = {
  order_id: string;
  pedido_kilos: number;
  reservado_kilos: number;
  falta_producir_kilos: number;
};

/** KPI global pedidos vs stock (vista v_pedidos_kpis) */
export type PedidosKpiRow = {
  total_pedidos_abiertos_kg: number;
  pedidos_abiertos_count: number;
  total_stock_disponible_kg: number;
  faltante_preparar_kg: number;
};

export function useGlobalStockSummary() {
  return useQuery({
    queryKey: ["v_global_stock_summary"],
    queryFn: async (): Promise<GlobalStockSummaryRow | null> => {
      const { data, error } = await supabase.from("v_global_stock_summary").select("*").maybeSingle();
      if (error) throw error;
      return data as GlobalStockSummaryRow | null;
    },
  });
}

export function usePedidosKpiQuery() {
  return useQuery({
    queryKey: ["v-pedidos-kpis"],
    queryFn: async (): Promise<PedidosKpiRow | null> => {
      const { data, error } = await supabase.from("v_pedidos_kpis").select("*").maybeSingle();
      if (error) throw error;
      return data as PedidosKpiRow | null;
    },
  });
}

/** Compatibilidad; preferir usePedidosKpiQuery para faltante global */
export function usePendingProductionGap() {
  return useQuery({
    queryKey: ["v_pending_orders_gap"],
    queryFn: async (): Promise<PendingOrderGapRow[]> => {
      const { data, error } = await supabase.from("v_pending_orders_gap").select("*");
      if (error) throw error;
      return (data as PendingOrderGapRow[] | null) ?? [];
    },
  });
}
