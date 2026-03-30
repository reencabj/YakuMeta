-- Extracción parcial FIFO por depósito (sin pedido): útil para ajustes manuales rápidos en Stock.
CREATE OR REPLACE FUNCTION public.extract_stock_from_deposit(
  p_deposito_id uuid,
  p_cantidad_meta_kilos numeric,
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
  v_need numeric;
  v_take numeric;
  v_disp numeric;
  v_new numeric;
  v_resv numeric;
  n integer := 0;
  v_motivo text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_cantidad_meta_kilos IS NULL OR p_cantidad_meta_kilos <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  v_motivo := nullif(trim(p_motivo), '');
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'motivo_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storage_locations sl
    WHERE sl.id = p_deposito_id AND sl.is_active = true
  ) THEN
    RAISE EXCEPTION 'deposit_not_found_or_inactive';
  END IF;

  v_need := p_cantidad_meta_kilos;

  FOR b IN
    SELECT *
    FROM public.stock_batches
    WHERE deposito_id = p_deposito_id
      AND is_active = true
      AND cantidad_meta_kilos > 0
    ORDER BY fecha_guardado ASC NULLS LAST, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;

    v_disp := b.cantidad_meta_kilos - b.cantidad_reservada_meta_kilos;
    IF v_disp <= 0 THEN
      CONTINUE;
    END IF;

    v_take := LEAST(v_disp, v_need);
    v_new := b.cantidad_meta_kilos - v_take;
    v_resv := LEAST(b.cantidad_reservada_meta_kilos, v_new);

    INSERT INTO public.audit_logs (
      entity_type, entity_id, accion, usuario_id, old_values, new_values, motivo, metadata
    )
    VALUES (
      'stock_batch',
      b.id,
      'extraccion_deposito',
      v_uid,
      jsonb_build_object('cantidad_meta_kilos', b.cantidad_meta_kilos, 'deposito_id', p_deposito_id),
      jsonb_build_object('cantidad_meta_kilos', v_new, 'extraccion_kg', v_take),
      v_motivo,
      jsonb_build_object('deposito_id', p_deposito_id)
    );

    INSERT INTO public.stock_movements (
      tipo_movimiento, lote_id, deposito_id, cantidad_meta_kilos, usuario_id, notas, metadata
    )
    VALUES (
      'ajuste_admin',
      b.id,
      p_deposito_id,
      v_take,
      v_uid,
      v_motivo,
      jsonb_build_object(
        'tipo', 'extraccion_deposito',
        'anterior', b.cantidad_meta_kilos,
        'nuevo', v_new
      )
    );

    UPDATE public.stock_batches
    SET
      cantidad_meta_kilos = v_new,
      cantidad_reservada_meta_kilos = v_resv,
      estado = CASE
        WHEN v_new <= 0 THEN 'agotado'
        WHEN v_resv <= 0 THEN 'disponible'
        WHEN v_new <= v_resv THEN 'reservado_total'
        ELSE 'reservado_parcial'
      END,
      updated_at = now(),
      updated_by = v_uid
    WHERE id = b.id;

    PERFORM public.apply_batch_estado(b.id);

    v_need := v_need - v_take;
    n := n + 1;
  END LOOP;

  IF v_need > 0.0001 THEN
    RAISE EXCEPTION 'insufficient_stock_in_deposit';
  END IF;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extract_stock_from_deposit(uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.extract_stock_from_deposit IS
  'FIFO por fecha_guardado: descuenta kg libres del depósito; movimientos ajuste_admin + auditoría.';
