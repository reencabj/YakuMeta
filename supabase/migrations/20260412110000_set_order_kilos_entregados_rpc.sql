-- Actualización aislada de kilos entregados (seguimiento operativo).
-- No modifica precio_sugerido_por_kilo ni total_sugerido (snapshot del alta).

CREATE OR REPLACE FUNCTION public.set_order_kilos_entregados_acumulado(p_order_id uuid, p_kilos numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_kilos IS NULL OR p_kilos < 0 THEN
    RAISE EXCEPTION 'invalid_kilos';
  END IF;

  UPDATE public.orders
  SET kilos_entregados_acumulado = p_kilos
  WHERE id = p_order_id
    AND estado NOT IN ('entregado', 'cancelado');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found_or_not_editable';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_order_kilos_entregados_acumulado(uuid, numeric) IS
  'Solo actualiza kilos_entregados_acumulado. No recalcula ni altera total_sugerido ni precio_sugerido_por_kilo.';

GRANT EXECUTE ON FUNCTION public.set_order_kilos_entregados_acumulado(uuid, numeric) TO authenticated;
