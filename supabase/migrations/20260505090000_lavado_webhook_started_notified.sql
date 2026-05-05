-- Notificacion webhook al iniciar tanda (evita reenvios)
alter table public.lavado_tandas
  add column if not exists webhook_started_notified_at timestamptz;
