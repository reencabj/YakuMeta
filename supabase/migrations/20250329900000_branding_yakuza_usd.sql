-- Branding y moneda por defecto (fila única app_settings)
UPDATE public.app_settings
SET
  app_name = 'Yakuza Meta Stock',
  currency = 'USD',
  updated_at = now()
WHERE id = 1;
