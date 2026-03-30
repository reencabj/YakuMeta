-- =============================================================================
-- RP Meta Manager — Esquema inicial Supabase (Postgres)
-- Ejecutar en SQL Editor o supabase db push
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos enumerados (texto con CHECK para simplicidad en PostgREST)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

create index idx_profiles_role on public.profiles (role) where is_active = true;

-- -----------------------------------------------------------------------------
-- Configuración global (fila única)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'RP Meta Manager',
  currency text not null default 'ARS',
  dias_duracion_meta_por_defecto integer not null default 7 check (dias_duracion_meta_por_defecto > 0),
  kg_guardado_por_1kg_meta numeric(12, 4) not null default 120 check (kg_guardado_por_1kg_meta > 0),
  permitir_entrega_sin_stock boolean not null default true,
  precio_base_por_kilo numeric(14, 2),
  alerta_meta_dias_normal_hasta integer not null default 4,
  alerta_meta_dias_warning_hasta integer not null default 6,
  alerta_meta_dias_vencido_desde integer not null default 7,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

-- -----------------------------------------------------------------------------
-- Tipos de depósito
-- -----------------------------------------------------------------------------
create table public.storage_location_types (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  es_sistema boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

-- -----------------------------------------------------------------------------
-- Depósitos / lugares de guardado
-- -----------------------------------------------------------------------------
create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_id uuid not null references public.storage_location_types (id),
  dueno text,
  grupo_zona text,
  descripcion text,
  capacidad_guardado_kg numeric(14, 4) not null check (capacidad_guardado_kg >= 0),
  capacidad_meta_kilos numeric(14, 6) generated always as (capacidad_guardado_kg / 120) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

create index idx_storage_locations_tipo on public.storage_locations (tipo_id);
create index idx_storage_locations_active on public.storage_locations (is_active);

-- -----------------------------------------------------------------------------
-- Lotes de stock
-- -----------------------------------------------------------------------------
create table public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.storage_locations (id),
  cantidad_meta_kilos numeric(14, 4) not null check (cantidad_meta_kilos >= 0),
  equivalente_guardado_kg numeric(14, 4) generated always as (cantidad_meta_kilos * 120) stored,
  cantidad_reservada_meta_kilos numeric(14, 4) not null default 0 check (cantidad_reservada_meta_kilos >= 0),
  cantidad_disponible_meta_kilos numeric(14, 4) generated always as (cantidad_meta_kilos - cantidad_reservada_meta_kilos) stored,
  fecha_guardado date not null default (current_date),
  guardado_por_usuario_id uuid references public.profiles (id),
  fecha_vencimiento_estimada date,
  observaciones text,
  estado text not null default 'disponible' check (
    estado in (
      'disponible',
      'reservado_parcial',
      'reservado_total',
      'agotado',
      'vencido',
      'ajustado'
    )
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  constraint chk_reserva_lte_total check (cantidad_reservada_meta_kilos <= cantidad_meta_kilos)
);

create index idx_stock_batches_deposito on public.stock_batches (deposito_id);
create index idx_stock_batches_fecha on public.stock_batches (fecha_guardado);
create index idx_stock_batches_estado on public.stock_batches (estado);

-- -----------------------------------------------------------------------------
-- Movimientos de stock
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tipo_movimiento text not null check (
    tipo_movimiento in (
      'ingreso',
      'reserva',
      'liberacion_reserva',
      'egreso_entrega',
      'ajuste_admin',
      'correccion',
      'descarte',
      'produccion_directa_entrega'
    )
  ),
  lote_id uuid references public.stock_batches (id),
  deposito_id uuid references public.storage_locations (id),
  pedido_id uuid,
  cantidad_meta_kilos numeric(14, 4) not null,
  equivalente_guardado_kg numeric(14, 4) generated always as (cantidad_meta_kilos * 120) stored,
  usuario_id uuid not null references public.profiles (id),
  notas text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_stock_movements_tipo on public.stock_movements (tipo_movimiento);
create index idx_stock_movements_pedido on public.stock_movements (pedido_id);
create index idx_stock_movements_created on public.stock_movements (created_at desc);

-- FK pedido después de crear orders
-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null,
  cantidad_meta_kilos numeric(14, 4) not null check (cantidad_meta_kilos > 0),
  fecha_pedido date not null default (current_date),
  fecha_encargo date,
  creado_por_usuario_id uuid not null references public.profiles (id),
  estado text not null default 'pendiente' check (
    estado in (
      'pendiente',
      'reservado_parcial',
      'reservado_completo',
      'en_preparacion',
      'entregado',
      'cancelado'
    )
  ),
  notas text,
  prioridad smallint,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index idx_orders_estado_fecha on public.orders (estado, fecha_pedido);
create index idx_orders_creador on public.orders (creado_por_usuario_id);

alter table public.stock_movements
  add constraint fk_stock_movements_pedido foreign key (pedido_id) references public.orders (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Reservas pedido ↔ lote
-- -----------------------------------------------------------------------------
create table public.order_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  stock_batch_id uuid not null references public.stock_batches (id),
  deposito_id uuid not null references public.storage_locations (id),
  cantidad_meta_kilos numeric(14, 4) not null check (cantidad_meta_kilos > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);

create index idx_order_reservations_order on public.order_reservations (order_id);
create index idx_order_reservations_batch on public.order_reservations (stock_batch_id);

-- -----------------------------------------------------------------------------
-- Entregas
-- -----------------------------------------------------------------------------
create table public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  entregado_at timestamptz not null default now(),
  dinero_recibido numeric(14, 2) not null check (dinero_recibido >= 0),
  recibio_dinero_usuario_id uuid not null references public.profiles (id),
  produccion_directa_meta_kilos numeric(14, 4) not null default 0 check (produccion_directa_meta_kilos >= 0),
  notas text,
  es_correccion boolean not null default false,
  motivo_correccion text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);

create table public.order_delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.order_deliveries (id) on delete cascade,
  stock_batch_id uuid references public.stock_batches (id),
  deposito_id uuid references public.storage_locations (id),
  cantidad_meta_kilos numeric(14, 4) not null check (cantidad_meta_kilos > 0),
  origen_tipo text not null check (origen_tipo in ('stock', 'produccion_directa')),
  notas text
);

create index idx_order_deliveries_order on public.order_deliveries (order_id);

-- -----------------------------------------------------------------------------
-- Reglas de precios
-- -----------------------------------------------------------------------------
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cantidad_minima_kilos numeric(14, 4) not null check (cantidad_minima_kilos > 0),
  precio_por_kilo numeric(14, 2) not null check (precio_por_kilo >= 0),
  prioridad integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

create index idx_pricing_rules_active_prioridad on public.pricing_rules (is_active, prioridad desc);

-- -----------------------------------------------------------------------------
-- Auditoría
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  accion text not null,
  usuario_id uuid references public.profiles (id),
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  motivo text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on public.audit_logs (entity_type, created_at desc);
create index idx_audit_logs_user on public.audit_logs (usuario_id);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' and p.is_active
     from public.profiles p
     where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.jwt_uid()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_app_settings_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

create trigger trg_storage_location_types_updated_at before update on public.storage_location_types
for each row execute function public.set_updated_at();

create trigger trg_storage_locations_updated_at before update on public.storage_locations
for each row execute function public.set_updated_at();

create trigger trg_stock_batches_updated_at before update on public.stock_batches
for each row execute function public.set_updated_at();

create trigger trg_orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create trigger trg_pricing_rules_updated_at before update on public.pricing_rules
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Vista: resumen global de stock (MVP)
-- -----------------------------------------------------------------------------
create or replace view public.v_global_stock_summary as
select
  coalesce(sum(sb.cantidad_meta_kilos), 0)::numeric(18, 4) as total_meta_kilos,
  coalesce(sum(sb.cantidad_reservada_meta_kilos), 0)::numeric(18, 4) as total_reservado_kilos,
  coalesce(sum(sb.cantidad_meta_kilos - sb.cantidad_reservada_meta_kilos), 0)::numeric(18, 4) as total_libre_kilos
from public.stock_batches sb
where sb.is_active = true;

-- Pedidos pendientes: cantidad total pedida - reservado en order_reservations
create or replace view public.v_pending_orders_gap as
select
  o.id as order_id,
  o.cantidad_meta_kilos as pedido_kilos,
  coalesce(sum(r.cantidad_meta_kilos), 0)::numeric(18, 4) as reservado_kilos,
  (o.cantidad_meta_kilos - coalesce(sum(r.cantidad_meta_kilos), 0))::numeric(18, 4) as falta_producir_kilos
from public.orders o
left join public.order_reservations r on r.order_id = o.id
where o.estado in ('pendiente', 'reservado_parcial', 'reservado_completo', 'en_preparacion')
  and o.is_active = true
group by o.id, o.cantidad_meta_kilos;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.storage_location_types enable row level security;
alter table public.storage_locations enable row level security;
alter table public.stock_batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_reservations enable row level security;
alter table public.order_deliveries enable row level security;
alter table public.order_delivery_items enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.audit_logs enable row level security;

-- Lectura: usuarios autenticados ven perfiles activos + el propio
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (is_active = true or id = auth.uid());

-- Usuario puede actualizar su display_name (opcional) — MVP: solo admin edita perfiles
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Altas de auth.users disparan handle_new_user(); no insert manual desde cliente

-- app_settings: lectura todos, escritura admin
create policy "app_settings_select"
  on public.app_settings for select
  to authenticated
  using (true);

create policy "app_settings_write_admin"
  on public.app_settings for insert
  to authenticated
  with check (public.is_admin());

create policy "app_settings_update_admin"
  on public.app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Tipos y depósitos: lectura autenticados; escritura admin (MVP)
create policy "storage_location_types_select"
  on public.storage_location_types for select to authenticated using (true);

create policy "storage_location_types_write_admin"
  on public.storage_location_types for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "storage_locations_select"
  on public.storage_locations for select to authenticated using (true);

create policy "storage_locations_insert_admin"
  on public.storage_locations for insert
  to authenticated
  with check (public.is_admin());

create policy "storage_locations_update_admin"
  on public.storage_locations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Stock: usuarios operativos pueden leer/escribir; ajustes fuertes admin (MVP: todos autenticados insert/update en lotes activos)
create policy "stock_batches_select"
  on public.stock_batches for select to authenticated using (true);

create policy "stock_batches_insert"
  on public.stock_batches for insert
  to authenticated
  with check (true);

create policy "stock_batches_update"
  on public.stock_batches for update
  to authenticated
  using (true)
  with check (true);

create policy "stock_batches_delete"
  on public.stock_batches for delete
  to authenticated
  using (public.is_admin());

-- Movimientos: insert/select todos autenticados
create policy "stock_movements_select"
  on public.stock_movements for select to authenticated using (true);

create policy "stock_movements_insert"
  on public.stock_movements for insert
  to authenticated
  with check (usuario_id = auth.uid());

-- Pedidos
create policy "orders_select"
  on public.orders for select to authenticated using (true);

create policy "orders_insert"
  on public.orders for insert
  to authenticated
  with check (creado_por_usuario_id = auth.uid());

create policy "orders_update"
  on public.orders for update
  to authenticated
  using (
    estado <> 'entregado'
    or public.is_admin()
  )
  with check (
    estado <> 'entregado'
    or public.is_admin()
  );

create policy "orders_delete"
  on public.orders for delete
  to authenticated
  using (public.is_admin());

-- Reservas
create policy "order_reservations_select"
  on public.order_reservations for select
  to authenticated
  using (true);

create policy "order_reservations_insert"
  on public.order_reservations for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "order_reservations_update"
  on public.order_reservations for update
  to authenticated
  using (true)
  with check (true);

create policy "order_reservations_delete"
  on public.order_reservations for delete
  to authenticated
  using (true);

-- Entregas
create policy "order_deliveries_select"
  on public.order_deliveries for select to authenticated using (true);

create policy "order_deliveries_insert"
  on public.order_deliveries for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "order_deliveries_update"
  on public.order_deliveries for update
  to authenticated
  using (public.is_admin());

create policy "order_delivery_items_all"
  on public.order_delivery_items for all
  to authenticated
  using (true)
  with check (true);

-- Precios
create policy "pricing_rules_select"
  on public.pricing_rules for select to authenticated using (true);

create policy "pricing_rules_write"
  on public.pricing_rules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Auditoría: lectura todos; inserción por triggers/service
create policy "audit_logs_select"
  on public.audit_logs for select to authenticated using (true);

create policy "audit_logs_insert"
  on public.audit_logs for insert
  to authenticated
  with check (true);

-- -----------------------------------------------------------------------------
-- Grants vistas
-- -----------------------------------------------------------------------------
grant select on public.v_global_stock_summary to authenticated;
grant select on public.v_pending_orders_gap to authenticated;

-- -----------------------------------------------------------------------------
-- Seed: tipos sistema + settings + reglas ejemplo
-- -----------------------------------------------------------------------------
insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

insert into public.storage_location_types (nombre, slug, es_sistema, is_active)
values
  ('Casa', 'casa', true, true),
  ('Helicóptero', 'helicoptero', true, true),
  ('Vehículo', 'vehiculo', true, true),
  ('Laboratorio', 'laboratorio', true, true),
  ('Otro', 'otro', true, true)
on conflict (slug) do nothing;

insert into public.pricing_rules (nombre, cantidad_minima_kilos, precio_por_kilo, prioridad, is_active)
select v.nombre, v.cantidad_minima_kilos, v.precio_por_kilo, v.prioridad, true
from (
  values
    ('1 kg'::text, 1::numeric, 90000::numeric, 30),
    ('3+ kg', 3, 80000, 20),
    ('6+ kg', 6, 75000, 10)
) as v(nombre, cantidad_minima_kilos, precio_por_kilo, prioridad)
where not exists (
  select 1 from public.pricing_rules pr where pr.nombre = v.nombre
);

-- Nota: profiles se crean al registrar usuarios; primer admin vía SQL post-registro.

comment on table public.profiles is 'Perfiles de usuario; username único para login UX';
comment on table public.stock_batches is 'Lotes de meta con reserva y disponible generado';
comment on table public.order_delivery_items is 'Detalle de entrega: stock o producción directa';

-- -----------------------------------------------------------------------------
-- Registro automático de perfil al crear usuario en auth
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    'user'
  );
  return new;
end;
$$;

-- En proyectos Supabase nuevos el trigger suele llamarse on_auth_user_created
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
