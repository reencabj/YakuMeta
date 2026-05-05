-- Webhook de Discord configurable desde Admin > General
alter table public.app_settings
  add column if not exists discord_webhook_url text;
