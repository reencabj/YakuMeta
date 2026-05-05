-- =============================================================================
-- Modulo Lavado: configuracion, tandas y seguridad
-- =============================================================================

create table if not exists public.lavado_config (
  id smallint primary key default 1 check (id = 1),
  perdida_proceso_1 numeric(5, 4) not null default 0.10 check (perdida_proceso_1 >= 0 and perdida_proceso_1 <= 1),
  perdida_proceso_2 numeric(5, 4) not null default 0.10 check (perdida_proceso_2 >= 0 and perdida_proceso_2 <= 1),
  perdida_proceso_3 numeric(5, 4) not null default 0.10 check (perdida_proceso_3 >= 0 and perdida_proceso_3 <= 1),
  perdida_proceso_4 numeric(5, 4) not null default 0.00 check (perdida_proceso_4 >= 0 and perdida_proceso_4 <= 1),
  min_proceso_1 numeric(14, 2) not null default 1000 check (min_proceso_1 >= 0),
  max_proceso_1 numeric(14, 2) not null default 100000 check (max_proceso_1 > 0),
  min_proceso_2 numeric(14, 2) not null default 1000 check (min_proceso_2 >= 0),
  max_proceso_2 numeric(14, 2) not null default 20000 check (max_proceso_2 > 0),
  min_proceso_3 numeric(14, 2) not null default 1000 check (min_proceso_3 >= 0),
  max_proceso_3 numeric(14, 2) not null default 100000 check (max_proceso_3 > 0),
  min_proceso_4 numeric(14, 2) not null default 1000 check (min_proceso_4 >= 0),
  max_proceso_4 numeric(14, 2) not null default 20000 check (max_proceso_4 > 0),
  duracion_base_p1_minutos numeric(14, 4) not null default 116 check (duracion_base_p1_minutos > 0),
  duracion_base_p3_minutos numeric(14, 4) not null default 116 check (duracion_base_p3_minutos > 0),
  duracion_manual_p2_segundos integer not null default 30 check (duracion_manual_p2_segundos > 0),
  duracion_manual_p4_segundos integer not null default 30 check (duracion_manual_p4_segundos > 0),
  estaciones_p1 integer not null default 1 check (estaciones_p1 > 0),
  estaciones_p2 integer not null default 1 check (estaciones_p2 > 0),
  estaciones_p3 integer not null default 2 check (estaciones_p3 > 0),
  estaciones_p4 integer not null default 2 check (estaciones_p4 > 0),
  discord_webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint lavado_config_limits_ok check (
    min_proceso_1 <= max_proceso_1
    and min_proceso_2 <= max_proceso_2
    and min_proceso_3 <= max_proceso_3
    and min_proceso_4 <= max_proceso_4
  )
);

insert into public.lavado_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.lavado_tandas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles (id),
  proceso text not null check (proceso in ('imprimir', 'cortar', 'secar', 'contar')),
  monto_entrada numeric(14, 2) not null check (monto_entrada > 0),
  monto_salida_esperado numeric(14, 2) not null check (monto_salida_esperado >= 0),
  estacion integer not null check (estacion > 0),
  iniciado_at timestamptz not null default now(),
  finaliza_estimado_at timestamptz not null,
  estado text not null default 'activo' check (estado in ('activo', 'completado', 'cancelado')),
  finalizado_at timestamptz,
  webhook_locked_at timestamptz,
  webhook_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint lavado_tandas_finish_requires_state check (
    (estado = 'activo' and finalizado_at is null)
    or (estado in ('completado', 'cancelado') and finalizado_at is not null)
  )
);

create index if not exists idx_lavado_tandas_estado_finaliza
  on public.lavado_tandas (estado, finaliza_estimado_at);

create index if not exists idx_lavado_tandas_proceso_estacion_estado
  on public.lavado_tandas (proceso, estacion, estado);

create trigger trg_lavado_config_updated_at before update on public.lavado_config
for each row execute function public.set_updated_at();

create trigger trg_lavado_tandas_updated_at before update on public.lavado_tandas
for each row execute function public.set_updated_at();

alter table public.lavado_config enable row level security;
alter table public.lavado_tandas enable row level security;

create policy "lavado_config_select"
  on public.lavado_config for select to authenticated using (true);

create policy "lavado_config_insert_admin"
  on public.lavado_config for insert to authenticated with check (public.is_admin());

create policy "lavado_config_update_admin"
  on public.lavado_config for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "lavado_tandas_select"
  on public.lavado_tandas for select to authenticated using (true);

create policy "lavado_tandas_insert"
  on public.lavado_tandas for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "lavado_tandas_update_owner_or_admin"
  on public.lavado_tandas for update to authenticated
  using (usuario_id = auth.uid() or public.is_admin())
  with check (usuario_id = auth.uid() or public.is_admin());

grant select on public.lavado_config to authenticated;
grant select, insert, update on public.lavado_tandas to authenticated;
