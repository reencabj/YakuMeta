import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDeposit,
  deactivateDeposit,
  fetchBatchMetricsByDeposit,
  fetchDepositsWithTypes,
  updateDeposit,
  type DepositWithType,
  type DepositMetrics,
  type UpsertDepositInput,
} from "@/services/depositsService";

export type DepositRowModel = DepositWithType & {
  total_meta_kg: number;
  reservado_meta_kg: number;
  libre_meta_kg: number;
  oldest_batch_date: string | null;
  nearest_expiry: string | null;
  ocupacion_pct: number | null;
};

function emptyMetrics(depositoId: string): DepositMetrics {
  return {
    deposito_id: depositoId,
    total_meta_kg: 0,
    reservado_meta_kg: 0,
    libre_meta_kg: 0,
    oldest_batch_date: null,
    nearest_expiry: null,
  };
}

export function useDepositsData() {
  const depositsQ = useQuery({
    queryKey: ["storage-locations"],
    queryFn: fetchDepositsWithTypes,
  });

  const metricsQ = useQuery({
    queryKey: ["stock-batch-metrics"],
    queryFn: fetchBatchMetricsByDeposit,
  });

  const merged = useMemo((): DepositRowModel[] | undefined => {
    if (!depositsQ.data) return undefined;
    const metricsMap = new Map((metricsQ.data ?? []).map((m) => [m.deposito_id, m]));

    return depositsQ.data.map((d) => {
      const m = metricsMap.get(d.id) ?? emptyMetrics(d.id);
      const cap = Number(d.capacidad_meta_kilos);
      const ocupacion_pct =
        cap > 0 ? Math.min(100, (m.total_meta_kg / cap) * 100) : m.total_meta_kg > 0 ? 100 : null;

      return {
        ...d,
        total_meta_kg: m.total_meta_kg,
        reservado_meta_kg: m.reservado_meta_kg,
        libre_meta_kg: m.libre_meta_kg,
        oldest_batch_date: m.oldest_batch_date,
        nearest_expiry: m.nearest_expiry,
        ocupacion_pct,
      };
    });
  }, [depositsQ.data, metricsQ.data]);

  return {
    depositsQuery: depositsQ,
    metricsQuery: metricsQ,
    rows: merged,
    isLoading: depositsQ.isLoading || metricsQ.isLoading,
    error: depositsQ.error ?? metricsQ.error,
  };
}

export function useDepositMutations(userId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["storage-locations"] });
    void qc.invalidateQueries({ queryKey: ["stock-batch-metrics"] });
    void qc.invalidateQueries({ queryKey: ["storage-groups"] });
    void qc.invalidateQueries({ queryKey: ["v_global_stock_summary"] });
    void qc.invalidateQueries({ queryKey: ["v_pending_orders_gap"] });
    void qc.invalidateQueries({ queryKey: ["v-pedidos-kpis"] });
    void qc.invalidateQueries({ queryKey: ["v-open-orders-cobertura"] });
    void qc.invalidateQueries({ queryKey: ["stock-batches"] });
    void qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const create = useMutation({
    mutationFn: (input: UpsertDepositInput) => {
      if (!userId) throw new Error("Sin usuario");
      return createDeposit(input, userId);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertDepositInput }) => {
      if (!userId) throw new Error("Sin usuario");
      return updateDeposit(id, input, userId);
    },
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => {
      if (!userId) throw new Error("Sin usuario");
      return deactivateDeposit(id, userId);
    },
    onSuccess: invalidate,
  });

  return { create, update, deactivate };
}
