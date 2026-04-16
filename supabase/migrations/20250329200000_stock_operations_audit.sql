-- =============================================================================
-- Tipos de movimiento extendidos + RPCs auditados (transferencia, ajuste, vaciado, composición)
-- Sin DELETE físico de lotes: solo actualizaciones y movimientos.
-- =============================================================================

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_tipo_movimiento_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_tipo_movimiento_check CHECK (
    tipo_movimiento IN (
      'ingreso',
      'reserva',
      'liberacion_reserva',
      'egreso_entrega',
      'ajuste_admin',
      'correccion',
      'descarte',
      'produccion_directa_entrega',
      'transferencia_salida',
      'transferencia_entrada',
      'vaciado_deposito',
      'correccion_composicion'
    )
  );

-- -----------------------------------------------------------------------------
-- Transferir stock de un lote a un nuevo lote en otro depósito (parcial o total del disponible)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_stock_batch(
  p_source_batch_id uuid,
  p_dest_deposito_id uuid,
  p_cantidad_meta_kilos numeric,
  p_notas text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  b record;
  v_disp numeric;
  v_new_total numeric;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_cantidad_meta_kilos IS NULL OR p_cantidad_meta_kilos <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT * INTO b
  FROM public.stock_batches
  WHERE id = p_source_batch_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found';
  END IF;

  v_disp := b.cantidad_meta_kilos - b.cantidad_reservada_meta_kilos;
  IF p_cantidad_meta_kilos > v_disp THEN
    RAISE EXCEPTION 'insufficient_available';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.storage_locations sl WHERE sl.id = p_dest_deposito_id AND sl.is_active = true) THEN
    RAISE EXCEPTION 'dest_not_found';
  END IF;

  IF p_dest_deposito_id = b.deposito_id THEN
    RAISE EXCEPTION 'same_deposit';
  END IF;

  v_new_total := b.cantidad_meta_kilos - p_cantidad_meta_kilos;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, old_values, new_values, motivo, metadata)
  VALUES (
    'stock_batch',
    p_source_batch_id,
    'transferencia_salida',
    v_uid,
    jsonb_build_object(
      'cantidad_meta_kilos', b.cantidad_meta_kilos,
      'deposito_id', b.deposito_id
    ),
    jsonb_build_object(
      'cantidad_meta_kilos', v_new_total,
      'cantidad_movida', p_cantidad_meta_kilos,
      'deposito_destino', p_dest_deposito_id
    ),
    nullif(trim(p_notas), ''),
    jsonb_build_object('tipo', 'transferencia_salida')
  );

  INSERT INTO public.stock_movements (
    tipo_movimiento, lote_id, deposito_id, cantidad_meta_kilos, usuario_id, notas, metadata
  )
  VALUES (
    'transferencia_salida',
    p_source_batch_id,
    b.deposito_id,
    p_cantidad_meta_kilos,
    v_uid,
    nullif(trim(p_notas), ''),
    jsonb_build_object(
      'dest_deposito_id', p_dest_deposito_id,
      'cantidad_batch_antes', b.cantidad_meta_kilos,
      'cantidad_batch_despues', v_new_total
    )
  );

  UPDATE public.stock_batches
  SET
    cantidad_meta_kilos = v_new_total,
    estado = CASE WHEN v_new_total <= 0 THEN 'agotado' ELSE estado END,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_source_batch_id;

  INSERT INTO public.stock_batches (
    deposito_id,
    cantidad_meta_kilos,
    fecha_guardado,
    guardado_por_usuario_id,
    fecha_vencimiento_estimada,
    observaciones,
    estado,
    created_by,
    metadata
  )
  VALUES (
    p_dest_deposito_id,
    p_cantidad_meta_kilos,
    b.fecha_guardado,
    coalesce(b.guardado_por_usuario_id, v_uid),
    b.fecha_vencimiento_estimada,
    'Transferido desde lote ' || p_source_batch_id::text,
    'disponible',
    v_uid,
    jsonb_build_object(
      'transferido_desde_batch_id', p_source_batch_id,
      'transferencia', true
    )
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.stock_movements (
    tipo_movimiento, lote_id, deposito_id, cantidad_meta_kilos, usuario_id, notas, metadata
  )
  VALUES (
    'transferencia_entrada',
    v_new_id,
    p_dest_deposito_id,
    p_cantidad_meta_kilos,
    v_uid,
    nullif(trim(p_notas), ''),
    jsonb_build_object('source_batch_id', p_source_batch_id)
  );

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, old_values, new_values, motivo, metadata)
  VALUES (
    'stock_batch',
    v_new_id,
    'transferencia_entrada',
    v_uid,
    NULL,
    jsonb_build_object(
      'cantidad_meta_kilos', p_cantidad_meta_kilos,
      'deposito_id', p_dest_deposito_id,
      'origen_batch_id', p_source_batch_id
    ),
    nullif(trim(p_notas), ''),
    jsonb_build_object('tipo', 'transferencia_entrada')
  );

  RETURN v_new_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Ajuste manual de cantidad en un lote (auditado)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_stock_batch_quantity(
  p_batch_id uuid,
  p_nueva_cantidad_meta_kilos numeric,
  p_motivo text,
  p_notas text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  b record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_nueva_cantidad_meta_kilos IS NULL OR p_nueva_cantidad_meta_kilos < 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT * INTO b FROM public.stock_batches WHERE id = p_batch_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found';
  END IF;

  IF p_nueva_cantidad_meta_kilos < b.cantidad_reservada_meta_kilos THEN
    RAISE EXCEPTION 'below_reserved';
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, old_values, new_values, motivo, metadata)
  VALUES (
    'stock_batch',
    p_batch_id,
    'ajuste_admin',
    v_uid,
    jsonb_build_object('cantidad_meta_kilos', b.cantidad_meta_kilos, 'metadata', coalesce(b.metadata, '{}'::jsonb)),
    jsonb_build_object('cantidad_meta_kilos', p_nueva_cantidad_meta_kilos),
    nullif(trim(p_motivo), ''),
    jsonb_build_object('notas', nullif(trim(p_notas), ''))
  );

  INSERT INTO public.stock_movements (
    tipo_movimiento, lote_id, deposito_id, cantidad_meta_kilos, usuario_id, notas, metadata
  )
  VALUES (
    'ajuste_admin',
    p_batch_id,
    b.deposito_id,
    abs(p_nueva_cantidad_meta_kilos - b.cantidad_meta_kilos),
    v_uid,
    coalesce(nullif(trim(p_notas), ''), nullif(trim(p_motivo), '')),
    jsonb_build_object(
      'anterior', b.cantidad_meta_kilos,
      'nuevo', p_nueva_cantidad_meta_kilos,
      'motivo', nullif(trim(p_motivo), '')
    )
  );

  UPDATE public.stock_batches
  SET
    cantidad_meta_kilos = p_nueva_cantidad_meta_kilos,
    estado = CASE
      WHEN p_nueva_cantidad_meta_kilos <= 0 THEN 'agotado'
      WHEN b.cantidad_reservada_meta_kilos <= 0 THEN 'disponible'
      WHEN p_nueva_cantidad_meta_kilos <= b.cantidad_reservada_meta_kilos THEN 'reservado_total'
      ELSE 'reservado_parcial'
    END,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_batch_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Vaciar todo el stock activo de un depósito (lotes a 0, sin DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empty_storage_location_stock(
  p_deposito_id uuid,
  p_motivo text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  b record;
  n integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.storage_locations sl WHERE sl.id = p_deposito_id) THEN
    RAISE EXCEPTION 'deposit_not_found';
  END IF;

  IF nullif(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo_required';
  END IF;

  FOR b IN
    SELECT * FROM public.stock_batches
    WHERE deposito_id = p_deposito_id AND is_active = true AND cantidad_meta_kilos > 0
    ORDER BY id
    FOR UPDATE
  LOOP
    INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, old_values, new_values, motivo, metadata)
    VALUES (
      'stock_batch',
      b.id,
      'vaciado_deposito',
      v_uid,
      jsonb_build_object('cantidad_meta_kilos', b.cantidad_meta_kilos, 'deposito_id', p_deposito_id),
      jsonb_build_object('cantidad_meta_kilos', 0),
      trim(p_motivo),
      jsonb_build_object('deposito_id', p_deposito_id)
    );

    INSERT INTO public.stock_movements (
      tipo_movimiento, lote_id, deposito_id, cantidad_meta_kilos, usuario_id, notas, metadata
    )
    VALUES (
      'vaciado_deposito',
      b.id,
      p_deposito_id,
      b.cantidad_meta_kilos,
      v_uid,
      trim(p_motivo),
      jsonb_build_object('anterior', b.cantidad_meta_kilos, 'motivo', trim(p_motivo))
    );

    UPDATE public.stock_batches
    SET
      cantidad_meta_kilos = 0,
      cantidad_reservada_meta_kilos = 0,
      estado = 'agotado',
      updated_at = now(),
      updated_by = v_uid
    WHERE id = b.id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

-- -----------------------------------------------------------------------------
-- Corregir composición (packs/individuales) y recalcular kg de meta + metadata
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_batch_composition(
  p_batch_id uuid,
  p_packs_de_3 integer,
  p_bolsas_individuales integer,
  p_motivo text,
  p_notas text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  b record;
  v_total_bolsas integer;
  v_new_kg numeric;
  v_meta jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_packs_de_3 IS NULL OR p_packs_de_3 < 0 OR p_bolsas_individuales IS NULL OR p_bolsas_individuales < 0 THEN
    RAISE EXCEPTION 'invalid_composition';
  END IF;

  SELECT * INTO b FROM public.stock_batches WHERE id = p_batch_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found';
  END IF;

  v_total_bolsas := p_packs_de_3 * 3 + p_bolsas_individuales;
  IF v_total_bolsas <= 0 THEN
    RAISE EXCEPTION 'invalid_total_bolsas';
  END IF;

  v_new_kg := (v_total_bolsas::numeric / 50.0);

  IF v_new_kg < b.cantidad_reservada_meta_kilos THEN
    RAISE EXCEPTION 'below_reserved';
  END IF;

  v_meta := coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
    'modo_ingreso', 'correccion_composicion',
    'packs_de_3', p_packs_de_3,
    'bolsas_individuales', p_bolsas_individuales,
    'total_bolsas', v_total_bolsas
  );

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, old_values, new_values, motivo, metadata)
  VALUES (
    'stock_batch',
    p_batch_id,
    'correccion_composicion',
    v_uid,
    jsonb_build_object(
      'cantidad_meta_kilos', b.cantidad_meta_kilos,
      'metadata', coalesce(b.metadata, '{}'::jsonb)
    ),
    jsonb_build_object(
      'cantidad_meta_kilos', v_new_kg,
      'metadata', v_meta
    ),
    nullif(trim(p_motivo), ''),
    jsonb_build_object('notas', nullif(trim(p_notas), ''))
  );

  INSERT INTO public.stock_movements (
    tipo_movimiento, lote_id, deposito_id, cantidad_meta_kilos, usuario_id, notas, metadata
  )
  VALUES (
    'correccion_composicion',
    p_batch_id,
    b.deposito_id,
    abs(v_new_kg - b.cantidad_meta_kilos),
    v_uid,
    coalesce(nullif(trim(p_notas), ''), nullif(trim(p_motivo), '')),
    jsonb_build_object(
      'anterior_kg', b.cantidad_meta_kilos,
      'nuevo_kg', v_new_kg,
      'packs_de_3', p_packs_de_3,
      'bolsas_individuales', p_bolsas_individuales,
      'total_bolsas', v_total_bolsas,
      'motivo', nullif(trim(p_motivo), '')
    )
  );

  UPDATE public.stock_batches
  SET
    cantidad_meta_kilos = v_new_kg,
    metadata = v_meta,
    estado = CASE
      WHEN v_new_kg <= 0 THEN 'agotado'
      WHEN b.cantidad_reservada_meta_kilos <= 0 THEN 'disponible'
      WHEN v_new_kg <= b.cantidad_reservada_meta_kilos THEN 'reservado_total'
      ELSE 'reservado_parcial'
    END,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = p_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock_batch(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock_batch_quantity(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.empty_storage_location_stock(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_batch_composition(uuid, integer, integer, text, text) TO authenticated;

COMMENT ON FUNCTION public.transfer_stock_batch(uuid, uuid, numeric, text) IS 'Admin: mueve cantidad disponible de un lote a un nuevo lote en otro depósito; auditado.';
COMMENT ON FUNCTION public.adjust_stock_batch_quantity(uuid, numeric, text, text) IS 'Admin: fija nueva cantidad de meta en un lote; auditado.';
COMMENT ON FUNCTION public.empty_storage_location_stock(uuid, text) IS 'Admin: deja en 0 todos los lotes con stock del depósito; auditado.';
COMMENT ON FUNCTION public.update_batch_composition(uuid, integer, integer, text, text) IS 'Admin: recalcula kg desde packs/bolsas y actualiza metadata; auditado.';
