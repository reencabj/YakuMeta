-- Tramos fijos de precio sugerido por kg (debe coincidir con src/lib/order-pricing.ts)
CREATE OR REPLACE FUNCTION public.resolve_suggested_price_per_kg(p_cantidad_meta_kilos numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (
    CASE
      WHEN p_cantidad_meta_kilos >= 6 THEN 75000::numeric
      WHEN p_cantidad_meta_kilos >= 3 THEN 80000::numeric
      ELSE 90000::numeric
    END
  );
$$;

COMMENT ON FUNCTION public.resolve_suggested_price_per_kg(numeric) IS
  'Precio ARS/kg: <3 kg → 90000; ≥3 y <6 → 80000; ≥6 → 75000';
