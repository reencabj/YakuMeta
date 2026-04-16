-- =============================================================================
-- Pedidos simplificados: sin reservas manuales ni estados reservado_*
-- KPI global: faltante_preparar = max(0, sum(pedidos abiertos) - stock libre)
-- =============================================================================

-- 1) Migrar estados legacy
UPDATE public.orders
SET estado = 'en_preparacion', updated_at = now()
WHERE estado IN ('reservado_parcial', 'reservado_completo');

-- 2) Constraint de estado
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_estado_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_estado_check CHECK (
    estado IN ('pendiente', 'en_preparacion', 'entregado', 'cancelado')
  );

-- 3) Liberar lotes ligados a reservas de pedido (legacy) y vaciar tabla
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public.order_reservations
  LOOP
    UPDATE public.stock_batches sb
    SET
      cantidad_reservada_meta_kilos = greatest(0, sb.cantidad_reservada_meta_kilos - r.cantidad_meta_kilos),
      updated_at = now()
    WHERE sb.id = r.stock_batch_id;
    PERFORM public.apply_batch_estado(r.stock_batch_id);
  END LOOP;
  DELETE FROM public.order_reservations;
END;
$$;

-- 4) KPIs globales pedidos + stock
-- REPLACE no puede quitar columnas si la vista ya existe con más (p. ej. tiradas_faltantes en migraciones posteriores o SQL manual).
DROP VIEW IF EXISTS public.v_pedidos_kpis CASCADE;
CREATE VIEW public.v_pedidos_kpis AS
SELECT
  (
    SELECT coalesce(sum(o.cantidad_meta_kilos), 0)::numeric(18, 4)
    FROM public.orders o
    WHERE o.is_active = true
      AND o.estado IN ('pendiente', 'en_preparacion')
  ) AS total_pedidos_abiertos_kg,
  (
    SELECT count(*)::bigint
    FROM public.orders o
    WHERE o.is_active = true
      AND o.estado IN ('pendiente', 'en_preparacion')
  ) AS pedidos_abiertos_count,
  (
    SELECT v.total_libre_kilos::numeric(18, 4)
    FROM public.v_global_stock_summary v
    LIMIT 1
  ) AS total_stock_disponible_kg,
  greatest(
    0::numeric,
    (
      SELECT coalesce(sum(o.cantidad_meta_kilos), 0)::numeric(18, 4)
      FROM public.orders o
      WHERE o.is_active = true
        AND o.estado IN ('pendiente', 'en_preparacion')
    )
    - (
      SELECT v.total_libre_kilos::numeric(18, 4)
      FROM public.v_global_stock_summary v
      LIMIT 1
    )
  )::numeric(18, 4) AS faltante_preparar_kg;

COMMENT ON VIEW public.v_pedidos_kpis IS
  'Pedidos abiertos vs stock libre global; faltante_preparar = max(0, suma_kg_abiertos - libre)';

GRANT SELECT ON public.v_pedidos_kpis TO authenticated;

-- 5) Cobertura FIFO por pedido abierto (para UI: “alcanza” según orden de cola)
CREATE OR REPLACE VIEW public.v_open_orders_cobertura AS
SELECT
  x.id AS order_id,
  x.cum_kg,
  (
    x.cum_kg
    <= (SELECT v.total_libre_kilos FROM public.v_global_stock_summary v LIMIT 1)
  ) AS alcanza_fifo
FROM (
  SELECT
    o.id,
    sum(o.cantidad_meta_kilos) OVER (
      ORDER BY o.fecha_pedido ASC, o.created_at ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cum_kg
  FROM public.orders o
  WHERE o.is_active = true
    AND o.estado IN ('pendiente', 'en_preparacion')
) AS x;

COMMENT ON VIEW public.v_open_orders_cobertura IS
  'Suma acumulada de kg de pedidos abiertos (FIFO por fecha) vs stock libre; alcanza_fifo si el acumulado cabe en libre';

GRANT SELECT ON public.v_open_orders_cobertura TO authenticated;

-- 6) Vista legacy: ya no usa reservas (solo pedidos abiertos)
-- Hay que DROP + CREATE: la vista vieja mezclaba tipos (pedido_kilos = numeric de la tabla, resto 18,4);
-- CREATE OR REPLACE no puede cambiar numeric(14,4) ↔ numeric(18,4) en columnas (ERROR 42P16).
DROP VIEW IF EXISTS public.v_pending_orders_gap CASCADE;
CREATE VIEW public.v_pending_orders_gap AS
SELECT
  o.id AS order_id,
  o.cantidad_meta_kilos::numeric(18, 4) AS pedido_kilos,
  0::numeric(18, 4) AS reservado_kilos,
  o.cantidad_meta_kilos::numeric(18, 4) AS falta_producir_kilos
FROM public.orders o
WHERE o.is_active = true
  AND o.estado IN ('pendiente', 'en_preparacion');

COMMENT ON VIEW public.v_pending_orders_gap IS
  'Compatibilidad: sin reservas; falta_producir_kilos = kg del pedido (usar v_pedidos_kpis para faltante global)';

GRANT SELECT ON public.v_pending_orders_gap TO authenticated;

-- 7) recalculate_order_estado → no-op (reservas eliminadas)
CREATE OR REPLACE FUNCTION public.recalculate_order_estado(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

-- 8) RPCs de reserva deprecadas (no usar)
CREATE OR REPLACE FUNCTION public.reserve_from_batches(p_order_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'reserve_from_batches_deprecated';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reservations_for_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'release_reservations_for_order_deprecated';
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_reservations_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'suggest_reservations_for_order_deprecated';
END;
$$;

-- 9) Entrega: egreso de stock sin consumir order_reservations
CREATE OR REPLACE FUNCTION public.deliver_order(p_order_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  o record;
  v_delivery_id uuid := gen_random_uuid();
  v_entrega_ts timestamptz;
  v_nombre text;
  v_monto numeric;
  v_notas text;
  v_items jsonb;
  elem jsonb;
  b record;
  v_qty numeric;
  v_src text;
  v_bid uuid;
  v_did uuid;
  v_prod_sum numeric := 0;
  v_total_items numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF o.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'order_not_editable';
  END IF;

  v_nombre := coalesce(nullif(trim(p_payload->>'recibio_dinero_nombre'), ''), '');
  v_monto := (p_payload->>'amount_received')::numeric;
  v_entrega_ts := coalesce((p_payload->>'delivered_at')::timestamptz, now());
  v_notas := nullif(trim(p_payload->>'notes'), '');
  v_items := p_payload->'items';

  IF v_nombre = '' THEN
    RAISE EXCEPTION 'recibio_dinero_nombre_required';
  END IF;
  IF v_monto IS NULL OR v_monto < 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'items_required';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_qty := (elem->>'quantity_meta_kilos')::numeric;
    v_src := elem->>'source_type';
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_line_quantity';
    END IF;
    IF v_src NOT IN ('stock', 'produccion_directa') THEN
      RAISE EXCEPTION 'invalid_source_type';
    END IF;
    v_total_items := v_total_items + v_qty;
    IF v_src = 'produccion_directa' THEN
      v_prod_sum := v_prod_sum + v_qty;
    END IF;
  END LOOP;

  IF abs(v_total_items - o.cantidad_meta_kilos) > 0.001 THEN
    RAISE EXCEPTION 'delivery_qty_mismatch';
  END IF;

  INSERT INTO public.order_deliveries (
    id,
    order_id,
    entregado_at,
    dinero_recibido,
    recibio_dinero_usuario_id,
    recibio_dinero_nombre,
    produccion_directa_meta_kilos,
    notas,
    created_by
  )
  VALUES (
    v_delivery_id,
    p_order_id,
    v_entrega_ts,
    v_monto,
    v_uid,
    v_nombre,
    v_prod_sum,
    v_notas,
    v_uid
  );

  FOR elem IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_qty := (elem->>'quantity_meta_kilos')::numeric;
    v_src := elem->>'source_type';
    IF v_src = 'produccion_directa' THEN
      INSERT INTO public.order_delivery_items (
        delivery_id, stock_batch_id, deposito_id, cantidad_meta_kilos, origen_tipo, notas
      )
      VALUES (v_delivery_id, null, null, v_qty, 'produccion_directa', null);

      INSERT INTO public.stock_movements (
        tipo_movimiento, lote_id, deposito_id, pedido_id, cantidad_meta_kilos, usuario_id, notas, metadata
      )
      VALUES (
        'produccion_directa_entrega',
        null,
        null,
        p_order_id,
        v_qty,
        v_uid,
        v_notas,
        jsonb_build_object('delivery_id', v_delivery_id)
      );
    ELSE
      v_bid := (elem->>'batch_id')::uuid;
      v_did := (elem->>'storage_location_id')::uuid;

      SELECT * INTO b FROM public.stock_batches WHERE id = v_bid AND is_active = true FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'batch_not_found';
      END IF;
      IF v_did IS NOT NULL AND v_did <> b.deposito_id THEN
        RAISE EXCEPTION 'deposit_mismatch';
      END IF;

      IF v_qty > b.cantidad_meta_kilos + 0.0001 THEN
        RAISE EXCEPTION 'insufficient_batch_qty';
      END IF;

      UPDATE public.stock_batches
      SET
        cantidad_meta_kilos = cantidad_meta_kilos - v_qty,
        cantidad_reservada_meta_kilos = least(
          cantidad_reservada_meta_kilos,
          cantidad_meta_kilos - v_qty
        ),
        updated_at = now(),
        updated_by = v_uid
      WHERE id = v_bid;

      PERFORM public.apply_batch_estado(v_bid);

      INSERT INTO public.order_delivery_items (
        delivery_id, stock_batch_id, deposito_id, cantidad_meta_kilos, origen_tipo, notas
      )
      VALUES (v_delivery_id, v_bid, b.deposito_id, v_qty, 'stock', null);

      INSERT INTO public.stock_movements (
        tipo_movimiento, lote_id, deposito_id, pedido_id, cantidad_meta_kilos, usuario_id, notas, metadata
      )
      VALUES (
        'egreso_entrega',
        v_bid,
        b.deposito_id,
        p_order_id,
        v_qty,
        v_uid,
        v_notas,
        jsonb_build_object('delivery_id', v_delivery_id)
      );
    END IF;
  END LOOP;

  UPDATE public.orders
  SET
    estado = 'entregado',
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
  VALUES (
    'order',
    p_order_id,
    'entregar_pedido',
    v_uid,
    jsonb_build_object('delivery_id', v_delivery_id, 'dinero_recibido', v_monto, 'recibio_dinero_nombre', v_nombre),
    jsonb_build_object('produccion_directa_meta_kilos', v_prod_sum)
  );

  RETURN v_delivery_id;
END;
$$;

-- 10) Cancelar sin liberar reservas de pedido (tabla vacía)
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  o record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF o.estado = 'entregado' THEN
    RAISE EXCEPTION 'cannot_cancel_delivered';
  END IF;
  IF o.estado = 'cancelado' THEN
    RETURN;
  END IF;

  DELETE FROM public.order_reservations WHERE order_id = p_order_id;

  UPDATE public.orders
  SET
    estado = 'cancelado',
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, motivo, metadata)
  VALUES (
    'order',
    p_order_id,
    'cancelar_pedido',
    v_uid,
    nullif(trim(p_reason), ''),
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.deliver_order(uuid, jsonb) IS 'Entrega: descuenta lotes sin reservas de pedido; producción directa opcional';
COMMENT ON FUNCTION public.cancel_order(uuid, text) IS 'Cancela pedido (sin liberar reservas de lote)';
