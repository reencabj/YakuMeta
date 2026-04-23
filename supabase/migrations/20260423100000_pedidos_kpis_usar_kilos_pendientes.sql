-- =============================================================================
-- KPIs de pedidos: usar kilos pendientes (meta - entregado acumulado)
-- =============================================================================

CREATE OR REPLACE VIEW public.v_pedidos_kpis AS
WITH base AS (
  SELECT
    (
      SELECT coalesce(
        sum(
          greatest(
            0::numeric,
            o.cantidad_meta_kilos - coalesce(o.kilos_entregados_acumulado, 0::numeric)
          )
        ),
        0
      )::numeric(18, 4)
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
  'Pedidos abiertos vs stock libre global; kg abiertos = suma max(meta - entregado_acumulado, 0); faltante_preparar = max(0, abiertos - libre); tiradas_faltantes = ceil(falta * 50 / 30).';

GRANT SELECT ON public.v_pedidos_kpis TO authenticated;

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
    sum(
      greatest(
        0::numeric,
        o.cantidad_meta_kilos - coalesce(o.kilos_entregados_acumulado, 0::numeric)
      )
    ) OVER (
      ORDER BY o.fecha_pedido ASC, o.created_at ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cum_kg
  FROM public.orders o
  WHERE o.is_active = true
    AND o.estado IN ('pendiente', 'en_preparacion')
) AS x;

COMMENT ON VIEW public.v_open_orders_cobertura IS
  'Suma acumulada FIFO de kg pendientes por pedido (max(meta - entregado_acumulado, 0)) vs stock libre; alcanza_fifo si el acumulado cabe en libre.';

GRANT SELECT ON public.v_open_orders_cobertura TO authenticated;
