-- =============================================================================
-- Pedidos Lavado: columnas Discord agregadas incrementalmente
-- =============================================================================
-- Esta migración cubre bases donde 20260507092000_lavado_pedidos.sql
-- ya se aplicó antes de agregar la configuración de webhooks.

alter table public.lavado_pedidos_config
  add column if not exists discord_webhook_url text,
  add column if not exists discord_entrega_role_id text not null default '1501920920783290378';

alter table public.lavado_pedidos
  add column if not exists webhook_creado_notified_at timestamptz,
  add column if not exists webhook_completado_notified_at timestamptz,
  add column if not exists webhook_entrega_hoy_notified_at timestamptz,
  add column if not exists webhook_locked_at timestamptz;

-- Pide a PostgREST/Supabase recargar el schema cache después del DDL.
notify pgrst, 'reload schema';
