-- Almacenes de lavado: Liquid (existente) y Growshop.
-- Cada tanda activa ocupa un slot único: almacen + proceso + estación.

alter table public.lavado_tandas
  add column if not exists almacen text not null default 'liquid'
  check (almacen in ('liquid', 'growshop'));

comment on column public.lavado_tandas.almacen is
  'Almacén físico de lavado: liquid | growshop';

drop index if exists idx_lavado_tandas_proceso_estacion_estado;

create index if not exists idx_lavado_tandas_almacen_proceso_estacion_estado
  on public.lavado_tandas (almacen, proceso, estacion, estado);

create unique index if not exists idx_lavado_tandas_active_slot_unique
  on public.lavado_tandas (almacen, proceso, estacion)
  where estado = 'activo';
