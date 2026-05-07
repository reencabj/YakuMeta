-- =============================================================================
-- Clientes VIP + tipo de pago para pricing sugerido de pedidos
-- =============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user', 'cliente', 'cliente_vip'));

comment on constraint profiles_role_check on public.profiles is
  'Roles: admin/user internos; cliente/cliente_vip solo portal de clientes.';

alter table public.pricing_rules
  add column if not exists tipo_cliente text not null default 'normal'
    check (tipo_cliente in ('normal', 'vip')),
  add column if not exists tipo_pago text not null default 'blanco'
    check (tipo_pago in ('blanco', 'negro'));

comment on column public.pricing_rules.tipo_cliente is 'Rango de cliente al que aplica la regla: normal o vip.';
comment on column public.pricing_rules.tipo_pago is 'Tipo de pago al que aplica la regla: blanco o negro.';

create index if not exists idx_pricing_rules_lookup
  on public.pricing_rules (tipo_cliente, tipo_pago, is_active, cantidad_minima_kilos desc, prioridad desc);

create table if not exists public.vip_clients (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  notas text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  constraint vip_clients_nombre_not_blank check (length(btrim(nombre)) > 0)
);

create unique index if not exists uq_vip_clients_nombre_active
  on public.vip_clients (lower(btrim(nombre)))
  where is_active = true;

create index if not exists idx_vip_clients_active_nombre
  on public.vip_clients (is_active, nombre);

drop trigger if exists trg_vip_clients_updated_at on public.vip_clients;
create trigger trg_vip_clients_updated_at before update on public.vip_clients
for each row execute function public.set_updated_at();

alter table public.vip_clients enable row level security;

drop policy if exists "vip_clients_select" on public.vip_clients;
create policy "vip_clients_select"
  on public.vip_clients for select
  to authenticated
  using (true);

drop policy if exists "vip_clients_insert_staff" on public.vip_clients;
create policy "vip_clients_insert_staff"
  on public.vip_clients for insert
  to authenticated
  with check (public.can_view_all_orders());

drop policy if exists "vip_clients_update_staff" on public.vip_clients;
create policy "vip_clients_update_staff"
  on public.vip_clients for update
  to authenticated
  using (public.can_view_all_orders())
  with check (public.can_view_all_orders());

drop policy if exists "vip_clients_delete_admin" on public.vip_clients;
create policy "vip_clients_delete_admin"
  on public.vip_clients for delete
  to authenticated
  using (public.is_admin());

alter table public.orders
  add column if not exists tipo_cliente text not null default 'normal'
    check (tipo_cliente in ('normal', 'vip')),
  add column if not exists tipo_pago text not null default 'blanco'
    check (tipo_pago in ('blanco', 'negro')),
  add column if not exists vip_client_id uuid references public.vip_clients (id) on delete set null;

comment on column public.orders.tipo_cliente is 'Snapshot del rango de cliente usado al crear/cotizar el pedido.';
comment on column public.orders.tipo_pago is 'Snapshot del tipo de pago usado al crear/cotizar el pedido.';
comment on column public.orders.vip_client_id is 'Cliente VIP seleccionado al alta, si aplica; el nombre queda snapshot en cliente_nombre.';

create index if not exists idx_orders_tipo_cliente_pago
  on public.orders (tipo_cliente, tipo_pago);

update public.pricing_rules
set is_active = false
where nombre in ('1 kg', '3+ kg', '6+ kg')
  and tipo_cliente = 'normal'
  and tipo_pago = 'blanco';

insert into public.pricing_rules (nombre, cantidad_minima_kilos, precio_por_kilo, prioridad, tipo_cliente, tipo_pago, is_active)
select v.nombre, v.cantidad_minima_kilos, v.precio_por_kilo, v.prioridad, v.tipo_cliente, v.tipo_pago, true
from (
  values
    ('Normal blanco 1+ kg'::text, 1::numeric, 100000::numeric, 100, 'normal'::text, 'blanco'::text),
    ('Normal blanco 3+ kg', 3, 95000, 100, 'normal', 'blanco'),
    ('Normal blanco 6+ kg', 6, 85000, 100, 'normal', 'blanco'),
    ('Normal negro 1+ kg', 1, 140000, 100, 'normal', 'negro'),
    ('Normal negro 3+ kg', 3, 130000, 100, 'normal', 'negro'),
    ('Normal negro 6+ kg', 6, 120000, 100, 'normal', 'negro'),
    ('VIP blanco 1+ kg', 1, 90000, 100, 'vip', 'blanco'),
    ('VIP blanco 3+ kg', 3, 85000, 100, 'vip', 'blanco'),
    ('VIP blanco 6+ kg', 6, 75000, 100, 'vip', 'blanco'),
    ('VIP negro 1+ kg', 1, 125000, 100, 'vip', 'negro'),
    ('VIP negro 3+ kg', 3, 115000, 100, 'vip', 'negro'),
    ('VIP negro 6+ kg', 6, 105000, 100, 'vip', 'negro')
) as v(nombre, cantidad_minima_kilos, precio_por_kilo, prioridad, tipo_cliente, tipo_pago)
where not exists (
  select 1
  from public.pricing_rules pr
  where pr.nombre = v.nombre
);

drop function if exists public.create_order(text, numeric, date, date, text, text);
drop function if exists public.resolve_suggested_price_per_kg(numeric);

create or replace function public.resolve_suggested_price_per_kg(
  p_cantidad_meta_kilos numeric,
  p_tipo_cliente text default 'normal',
  p_tipo_pago text default 'blanco'
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (
      select pr.precio_por_kilo
      from public.pricing_rules pr
      where pr.is_active
        and pr.tipo_cliente = coalesce(nullif(btrim(p_tipo_cliente), ''), 'normal')
        and pr.tipo_pago = coalesce(nullif(btrim(p_tipo_pago), ''), 'blanco')
        and pr.cantidad_minima_kilos <= p_cantidad_meta_kilos
      order by pr.cantidad_minima_kilos desc, pr.prioridad desc
      limit 1
    ),
    (
      select s.precio_base_por_kilo
      from public.app_settings s
      where s.id = 1
      limit 1
    ),
    0::numeric
  );
$$;

comment on function public.resolve_suggested_price_per_kg(numeric, text, text) is
  'Precio sugerido por kg filtrando por tipo_cliente + tipo_pago; fallback a app_settings.precio_base_por_kilo y luego 0.';

create or replace function public.create_order(
  p_cliente_nombre text,
  p_cantidad_meta_kilos numeric,
  p_fecha_pedido date,
  p_fecha_encargo date,
  p_notas text,
  p_origen_pedido text default 'admin',
  p_tipo_cliente text default 'normal',
  p_tipo_pago text default 'blanco',
  p_vip_client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_precio numeric;
  v_total numeric;
  v_origen text := coalesce(nullif(btrim(p_origen_pedido), ''), 'admin');
  v_tipo_cliente text := coalesce(nullif(btrim(p_tipo_cliente), ''), 'normal');
  v_tipo_pago text := coalesce(nullif(btrim(p_tipo_pago), ''), 'blanco');
  v_cliente_nombre text := nullif(btrim(p_cliente_nombre), '');
  v_vip_nombre text;
  v_user_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_cantidad_meta_kilos is null or p_cantidad_meta_kilos <= 0 then
    raise exception 'invalid_quantity';
  end if;
  if v_origen not in ('admin', 'portal_clientes') then
    raise exception 'invalid_origen_pedido';
  end if;
  if v_tipo_cliente not in ('normal', 'vip') then
    raise exception 'invalid_tipo_cliente';
  end if;
  if v_tipo_pago not in ('blanco', 'negro') then
    raise exception 'invalid_tipo_pago';
  end if;

  select p.role
  into v_user_role
  from public.profiles p
  where p.id = v_uid
    and p.is_active;

  if v_origen = 'portal_clientes' and v_user_role = 'cliente_vip' then
    v_tipo_cliente := 'vip';
  end if;

  if p_vip_client_id is not null then
    select vc.nombre
    into v_vip_nombre
    from public.vip_clients vc
    where vc.id = p_vip_client_id
      and vc.is_active;

    if not found then
      raise exception 'vip_client_not_found';
    end if;

    v_tipo_cliente := 'vip';
    v_cliente_nombre := coalesce(v_cliente_nombre, v_vip_nombre);
  end if;

  if v_cliente_nombre is null then
    raise exception 'cliente_required';
  end if;

  v_precio := public.resolve_suggested_price_per_kg(p_cantidad_meta_kilos, v_tipo_cliente, v_tipo_pago);
  v_total := round(p_cantidad_meta_kilos * coalesce(v_precio, 0), 2);

  insert into public.orders (
    id,
    cliente_nombre,
    cantidad_meta_kilos,
    fecha_pedido,
    fecha_encargo,
    creado_por_usuario_id,
    estado,
    notas,
    precio_sugerido_por_kilo,
    total_sugerido,
    origen_pedido,
    tipo_cliente,
    tipo_pago,
    vip_client_id
  )
  values (
    v_id,
    v_cliente_nombre,
    p_cantidad_meta_kilos,
    coalesce(p_fecha_pedido, current_date),
    p_fecha_encargo,
    v_uid,
    'pendiente',
    nullif(btrim(p_notas), ''),
    v_precio,
    v_total,
    v_origen,
    v_tipo_cliente,
    v_tipo_pago,
    case when v_tipo_cliente = 'vip' then p_vip_client_id else null end
  );

  insert into public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
  values (
    'order',
    v_id,
    'crear_pedido',
    v_uid,
    jsonb_build_object(
      'cliente_nombre', v_cliente_nombre,
      'cantidad_meta_kilos', p_cantidad_meta_kilos,
      'precio_sugerido_por_kilo', v_precio,
      'total_sugerido', v_total,
      'origen_pedido', v_origen,
      'tipo_cliente', v_tipo_cliente,
      'tipo_pago', v_tipo_pago,
      'vip_client_id', p_vip_client_id
    ),
    jsonb_build_object('fecha_pedido', p_fecha_pedido, 'fecha_encargo', p_fecha_encargo)
  );

  return v_id;
end;
$$;

grant execute on function public.resolve_suggested_price_per_kg(numeric, text, text) to authenticated;
grant execute on function public.create_order(text, numeric, date, date, text, text, text, text, uuid) to authenticated;
