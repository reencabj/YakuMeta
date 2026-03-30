-- =============================================================================
-- Grupos de depósitos, metadata de ingreso en lotes, RPC register_stock_intake
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stock_batches: metadata JSON (composición bolsas, modo de ingreso, etc.)
-- -----------------------------------------------------------------------------
alter table public.stock_batches
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_stock_batches_metadata on public.stock_batches using gin (metadata);

comment on column public.stock_batches.metadata is 'Opcional: modo_ingreso, packs_de_3, bolsas_individuales, total_bolsas, etc.';

-- -----------------------------------------------------------------------------
-- storage_groups: unidad lógica de almacenamiento
-- -----------------------------------------------------------------------------
create table public.storage_groups (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

create index idx_storage_groups_activo on public.storage_groups (activo);

create trigger trg_storage_groups_updated_at
  before update on public.storage_groups
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- storage_group_members: depósitos por grupo (un depósito = una fila como máximo)
-- -----------------------------------------------------------------------------
create table public.storage_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.storage_groups (id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations (id) on delete cascade,
  orden integer check (orden is null or orden >= 0),
  created_at timestamptz not null default now(),
  constraint uq_storage_group_members_location unique (storage_location_id)
);

create index idx_storage_group_members_group on public.storage_group_members (group_id);
create index idx_storage_group_members_location on public.storage_group_members (storage_location_id);

comment on table public.storage_groups is 'Agrupa depósitos como unidad operativa para métricas y futura recomendación de pedidos';
comment on table public.storage_group_members is 'Miembros de un grupo; un depósito solo puede estar en un grupo (MVP)';

-- -----------------------------------------------------------------------------
-- Vista: métricas agregadas por grupo
-- -----------------------------------------------------------------------------
create or replace view public.v_storage_group_metrics as
with loc_totals as (
  select
    sb.deposito_id,
    coalesce(sum(sb.cantidad_meta_kilos) filter (where sb.is_active), 0)::numeric(18, 4) as stock_meta,
    coalesce(sum(sb.cantidad_reservada_meta_kilos) filter (where sb.is_active), 0)::numeric(18, 4) as stock_reservado
  from public.stock_batches sb
  group by sb.deposito_id
)
select
  sg.id as group_id,
  sg.nombre,
  sg.descripcion,
  sg.activo,
  coalesce(sum(sl.capacidad_guardado_kg), 0)::numeric(18, 4) as capacidad_guardado_total,
  coalesce(sum(sl.capacidad_meta_kilos), 0)::numeric(18, 6) as capacidad_meta_total,
  coalesce(sum(lt.stock_meta), 0)::numeric(18, 4) as stock_total,
  coalesce(sum(lt.stock_reservado), 0)::numeric(18, 4) as stock_reservado,
  coalesce(sum(lt.stock_meta - lt.stock_reservado), 0)::numeric(18, 4) as stock_libre,
  case
    when coalesce(sum(sl.capacidad_meta_kilos), 0) > 0 then
      (coalesce(sum(lt.stock_meta), 0) / nullif(sum(sl.capacidad_meta_kilos), 0)) * 100
    else 0::numeric
  end::numeric(18, 4) as porcentaje_ocupacion
from public.storage_groups sg
left join public.storage_group_members sgm on sgm.group_id = sg.id
left join public.storage_locations sl on sl.id = sgm.storage_location_id
left join loc_totals lt on lt.deposito_id = sl.id
group by sg.id, sg.nombre, sg.descripcion, sg.activo;

comment on view public.v_storage_group_metrics is 'Capacidad y stock agregados por grupo de depósitos';

-- -----------------------------------------------------------------------------
-- Función para fase Pedidos: grupos con stock libre suficiente (orden sugerido)
-- -----------------------------------------------------------------------------
create or replace function public.recommend_storage_groups_for_meta(p_cantidad_meta_kilos numeric)
returns table (
  group_id uuid,
  nombre text,
  descripcion text,
  activo boolean,
  capacidad_guardado_total numeric,
  capacidad_meta_total numeric,
  stock_total numeric,
  stock_reservado numeric,
  stock_libre numeric,
  porcentaje_ocupacion numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.group_id,
    v.nombre,
    v.descripcion,
    v.activo,
    v.capacidad_guardado_total,
    v.capacidad_meta_total,
    v.stock_total,
    v.stock_reservado,
    v.stock_libre,
    v.porcentaje_ocupacion
  from public.v_storage_group_metrics v
  where v.activo = true
    and v.stock_libre >= p_cantidad_meta_kilos
  order by v.porcentaje_ocupacion asc, v.stock_libre desc, v.nombre asc;
$$;

comment on function public.recommend_storage_groups_for_meta(numeric) is
  'Grupos activos con stock_libre >= cantidad pedida; orden para recomendación futura en pedidos';

grant select on public.v_storage_group_metrics to authenticated;
grant execute on function public.recommend_storage_groups_for_meta(numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS storage_groups / storage_group_members
-- -----------------------------------------------------------------------------
alter table public.storage_groups enable row level security;
alter table public.storage_group_members enable row level security;

create policy "storage_groups_select"
  on public.storage_groups for select
  to authenticated
  using (true);

create policy "storage_groups_write_admin"
  on public.storage_groups for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "storage_group_members_select"
  on public.storage_group_members for select
  to authenticated
  using (true);

create policy "storage_group_members_write_admin"
  on public.storage_group_members for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- RPC register_stock_intake: añade p_metadata opcional
-- -----------------------------------------------------------------------------
drop function if exists public.register_stock_intake(uuid, numeric, date, text);

create or replace function public.register_stock_intake(
  p_deposito_id uuid,
  p_cantidad_meta_kilos numeric,
  p_fecha_guardado date,
  p_observaciones text,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_dias integer;
  v_venc date;
  v_meta jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_cantidad_meta_kilos is null or p_cantidad_meta_kilos <= 0 then
    raise exception 'invalid_quantity';
  end if;

  if not exists (
    select 1 from public.storage_locations sl
    where sl.id = p_deposito_id and sl.is_active = true
  ) then
    raise exception 'deposit_not_found_or_inactive';
  end if;

  select dias_duracion_meta_por_defecto into v_dias
  from public.app_settings where id = 1;

  v_dias := coalesce(v_dias, 7);
  v_venc := p_fecha_guardado + v_dias;
  v_meta := case
    when p_metadata is null or p_metadata = 'null'::jsonb then '{}'::jsonb
    else p_metadata
  end;

  insert into public.stock_batches (
    deposito_id,
    cantidad_meta_kilos,
    fecha_guardado,
    guardado_por_usuario_id,
    fecha_vencimiento_estimada,
    observaciones,
    created_by,
    estado,
    metadata
  )
  values (
    p_deposito_id,
    p_cantidad_meta_kilos,
    p_fecha_guardado,
    v_uid,
    v_venc,
    nullif(trim(p_observaciones), ''),
    v_uid,
    'disponible',
    v_meta
  )
  returning id into v_batch_id;

  insert into public.stock_movements (
    tipo_movimiento,
    lote_id,
    deposito_id,
    cantidad_meta_kilos,
    usuario_id,
    notas,
    metadata
  )
  values (
    'ingreso',
    v_batch_id,
    p_deposito_id,
    p_cantidad_meta_kilos,
    v_uid,
    nullif(trim(p_observaciones), ''),
    case when v_meta = '{}'::jsonb then null else jsonb_build_object('intake', v_meta) end
  );

  return v_batch_id;
end;
$$;

grant execute on function public.register_stock_intake(uuid, numeric, date, text, jsonb) to authenticated;

comment on function public.register_stock_intake(uuid, numeric, date, text, jsonb) is
  'Crea lote y movimiento ingreso; metadata opcional (composición bolsas, modo ingreso)';
