-- =============================================================================
-- Módulo Pedidos: columnas, índices únicos, helpers y RPC transaccionales
-- =============================================================================

-- Precio sugerido al crear (snapshot; la entrega guarda monto real)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS precio_sugerido_por_kilo numeric(14, 2),
  ADD COLUMN IF NOT EXISTS total_sugerido numeric(14, 2);

COMMENT ON COLUMN public.orders.precio_sugerido_por_kilo IS 'Regla de pricing aplicable al momento del alta';
COMMENT ON COLUMN public.orders.total_sugerido IS 'cantidad_meta_kilos * precio_sugerido_por_kilo (snapshot)';

-- Quién recibió el efectivo (texto operativo; el alta sigue ligada a auth)
ALTER TABLE public.order_deliveries
  ADD COLUMN IF NOT EXISTS recibio_dinero_nombre text NOT NULL DEFAULT '';

UPDATE public.order_deliveries SET recibio_dinero_nombre = '' WHERE recibio_dinero_nombre IS NULL;

-- Una fila de reserva por par pedido/lote
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_reservations_order_batch
  ON public.order_reservations (order_id, stock_batch_id);

-- -----------------------------------------------------------------------------
-- Estado de lote coherente con cantidades
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_batch_estado(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM public.stock_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public.stock_batches
  SET
    estado = CASE
      WHEN b.cantidad_meta_kilos <= 0 THEN 'agotado'
      WHEN b.cantidad_reservada_meta_kilos <= 0 THEN 'disponible'
      WHEN b.cantidad_meta_kilos <= b.cantidad_reservada_meta_kilos THEN 'reservado_total'
      ELSE 'reservado_parcial'
    END,
    updated_at = now()
  WHERE id = p_batch_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Recalcular estado del pedido según suma de reservas (no toca entregado/cancelado/en_preparacion)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_order_estado(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_sum numeric;
  v_pedido numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF o.estado IN ('entregado', 'cancelado') THEN
    RETURN;
  END IF;
  IF o.estado = 'en_preparacion' THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(r.cantidad_meta_kilos), 0) INTO v_sum
  FROM public.order_reservations r
  WHERE r.order_id = p_order_id;

  v_pedido := o.cantidad_meta_kilos;

  UPDATE public.orders
  SET
    estado = CASE
      WHEN v_sum <= 0 THEN 'pendiente'
      WHEN v_sum < v_pedido THEN 'reservado_parcial'
      ELSE 'reservado_completo'
    END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- Precio sugerido según reglas activas (mayor cantidad_minima que aplica)
CREATE OR REPLACE FUNCTION public.resolve_suggested_price_per_kg(p_cantidad_meta_kilos numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT pr.precio_por_kilo
  FROM public.pricing_rules pr
  WHERE pr.is_active
    AND pr.cantidad_minima_kilos <= p_cantidad_meta_kilos
  ORDER BY pr.prioridad DESC, pr.cantidad_minima_kilos DESC
  LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- 1) create_order
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_cliente_nombre text,
  p_cantidad_meta_kilos numeric,
  p_fecha_pedido date,
  p_fecha_encargo date,
  p_notas text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_precio numeric;
  v_total numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF coalesce(trim(p_cliente_nombre), '') = '' THEN
    RAISE EXCEPTION 'cliente_required';
  END IF;
  IF p_cantidad_meta_kilos IS NULL OR p_cantidad_meta_kilos <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  v_precio := public.resolve_suggested_price_per_kg(p_cantidad_meta_kilos);
  v_total := round(p_cantidad_meta_kilos * coalesce(v_precio, 0), 2);

  INSERT INTO public.orders (
    id,
    cliente_nombre,
    cantidad_meta_kilos,
    fecha_pedido,
    fecha_encargo,
    creado_por_usuario_id,
    estado,
    notas,
    precio_sugerido_por_kilo,
    total_sugerido
  )
  VALUES (
    v_id,
    trim(p_cliente_nombre),
    p_cantidad_meta_kilos,
    coalesce(p_fecha_pedido, current_date),
    p_fecha_encargo,
    v_uid,
    'pendiente',
    nullif(trim(p_notas), ''),
    v_precio,
    v_total
  );

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
  VALUES (
    'order',
    v_id,
    'crear_pedido',
    v_uid,
    jsonb_build_object(
      'cliente_nombre', trim(p_cliente_nombre),
      'cantidad_meta_kilos', p_cantidad_meta_kilos,
      'precio_sugerido_por_kilo', v_precio,
      'total_sugerido', v_total
    ),
    jsonb_build_object('fecha_pedido', p_fecha_pedido, 'fecha_encargo', p_fecha_encargo)
  );

  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) reserve_from_batches
-- p_items: [{"batch_id":"uuid","quantity_meta_kilos":n}, ...] cantidades absolutas por lote
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_from_batches(p_order_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  o record;
  it record;
  b record;
  v_old numeric;
  v_new numeric;
  v_delta numeric;
  v_max numeric;
  v_sum_after numeric;
  elem jsonb;
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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_new := (elem->>'quantity_meta_kilos')::numeric;
    IF v_new IS NULL OR v_new < 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    SELECT * INTO b
    FROM public.stock_batches
    WHERE id = (elem->>'batch_id')::uuid AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'batch_not_found';
    END IF;

    SELECT coalesce(r.cantidad_meta_kilos, 0) INTO v_old
    FROM public.order_reservations r
    WHERE r.order_id = p_order_id AND r.stock_batch_id = b.id;

    v_delta := v_new - v_old;

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    IF v_new = 0 THEN
      DELETE FROM public.order_reservations
      WHERE order_id = p_order_id AND stock_batch_id = b.id;
    ELSE
      v_max :=
        b.cantidad_meta_kilos - b.cantidad_reservada_meta_kilos + v_old;
      IF v_new > v_max THEN
        RAISE EXCEPTION 'insufficient_available';
      END IF;

      INSERT INTO public.order_reservations (order_id, stock_batch_id, deposito_id, cantidad_meta_kilos, created_by)
      VALUES (p_order_id, b.id, b.deposito_id, v_new, v_uid)
      ON CONFLICT (order_id, stock_batch_id) DO UPDATE
      SET cantidad_meta_kilos = excluded.cantidad_meta_kilos;
    END IF;

    UPDATE public.stock_batches
    SET
      cantidad_reservada_meta_kilos = cantidad_reservada_meta_kilos + v_delta,
      updated_at = now(),
      updated_by = v_uid
    WHERE id = b.id;

    PERFORM public.apply_batch_estado(b.id);

    INSERT INTO public.stock_movements (
      tipo_movimiento, lote_id, deposito_id, pedido_id, cantidad_meta_kilos, usuario_id, notas, metadata
    )
    VALUES (
      'reserva',
      b.id,
      b.deposito_id,
      p_order_id,
      abs(v_delta),
      v_uid,
      null,
      jsonb_build_object(
        'delta', v_delta,
        'nuevo_total_reserva_pedido_lote', v_new,
        'batch_id', b.id
      )
    );

    INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
    VALUES (
      'order',
      p_order_id,
      'reserva_stock',
      v_uid,
      jsonb_build_object('batch_id', b.id, 'cantidad_meta_kilos', v_new),
      jsonb_build_object('delta', v_delta)
    );
  END LOOP;

  SELECT coalesce(sum(r.cantidad_meta_kilos), 0) INTO v_sum_after
  FROM public.order_reservations r
  WHERE r.order_id = p_order_id;

  IF v_sum_after > o.cantidad_meta_kilos + 0.0001 THEN
    RAISE EXCEPTION 'reserva_excede_pedido';
  END IF;

  PERFORM public.recalculate_order_estado(p_order_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) release_reservations_for_order
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_reservations_for_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  o record;
  r record;
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

  FOR r IN
    SELECT * FROM public.order_reservations WHERE order_id = p_order_id
  LOOP
    UPDATE public.stock_batches
    SET
      cantidad_reservada_meta_kilos = cantidad_reservada_meta_kilos - r.cantidad_meta_kilos,
      updated_at = now(),
      updated_by = v_uid
    WHERE id = r.stock_batch_id;

    PERFORM public.apply_batch_estado(r.stock_batch_id);

    INSERT INTO public.stock_movements (
      tipo_movimiento, lote_id, deposito_id, pedido_id, cantidad_meta_kilos, usuario_id, notas, metadata
    )
    VALUES (
      'liberacion_reserva',
      r.stock_batch_id,
      r.deposito_id,
      p_order_id,
      r.cantidad_meta_kilos,
      v_uid,
      null,
      jsonb_build_object('order_reservation_id', r.id)
    );
  END LOOP;

  DELETE FROM public.order_reservations WHERE order_id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, metadata)
  VALUES ('order', p_order_id, 'liberar_reservas', v_uid, '{}'::jsonb);

  PERFORM public.recalculate_order_estado(p_order_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) suggest_reservations_for_order → jsonb (solo lectura + CPU)
-- Fases: (1) grupos que cubren el faltante completo (recommend_storage_groups_for_meta)
--        (2) resto de grupos activos con algo útil, por mayor contribución (kg libre
--            aún no usado en el grupo), luego ocupación y nombre
--        (3) lotes globales FIFO excluyendo lotes ya usados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suggest_reservations_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_reservado numeric;
  v_falta numeric;
  v_remaining numeric;
  g record;
  b record;
  v_take numeric;
  v_disp numeric;
  ja jsonb := '[]'::jsonb;
  jg jsonb := '[]'::jsonb;
  jflat jsonb := '[]'::jsonb;
  used uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'order_not_found');
  END IF;

  SELECT coalesce(sum(r.cantidad_meta_kilos), 0) INTO v_reservado
  FROM public.order_reservations r WHERE r.order_id = p_order_id;

  v_falta := greatest(o.cantidad_meta_kilos - v_reservado, 0);
  v_remaining := v_falta;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'pedido_kilos', o.cantidad_meta_kilos,
      'ya_reservado_kilos', v_reservado,
      'falta_kilos', 0,
      'grupos', '[]'::jsonb,
      'lotes_fuera_grupo', '[]'::jsonb,
      'propuesta_plana', '[]'::jsonb
    );
  END IF;

  -- Fase 1: grupos con stock_libre >= faltante actual (pueden cubrir todo lo que queda)
  FOR g IN
    SELECT * FROM public.recommend_storage_groups_for_meta(v_remaining)
  LOOP
    EXIT WHEN v_remaining <= 0;
    FOR b IN
      SELECT sb.*
      FROM public.stock_batches sb
      INNER JOIN public.storage_group_members sgm ON sgm.storage_location_id = sb.deposito_id AND sgm.group_id = g.group_id
      WHERE sb.is_active = true
        AND sb.cantidad_meta_kilos > 0
        AND NOT (sb.id = ANY (used))
      ORDER BY sb.fecha_guardado ASC NULLS LAST, sb.created_at ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_disp := b.cantidad_meta_kilos - b.cantidad_reservada_meta_kilos;
      IF v_disp <= 0 THEN
        CONTINUE;
      END IF;
      v_take := least(v_remaining, v_disp);
      used := array_append(used, b.id);
      jflat := jflat || jsonb_build_array(
        jsonb_build_object(
          'batch_id', b.id,
          'deposito_id', b.deposito_id,
          'quantity_meta_kilos', v_take,
          'disponible_meta_kilos', v_disp,
          'fecha_guardado', b.fecha_guardado,
          'group_id', g.group_id,
          'group_nombre', g.nombre,
          'fase', 'grupo_cubre_completo'
        )
      );
      jg := jg || jsonb_build_array(
        jsonb_build_object(
          'batch_id', b.id,
          'deposito_id', b.deposito_id,
          'quantity_meta_kilos', v_take,
          'fecha_guardado', b.fecha_guardado
        )
      );
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF jsonb_array_length(jg) > 0 THEN
      ja := ja || jsonb_build_array(
        jsonb_build_object(
          'group_id', g.group_id,
          'nombre', g.nombre,
          'descripcion', g.descripcion,
          'fase', 'grupo_cubre_completo',
          'lotes', jg
        )
      );
      jg := '[]'::jsonb;
    END IF;
  END LOOP;

  -- Fase 2: grupos parcialmente útiles (aún pueden aportar kg desde lotes no usados)
  IF v_remaining > 0 THEN
    FOR g IN
      SELECT *
      FROM (
        SELECT
          vm.group_id,
          vm.nombre,
          vm.descripcion,
          vm.porcentaje_ocupacion,
          (
            SELECT coalesce(
              sum(
                greatest(
                  sb.cantidad_meta_kilos - sb.cantidad_reservada_meta_kilos,
                  0::numeric
                )
              ),
              0::numeric
            )
            FROM public.stock_batches sb
            INNER JOIN public.storage_group_members sgm
              ON sgm.storage_location_id = sb.deposito_id
             AND sgm.group_id = vm.group_id
            WHERE sb.is_active = true
              AND sb.cantidad_meta_kilos > 0
              AND NOT (sb.id = ANY (used))
          ) AS contrib_restante
        FROM public.v_storage_group_metrics vm
        WHERE vm.activo = true
      ) ranked
      WHERE ranked.contrib_restante > 0
      ORDER BY ranked.contrib_restante DESC, ranked.porcentaje_ocupacion ASC, ranked.nombre ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      FOR b IN
        SELECT sb.*
        FROM public.stock_batches sb
        INNER JOIN public.storage_group_members sgm ON sgm.storage_location_id = sb.deposito_id AND sgm.group_id = g.group_id
        WHERE sb.is_active = true
          AND sb.cantidad_meta_kilos > 0
          AND NOT (sb.id = ANY (used))
        ORDER BY sb.fecha_guardado ASC NULLS LAST, sb.created_at ASC
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_disp := b.cantidad_meta_kilos - b.cantidad_reservada_meta_kilos;
        IF v_disp <= 0 THEN
          CONTINUE;
        END IF;
        v_take := least(v_remaining, v_disp);
        used := array_append(used, b.id);
        jflat := jflat || jsonb_build_array(
          jsonb_build_object(
            'batch_id', b.id,
            'deposito_id', b.deposito_id,
            'quantity_meta_kilos', v_take,
            'disponible_meta_kilos', v_disp,
            'fecha_guardado', b.fecha_guardado,
            'group_id', g.group_id,
            'group_nombre', g.nombre,
            'fase', 'grupo_parcial'
          )
        );
        jg := jg || jsonb_build_array(
          jsonb_build_object(
            'batch_id', b.id,
            'deposito_id', b.deposito_id,
            'quantity_meta_kilos', v_take,
            'fecha_guardado', b.fecha_guardado
          )
        );
        v_remaining := v_remaining - v_take;
      END LOOP;

      IF jsonb_array_length(jg) > 0 THEN
        ja := ja || jsonb_build_array(
          jsonb_build_object(
            'group_id', g.group_id,
            'nombre', g.nombre,
            'descripcion', g.descripcion,
            'fase', 'grupo_parcial',
            'contrib_restante_rank', g.contrib_restante,
            'lotes', jg
          )
        );
        jg := '[]'::jsonb;
      END IF;
    END LOOP;
  END IF;

  -- Fase 3: depósitos fuera de cualquier grupo / remate global FIFO
  IF v_remaining > 0 THEN
    FOR b IN
      SELECT sb.*
      FROM public.stock_batches sb
      WHERE sb.is_active = true
        AND sb.cantidad_meta_kilos > 0
        AND NOT (sb.id = ANY (used))
      ORDER BY sb.fecha_guardado ASC NULLS LAST, sb.created_at ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_disp := b.cantidad_meta_kilos - b.cantidad_reservada_meta_kilos;
      IF v_disp <= 0 THEN
        CONTINUE;
      END IF;
      v_take := least(v_remaining, v_disp);
      used := array_append(used, b.id);
      jflat := jflat || jsonb_build_array(
        jsonb_build_object(
          'batch_id', b.id,
          'deposito_id', b.deposito_id,
          'quantity_meta_kilos', v_take,
          'disponible_meta_kilos', v_disp,
          'fecha_guardado', b.fecha_guardado,
          'group_id', null,
          'group_nombre', null,
          'fase', 'global_fifo'
        )
      );
      v_remaining := v_remaining - v_take;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'pedido_kilos', o.cantidad_meta_kilos,
    'ya_reservado_kilos', v_reservado,
    'falta_kilos', v_falta,
    'grupos', ja,
    'lotes_fuera_grupo', COALESCE(
      (
        SELECT jsonb_agg(x.elem)
        FROM jsonb_array_elements(jflat) AS x(elem)
        WHERE (elem->>'group_id') IS NULL
          OR elem->>'group_id' = 'null'
      ),
      '[]'::jsonb
    ),
    'propuesta_plana', jflat
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) deliver_order
-- -----------------------------------------------------------------------------
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
  v_res numeric;
  v_from_res numeric;
  v_prod_sum numeric := 0;
  v_stock_sum numeric := 0;
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
    ELSE
      v_stock_sum := v_stock_sum + v_qty;
      v_bid := (elem->>'batch_id')::uuid;
      IF v_bid IS NULL THEN
        RAISE EXCEPTION 'batch_required_for_stock';
      END IF;
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

      SELECT coalesce(r.cantidad_meta_kilos, 0) INTO v_res
      FROM public.order_reservations r
      WHERE r.order_id = p_order_id AND r.stock_batch_id = v_bid;

      v_from_res := least(v_qty, v_res);

      UPDATE public.stock_batches
      SET
        cantidad_meta_kilos = cantidad_meta_kilos - v_qty,
        cantidad_reservada_meta_kilos = cantidad_reservada_meta_kilos - v_from_res,
        updated_at = now(),
        updated_by = v_uid
      WHERE id = v_bid;

      PERFORM public.apply_batch_estado(v_bid);

      IF v_from_res > 0 THEN
        IF v_from_res >= v_res THEN
          DELETE FROM public.order_reservations
          WHERE order_id = p_order_id AND stock_batch_id = v_bid;
        ELSE
          UPDATE public.order_reservations
          SET cantidad_meta_kilos = cantidad_meta_kilos - v_from_res
          WHERE order_id = p_order_id AND stock_batch_id = v_bid;
        END IF;
      END IF;

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
        jsonb_build_object(
          'delivery_id', v_delivery_id,
          'consumido_de_reserva', v_from_res
        )
      );
    END IF;
  END LOOP;

  DELETE FROM public.order_reservations WHERE order_id = p_order_id;

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

-- -----------------------------------------------------------------------------
-- 6) cancel_order
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  o record;
  r record;
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

  FOR r IN SELECT * FROM public.order_reservations WHERE order_id = p_order_id
  LOOP
    UPDATE public.stock_batches
    SET
      cantidad_reservada_meta_kilos = cantidad_reservada_meta_kilos - r.cantidad_meta_kilos,
      updated_at = now(),
      updated_by = v_uid
    WHERE id = r.stock_batch_id;
    PERFORM public.apply_batch_estado(r.stock_batch_id);

    INSERT INTO public.stock_movements (
      tipo_movimiento, lote_id, deposito_id, pedido_id, cantidad_meta_kilos, usuario_id, notas, metadata
    )
    VALUES (
      'liberacion_reserva',
      r.stock_batch_id,
      r.deposito_id,
      p_order_id,
      r.cantidad_meta_kilos,
      v_uid,
      null,
      jsonb_build_object('motivo_cancelacion', nullif(trim(p_reason), ''))
    );
  END LOOP;

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

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_order(text, numeric, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_from_batches(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_reservations_for_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_reservations_for_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_order(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_order(text, numeric, date, date, text) IS
  'Alta de pedido con snapshot de precio sugerido';
COMMENT ON FUNCTION public.reserve_from_batches(uuid, jsonb) IS 'Reserva absoluta por lote (JSON array); valida disponibilidad';
COMMENT ON FUNCTION public.release_reservations_for_order(uuid) IS 'Libera todas las reservas del pedido';
COMMENT ON FUNCTION public.suggest_reservations_for_order(uuid) IS 'Propuesta de reserva por grupos + FIFO; no modifica datos';
COMMENT ON FUNCTION public.deliver_order(uuid, jsonb) IS 'Entrega: stock y/o producción directa; cierra pedido';
COMMENT ON FUNCTION public.cancel_order(uuid, text) IS 'Cancela pedido y libera reservas';
