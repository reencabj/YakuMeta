import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBatchesWithRelations, registerStockIntake, type RegisterIntakeInput } from "@/services/stockBatchesService";

export function useStockBatchesQuery() {
  return useQuery({
    queryKey: ["stock-batches"],
    queryFn: fetchBatchesWithRelations,
  });
}

export function useRegisterStockIntakeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterIntakeInput) => registerStockIntake(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock-batches"] });
      void qc.invalidateQueries({ queryKey: ["stock-batch-metrics"] });
      void qc.invalidateQueries({ queryKey: ["storage-locations"] });
      void qc.invalidateQueries({ queryKey: ["storage-groups"] });
      void qc.invalidateQueries({ queryKey: ["v_global_stock_summary"] });
      void qc.invalidateQueries({ queryKey: ["v_pending_orders_gap"] });
      void qc.invalidateQueries({ queryKey: ["v-pedidos-kpis"] });
      void qc.invalidateQueries({ queryKey: ["v-open-orders-cobertura"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
