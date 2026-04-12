-- Cobro antes de la entrega: quién recibió el dinero y monto; deliver_order reutiliza estos datos.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cobrado_pre_entrega_at timestamptz,
  ADD COLUMN IF NOT EXISTS cobrado_recibio_dinero_usuario_id uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS cobrado_monto numeric(14, 2);

COMMENT ON COLUMN public.orders.cobrado_pre_entrega_at IS 'Si no es null, el pedido ya fue marcado como cobrado antes de entregar mercadería.';
COMMENT ON COLUMN public.orders.cobrado_recibio_dinero_usuario_id IS 'Perfil que recibió el efectivo al marcar cobro previo.';
COMMENT ON COLUMN public.orders.cobrado_monto IS 'Monto cobrado al marcar cobro previo.';

-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_cobrado_pre_entrega(
  p_order_id uuid,
  p_recibio_dinero_usuario_id uuid,
  p_monto numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  o record;
  v_uname text;
  v_dname text;
  v_active boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_monto IS NULL OR p_monto < 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF o.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'order_not_editable';
  END IF;
  IF o.cobrado_pre_entrega_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_cobrado_pre_entrega';
  END IF;

  SELECT username, display_name, is_active
  INTO v_uname, v_dname, v_active
  FROM public.profiles
  WHERE id = p_recibio_dinero_usuario_id;

  IF NOT FOUND OR NOT v_active THEN
    RAISE EXCEPTION 'invalid_recibio_dinero_user';
  END IF;

  UPDATE public.orders
  SET
    cobrado_pre_entrega_at = now(),
    cobrado_recibio_dinero_usuario_id = p_recibio_dinero_usuario_id,
    cobrado_monto = round(p_monto, 2),
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
  VALUES (
    'order',
    p_order_id,
    'cobrar_pre_entrega',
    v_uid,
    jsonb_build_object(
      'recibio_dinero_usuario_id', p_recibio_dinero_usuario_id,
      'monto', round(p_monto, 2)
    ),
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.mark_order_cobrado_pre_entrega(uuid, uuid, numeric) IS
  'Registra cobro previo a la entrega (usuario que recibió el efectivo + monto).';

GRANT EXECUTE ON FUNCTION public.mark_order_cobrado_pre_entrega(uuid, uuid, numeric) TO authenticated;

-- Si ya hubo cobro previo, deliver_order usa datos del pedido y no exige payload de dinero.
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
  v_recv_uid uuid;
  v_recv_uname text;
  v_recv_dname text;
  v_recv_active boolean;
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

  v_entrega_ts := coalesce((p_payload->>'delivered_at')::timestamptz, now());
  v_notas := nullif(trim(p_payload->>'notes'), '');
  v_items := p_payload->'items';

  IF o.cobrado_pre_entrega_at IS NOT NULL THEN
    v_recv_uid := o.cobrado_recibio_dinero_usuario_id;
    IF v_recv_uid IS NULL THEN
      RAISE EXCEPTION 'cobrado_pre_entrega_incomplete';
    END IF;

    SELECT username, display_name, is_active
    INTO v_recv_uname, v_recv_dname, v_recv_active
    FROM public.profiles
    WHERE id = v_recv_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_recibio_dinero_user';
    END IF;
    IF NOT v_recv_active THEN
      RAISE EXCEPTION 'invalid_recibio_dinero_user';
    END IF;

    v_nombre := coalesce(nullif(trim(v_recv_dname), ''), v_recv_uname);
    v_monto := coalesce(o.cobrado_monto, o.total_sugerido, 0::numeric);

    IF v_monto IS NULL OR v_monto < 0 THEN
      RAISE EXCEPTION 'invalid_amount';
    END IF;
  ELSE
    IF p_payload->>'recibio_dinero_usuario_id' IS NULL OR nullif(trim(p_payload->>'recibio_dinero_usuario_id'), '') IS NULL THEN
      RAISE EXCEPTION 'recibio_dinero_usuario_id_required';
    END IF;

    v_recv_uid := trim(p_payload->>'recibio_dinero_usuario_id')::uuid;

    SELECT username, display_name, is_active
    INTO v_recv_uname, v_recv_dname, v_recv_active
    FROM public.profiles
    WHERE id = v_recv_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_recibio_dinero_user';
    END IF;
    IF NOT v_recv_active THEN
      RAISE EXCEPTION 'invalid_recibio_dinero_user';
    END IF;

    v_nombre := coalesce(nullif(trim(v_recv_dname), ''), v_recv_uname);

    v_monto := (p_payload->>'amount_received')::numeric;

    IF v_monto IS NULL OR v_monto < 0 THEN
      RAISE EXCEPTION 'invalid_amount';
    END IF;
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
    v_recv_uid,
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
    kilos_entregados_acumulado = cantidad_meta_kilos,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
  VALUES (
    'order',
    p_order_id,
    'entregar_pedido',
    v_uid,
    jsonb_build_object(
      'delivery_id', v_delivery_id,
      'dinero_recibido', v_monto,
      'recibio_dinero_nombre', v_nombre,
      'recibio_dinero_usuario_id', v_recv_uid
    ),
    jsonb_build_object('produccion_directa_meta_kilos', v_prod_sum)
  );

  RETURN v_delivery_id;
END;
$$;

COMMENT ON FUNCTION public.deliver_order(uuid, jsonb) IS
  'Entrega: dinero desde payload o, si cobrado_pre_entrega_at está seteado, desde el pedido.';
