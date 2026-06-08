-- Métricas de stock por depósito (server-side).
-- Evita truncar en el cliente: PostgREST devuelve como máximo 1000 filas por defecto,
-- lo que podía hacer que v_global_stock_summary (SUM en SQL) coincidiera con el total
-- pero los depósitos individuales quedaran desactualizados o en 0.

create or replace view public.v_deposit_stock_metrics as
select
  sb.deposito_id,
  coalesce(sum(sb.cantidad_meta_kilos), 0)::numeric(18, 4) as total_meta_kg,
  coalesce(sum(sb.cantidad_reservada_meta_kilos), 0)::numeric(18, 4) as reservado_meta_kg,
  coalesce(sum(sb.cantidad_meta_kilos - sb.cantidad_reservada_meta_kilos), 0)::numeric(18, 4) as libre_meta_kg,
  min(sb.fecha_guardado) as oldest_batch_date,
  min(sb.fecha_vencimiento_estimada) filter (where sb.fecha_vencimiento_estimada is not null) as nearest_expiry
from public.stock_batches sb
where sb.is_active = true
group by sb.deposito_id;

comment on view public.v_deposit_stock_metrics is
  'Stock activo agregado por depósito (totales, reservado, libre, fechas)';

grant select on public.v_deposit_stock_metrics to authenticated;
