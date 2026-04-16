-- =============================================================================
-- v_pedidos_kpis: tiradas_faltantes (misma regla que la UI: ceil(falta_kg * 50 / 30))
-- Debe coincidir con src/lib/meta-bags.ts (BOLSAS_PER_KG_META=50, BOLSAS_POR_TIRADA=30)
-- =============================================================================

CREATE OR REPLACE VIEW public.v_pedidos_kpis AS
WITH base AS (
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
    ) AS total_stock_disponible_kg
)
SELECT
  total_pedidos_abiertos_kg,
  pedidos_abiertos_count,
  total_stock_disponible_kg,
  greatest(
    0::numeric,
    total_pedidos_abiertos_kg - total_stock_disponible_kg
  )::numeric(18, 4) AS faltante_preparar_kg,
  ceil(
    greatest(
      0::numeric,
      total_pedidos_abiertos_kg - total_stock_disponible_kg
    ) * 50.0 / 30.0
  )::integer AS tiradas_faltantes
FROM base;

COMMENT ON VIEW public.v_pedidos_kpis IS
  'Pedidos abiertos vs stock libre global; faltante_preparar = max(0, suma_kg_abiertos - libre); tiradas_faltantes = ceil(falta * 50 / 30) bolsas/tirada.';

GRANT SELECT ON public.v_pedidos_kpis TO authenticated;

-- Payload a notify-discord: KPI post-INSERT desde la misma vista que la UI
CREATE OR REPLACE FUNCTION public.trg_orders_notify_discord_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  v_url text;
  v_jwt text;
  v_body jsonb;
  kpi record;
BEGIN
  SELECT max(ds.decrypted_secret) FILTER (WHERE ds.name = 'notify_discord_invoker_url'),
         max(ds.decrypted_secret) FILTER (WHERE ds.name = 'notify_discord_invoker_jwt')
    INTO v_url, v_jwt
  FROM vault.decrypted_secrets ds
  WHERE ds.name IN ('notify_discord_invoker_url', 'notify_discord_invoker_jwt');

  IF v_url IS NULL OR v_jwt IS NULL OR length(trim(v_url)) = 0 OR length(trim(v_jwt)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO kpi FROM public.v_pedidos_kpis LIMIT 1;

  v_body := jsonb_build_object(
    'tipo_evento', 'nuevo_pedido',
    'cliente', NEW.cliente_nombre,
    'kilos', NEW.cantidad_meta_kilos,
    'origen_pedido', NEW.origen_pedido,
    'pedidos_abiertos_kg', kpi.total_pedidos_abiertos_kg,
    'stock_disponible_kg', kpi.total_stock_disponible_kg,
    'tiradas_faltantes', kpi.tiradas_faltantes
  );

  PERFORM net.http_post(
    url := trim(v_url),
    body := v_body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_jwt)
    ),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'trg_orders_notify_discord_new_order: %', SQLERRM;
    RETURN NEW;
END;
$$;
