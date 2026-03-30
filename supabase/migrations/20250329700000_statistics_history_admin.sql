-- =============================================================================
-- Estadísticas / Historial unificado / Admin — RLS perfiles, índices, vistas, RPC
-- =============================================================================

-- 1) Perfiles: admin puede listar todos (incl. inactivos); resto solo activos + propio
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR is_active = true
    OR id = auth.uid()
  );

-- 2) Índices para consultas por rango (estadísticas e historial)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_deliveries_entregado_at ON public.order_deliveries (entregado_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- Movimientos filtrados por depósito / usuario / tipo (estadísticas)
CREATE INDEX IF NOT EXISTS idx_stock_movements_deposito_created
  ON public.stock_movements (deposito_id, created_at DESC)
  WHERE deposito_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_usuario_created
  ON public.stock_movements (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tipo_created
  ON public.stock_movements (tipo_movimiento, created_at DESC);

-- Pedidos por creador + fecha
CREATE INDEX IF NOT EXISTS idx_orders_creador_created
  ON public.orders (creado_por_usuario_id, created_at DESC);

-- Lotes: riesgo por vencimiento y antigüedad
CREATE INDEX IF NOT EXISTS idx_stock_batches_vencimiento
  ON public.stock_batches (fecha_vencimiento_estimada)
  WHERE is_active = true AND cantidad_meta_kilos > 0;

-- 3) Vista unificada auditoría + movimientos de stock (UI Historial)
CREATE OR REPLACE VIEW public.v_history_events AS
SELECT
  ('audit:' || al.id::text)::text AS event_id,
  'audit'::text AS source,
  al.created_at,
  al.entity_type::text AS entity_type,
  al.entity_id,
  al.accion::text AS event_kind,
  al.usuario_id,
  al.old_values,
  al.new_values,
  al.metadata,
  al.motivo,
  (
    coalesce(al.entity_type, '') || ' ' ||
    coalesce(al.accion, '') || ' ' ||
    coalesce(al.motivo, '') || ' ' ||
    coalesce(al.old_values::text, '') || ' ' ||
    coalesce(al.new_values::text, '') || ' ' ||
    coalesce(al.metadata::text, '')
  )::text AS search_text
FROM public.audit_logs al
UNION ALL
SELECT
  ('mov:' || sm.id::text)::text AS event_id,
  'movement'::text AS source,
  sm.created_at,
  'stock_movement'::text AS entity_type,
  coalesce(sm.lote_id, sm.deposito_id, sm.pedido_id) AS entity_id,
  sm.tipo_movimiento::text AS event_kind,
  sm.usuario_id,
  null::jsonb AS old_values,
  null::jsonb AS new_values,
  sm.metadata,
  sm.notas AS motivo,
  (
    coalesce(sm.tipo_movimiento, '') || ' ' ||
    coalesce(sm.notas, '') || ' ' ||
    coalesce(sm.metadata::text, '')
  )::text AS search_text
FROM public.stock_movements sm;

COMMENT ON VIEW public.v_history_events IS
  'Eventos de auditoría y movimientos de stock para historial unificado (PostgREST).';

GRANT SELECT ON public.v_history_events TO authenticated;

-- 4) Snapshot de mantenimiento (solo admin; sin operaciones destructivas)
CREATE OR REPLACE FUNCTION public.admin_system_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', to_jsonb(now() AT TIME ZONE 'utc'),
    'counts', jsonb_build_object(
      'profiles', (SELECT count(*)::bigint FROM public.profiles),
      'profiles_activos', (SELECT count(*)::bigint FROM public.profiles WHERE is_active),
      'storage_locations', (SELECT count(*)::bigint FROM public.storage_locations),
      'stock_batches_activos', (SELECT count(*)::bigint FROM public.stock_batches WHERE is_active),
      'stock_movements', (SELECT count(*)::bigint FROM public.stock_movements),
      'orders_activos', (SELECT count(*)::bigint FROM public.orders WHERE is_active),
      'order_deliveries', (SELECT count(*)::bigint FROM public.order_deliveries),
      'audit_logs', (SELECT count(*)::bigint FROM public.audit_logs),
      'pricing_rules', (SELECT count(*)::bigint FROM public.pricing_rules),
      'storage_groups', (SELECT count(*)::bigint FROM public.storage_groups)
    ),
    'orphans', jsonb_build_object(
      'delivery_items_sin_delivery', (
        SELECT count(*)::bigint
        FROM public.order_delivery_items odi
        WHERE NOT EXISTS (SELECT 1 FROM public.order_deliveries od WHERE od.id = odi.delivery_id)
      ),
      'delivery_items_batch_invalido', (
        SELECT count(*)::bigint
        FROM public.order_delivery_items odi
        WHERE odi.stock_batch_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.stock_batches sb WHERE sb.id = odi.stock_batch_id)
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_system_snapshot IS
  'Conteos y chequeos livianos para panel Admin; solo rol admin.';

GRANT EXECUTE ON FUNCTION public.admin_system_snapshot() TO authenticated;
