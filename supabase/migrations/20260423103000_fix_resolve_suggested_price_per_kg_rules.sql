-- =============================================================================
-- Pricing sugerido: volver a resolver por reglas activas + precio base
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_suggested_price_per_kg(p_cantidad_meta_kilos numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT pr.precio_por_kilo
      FROM public.pricing_rules pr
      WHERE pr.is_active
        AND pr.cantidad_minima_kilos <= p_cantidad_meta_kilos
      ORDER BY pr.cantidad_minima_kilos DESC, pr.prioridad DESC
      LIMIT 1
    ),
    (
      SELECT s.precio_base_por_kilo
      FROM public.app_settings s
      WHERE s.id = 1
      LIMIT 1
    ),
    0::numeric
  );
$$;

COMMENT ON FUNCTION public.resolve_suggested_price_per_kg(numeric) IS
  'Precio sugerido por kg: regla activa con mayor mínimo de kg aplicable (y mayor prioridad en empate); fallback a app_settings.precio_base_por_kilo; fallback final 0.';
