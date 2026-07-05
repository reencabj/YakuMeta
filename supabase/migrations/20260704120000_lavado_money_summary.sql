-- Totales de dinero lavado: entrada en imprimir, salida en secar (pipeline con % por proceso).
-- DROP necesario si la vista ya existía con otras columnas (CREATE OR REPLACE no renombra columnas).

drop view if exists public.v_lavado_money_by_almacen;
drop view if exists public.v_lavado_money_totals;

create view public.v_lavado_money_totals as
select
  coalesce(sum(monto_entrada) filter (where estado = 'completado' and proceso = 'imprimir'), 0)::numeric(18, 2) as ingresado_completado,
  coalesce(sum(monto_salida_esperado) filter (where estado = 'completado' and proceso = 'secar'), 0)::numeric(18, 2) as salida_completado,
  coalesce(sum(monto_entrada) filter (where estado = 'activo' and proceso = 'imprimir'), 0)::numeric(18, 2) as ingresado_activo,
  coalesce(sum(monto_salida_esperado) filter (where estado = 'activo' and proceso = 'secar'), 0)::numeric(18, 2) as salida_activo,
  count(*) filter (where estado = 'completado' and proceso = 'imprimir')::bigint as tandas_imprimir_completadas,
  count(*) filter (where estado = 'completado' and proceso = 'secar')::bigint as tandas_secar_completadas,
  count(*) filter (where estado = 'activo' and proceso = 'imprimir')::bigint as tandas_imprimir_activas,
  count(*) filter (where estado = 'activo' and proceso = 'secar')::bigint as tandas_secar_activas
from public.lavado_tandas;

create view public.v_lavado_money_by_almacen as
select
  almacen,
  coalesce(sum(monto_entrada) filter (where estado = 'completado' and proceso = 'imprimir'), 0)::numeric(18, 2) as ingresado_completado,
  coalesce(sum(monto_salida_esperado) filter (where estado = 'completado' and proceso = 'secar'), 0)::numeric(18, 2) as salida_completado,
  count(*) filter (where estado = 'completado' and proceso = 'imprimir')::bigint as tandas_imprimir_completadas,
  count(*) filter (where estado = 'completado' and proceso = 'secar')::bigint as tandas_secar_completadas,
  coalesce(sum(monto_entrada) filter (where estado = 'activo' and proceso = 'imprimir'), 0)::numeric(18, 2) as ingresado_activo,
  coalesce(sum(monto_salida_esperado) filter (where estado = 'activo' and proceso = 'secar'), 0)::numeric(18, 2) as salida_activo
from public.lavado_tandas
group by almacen;

grant select on public.v_lavado_money_totals to authenticated;
grant select on public.v_lavado_money_by_almacen to authenticated;

comment on view public.v_lavado_money_totals is 'Dinero ingresado en imprimir y sacado en secar (tandas completadas/activas)';
comment on view public.v_lavado_money_by_almacen is 'Totales de imprimir/secar por almacén';
