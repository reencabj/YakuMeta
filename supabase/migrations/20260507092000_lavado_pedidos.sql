-- =============================================================================
-- Pedidos Lavado: reemplazo operativo del Excel de pedidos de lavado
-- =============================================================================

create table if not exists public.lavado_pedidos_config (
  id smallint primary key default 1 check (id = 1),
  comision_instantaneo numeric(5, 4) not null default 0.40 check (comision_instantaneo >= 0 and comision_instantaneo <= 1),
  comision_7_dias numeric(5, 4) not null default 0.33 check (comision_7_dias >= 0 and comision_7_dias <= 1),
  script_porcentaje numeric(5, 4) not null default 0.27 check (script_porcentaje >= 0 and script_porcentaje <= 1),
  dias_entrega_plazo integer not null default 7 check (dias_entrega_plazo >= 0),
  discord_webhook_url text,
  discord_entrega_role_id text not null default '1501920920783290378',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.lavado_pedidos_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.lavado_pedidos (
  id uuid primary key default gen_random_uuid(),
  org_persona text not null,
  monto numeric(14, 2) not null check (monto > 0),
  tipo_pago text not null check (tipo_pago in ('instantaneo', 'plazo_7_dias')),
  comision_pct numeric(5, 4) not null check (comision_pct >= 0 and comision_pct <= 1),
  script_pct numeric(5, 4) not null check (script_pct >= 0 and script_pct <= 1),
  monto_entregar numeric(14, 2) not null check (monto_entregar >= 0),
  descuento_total numeric(14, 2) not null check (descuento_total >= 0),
  perdida_script numeric(14, 2) not null check (perdida_script >= 0),
  ganancia_real_banda numeric(14, 2) not null,
  fecha_creacion timestamptz not null default now(),
  fecha_entrega date,
  estado text not null check (
    estado in (
      'recibido',
      'dinero_recibido',
      'dinero_entregado',
      'en_espera',
      'listo_para_entregar',
      'completado',
      'cancelado'
    )
  ),
  creado_por_usuario_id uuid not null references public.profiles (id),
  completado_por_usuario_id uuid references public.profiles (id),
  completado_at timestamptz,
  cancelado_at timestamptz,
  webhook_creado_notified_at timestamptz,
  webhook_completado_notified_at timestamptz,
  webhook_entrega_hoy_notified_at timestamptz,
  webhook_locked_at timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint lavado_pedidos_org_not_blank check (length(btrim(org_persona)) > 0),
  constraint lavado_pedidos_finish_state_ok check (
    (estado = 'completado' and completado_at is not null)
    or (estado <> 'completado' and completado_at is null)
  ),
  constraint lavado_pedidos_cancel_state_ok check (
    (estado = 'cancelado' and cancelado_at is not null)
    or (estado <> 'cancelado' and cancelado_at is null)
  )
);

create index if not exists idx_lavado_pedidos_estado_entrega
  on public.lavado_pedidos (estado, fecha_entrega);

create index if not exists idx_lavado_pedidos_tipo_estado
  on public.lavado_pedidos (tipo_pago, estado);

create index if not exists idx_lavado_pedidos_creacion
  on public.lavado_pedidos (fecha_creacion desc);

drop trigger if exists trg_lavado_pedidos_config_updated_at on public.lavado_pedidos_config;
create trigger trg_lavado_pedidos_config_updated_at before update on public.lavado_pedidos_config
for each row execute function public.set_updated_at();

drop trigger if exists trg_lavado_pedidos_updated_at on public.lavado_pedidos;
create trigger trg_lavado_pedidos_updated_at before update on public.lavado_pedidos
for each row execute function public.set_updated_at();

alter table public.lavado_pedidos_config enable row level security;
alter table public.lavado_pedidos enable row level security;

drop policy if exists "lavado_pedidos_config_select" on public.lavado_pedidos_config;
create policy "lavado_pedidos_config_select"
  on public.lavado_pedidos_config for select
  to authenticated
  using (true);

drop policy if exists "lavado_pedidos_config_update_admin" on public.lavado_pedidos_config;
create policy "lavado_pedidos_config_update_admin"
  on public.lavado_pedidos_config for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "lavado_pedidos_select_staff" on public.lavado_pedidos;
create policy "lavado_pedidos_select_staff"
  on public.lavado_pedidos for select
  to authenticated
  using (public.can_view_all_orders());

drop policy if exists "lavado_pedidos_insert_staff" on public.lavado_pedidos;
create policy "lavado_pedidos_insert_staff"
  on public.lavado_pedidos for insert
  to authenticated
  with check (
    public.can_view_all_orders()
    and creado_por_usuario_id = auth.uid()
  );

drop policy if exists "lavado_pedidos_update_staff" on public.lavado_pedidos;
create policy "lavado_pedidos_update_staff"
  on public.lavado_pedidos for update
  to authenticated
  using (public.can_view_all_orders())
  with check (public.can_view_all_orders());

grant select on public.lavado_pedidos_config to authenticated;
grant select, insert, update on public.lavado_pedidos to authenticated;
