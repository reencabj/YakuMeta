import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import {
  cancelOrder,
  createOrder,
  deliverOrder,
  fetchLatestDeliveriesByOrderIds,
  fetchOpenOrdersCobertura,
  fetchOrderDetail,
  fetchOrdersWithCreator,
  markOrderCobradoPreEntrega,
  setOrderKilosEntregadosAcumulado,
  updateOrderPatch,
  type DeliverPayload,
} from "@/services/orderService";
import { supabase } from "@/lib/supabase";
import { ACTIVE_ORDER_STATES } from "@/features/orders/orderUtils";

const ORDERS_KEY = ["orders"] as const;
const ORDER_DETAIL = (id: string) => ["order", id] as const;

function invalidatePedidosRelated(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["v-pedidos-kpis"] });
  void qc.invalidateQueries({ queryKey: ["v-open-orders-cobertura"] });
  void qc.invalidateQueries({ queryKey: ["v_pending_orders_gap"] });
}

function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["stock-batches"] });
  void qc.invalidateQueries({ queryKey: ["stock-batch-metrics"] });
  void qc.invalidateQueries({ queryKey: ["storage-locations"] });
  void qc.invalidateQueries({ queryKey: ["v_global_stock_summary"] });
  void qc.invalidateQueries({ queryKey: ["storage-groups"] });
  invalidatePedidosRelated(qc);
}

export function useOrdersQuery() {
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: fetchOrdersWithCreator,
  });
}

export function useOpenOrdersCoberturaQuery() {
  return useQuery({
    queryKey: ["v-open-orders-cobertura"],
    queryFn: fetchOpenOrdersCobertura,
  });
}

export function useDeliveriesTodayCount() {
  return useQuery({
    queryKey: ["order-deliveries-today"],
    queryFn: async () => {
      const d = startOfDay(new Date());
      const { count, error } = await supabase
        .from("order_deliveries")
        .select("*", { count: "exact", head: true })
        .gte("entregado_at", d.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useLatestDeliveriesByOrderIds(orderIds: string[]) {
  return useQuery({
    queryKey: ["latest-order-deliveries", ...orderIds],
    queryFn: () => fetchLatestDeliveriesByOrderIds(orderIds),
    enabled: orderIds.length > 0,
  });
}

export function useOrderDetailQuery(orderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: orderId ? ORDER_DETAIL(orderId) : ["order", "none"],
    queryFn: () => fetchOrderDetail(orderId!),
    enabled: Boolean(orderId) && enabled,
  });
}

export function useCreateOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      invalidatePedidosRelated(qc);
    },
  });
}

export function useUpdateOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateOrderPatch>[1] }) => updateOrderPatch(id, patch),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      void qc.invalidateQueries({ queryKey: ORDER_DETAIL(v.id) });
      invalidatePedidosRelated(qc);
    },
  });
}

export function useMarkOrderCobradoPreEntregaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      recibio_dinero_usuario_id,
      amount_received,
    }: {
      orderId: string;
      recibio_dinero_usuario_id: string;
      amount_received: number;
    }) => markOrderCobradoPreEntrega(orderId, { recibio_dinero_usuario_id, amount_received }),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      void qc.invalidateQueries({ queryKey: ORDER_DETAIL(v.orderId) });
    },
  });
}

/** Entregas parciales (kg): no toca total_sugerido ni precio. */
export function useSetOrderKilosEntregadosAcumuladoMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, kilos }: { orderId: string; kilos: number }) =>
      setOrderKilosEntregadosAcumulado(orderId, kilos),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      void qc.invalidateQueries({ queryKey: ORDER_DETAIL(v.orderId) });
    },
  });
}

export function useDeliverOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: DeliverPayload }) => deliverOrder(orderId, payload),
    onSuccess: (_, v) => {
      invalidateStock(qc);
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      void qc.invalidateQueries({ queryKey: ORDER_DETAIL(v.orderId) });
      void qc.invalidateQueries({ queryKey: ["order-deliveries-today"] });
    },
  });
}

export function useCancelOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string | null }) => cancelOrder(orderId, reason),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      void qc.invalidateQueries({ queryKey: ORDER_DETAIL(v.orderId) });
      invalidatePedidosRelated(qc);
    },
  });
}

export { ACTIVE_ORDER_STATES };
