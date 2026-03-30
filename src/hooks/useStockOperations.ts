import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adjustStockBatchQuantity,
  emptyStorageLocationStock,
  extractStockFromDeposit,
  transferStockBatch,
  updateBatchComposition,
} from "@/services/stockOperationsService";

function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["stock-batches"] });
  void qc.invalidateQueries({ queryKey: ["stock-batch-metrics"] });
  void qc.invalidateQueries({ queryKey: ["storage-locations"] });
  void qc.invalidateQueries({ queryKey: ["storage-groups"] });
  void qc.invalidateQueries({ queryKey: ["v_global_stock_summary"] });
  void qc.invalidateQueries({ queryKey: ["v_pending_orders_gap"] });
  void qc.invalidateQueries({ queryKey: ["v-pedidos-kpis"] });
  void qc.invalidateQueries({ queryKey: ["v-open-orders-cobertura"] });
  void qc.invalidateQueries({ queryKey: ["orders"] });
}

export function useStockOperationsMutations() {
  const qc = useQueryClient();

  const transfer = useMutation({
    mutationFn: transferStockBatch,
    onSuccess: () => invalidateStock(qc),
  });

  const adjust = useMutation({
    mutationFn: adjustStockBatchQuantity,
    onSuccess: () => invalidateStock(qc),
  });

  const emptyDeposit = useMutation({
    mutationFn: emptyStorageLocationStock,
    onSuccess: () => invalidateStock(qc),
  });

  const extractFromDeposit = useMutation({
    mutationFn: extractStockFromDeposit,
    onSuccess: () => invalidateStock(qc),
  });

  const updateComposition = useMutation({
    mutationFn: updateBatchComposition,
    onSuccess: () => invalidateStock(qc),
  });

  return { transfer, adjust, emptyDeposit, extractFromDeposit, updateComposition };
}
