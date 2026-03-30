-- =============================================================================
-- Auth real: email en profiles, trigger de alta y sync desde auth.users
-- Reemplaza login por email; username/display_name siguen siendo identidad operativa
-- =============================================================================

-- 1) Columna email (backfill desde auth.users)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND (p.email IS NULL OR p.email = '');

-- Perfiles sin usuario en auth (huérfanos): no forzar NOT NULL hasta limpiar manualmente
UPDATE public.profiles
SET email = 'pendiente+' || id::text || '@migracion.invalid'
WHERE email IS NULL OR trim(email) = '';

ALTER TABLE public.profiles
  ALTER COLUMN email SET NOT NULL;

COMMENT ON COLUMN public.profiles.email IS 'Email canónico de Supabase Auth; login con email + contraseña';

-- 2) Unicidad email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (lower(trim(email)));

-- 3) Alta de perfil desde Auth: email real, rol inicial siempre user (admin lo ajusta la Edge Function)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_display text;
BEGIN
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(lower(trim(coalesce(new.email, ''))), '@', 1)
  );
  v_display := nullif(trim(new.raw_user_meta_data->>'display_name'), '');

  INSERT INTO public.profiles (id, email, username, display_name, role)
      VALUES (
        new.id,
        lower(trim(coalesce(new.email, ''))),
        v_username,
        v_display,
        'user'
      )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    username = COALESCE(nullif(trim(excluded.username), ''), public.profiles.username),
    display_name = COALESCE(excluded.display_name, public.profiles.display_name);

  RETURN new;
END;
$$;

-- 4) Mantener email alineado si cambia en auth.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_email_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.email IS DISTINCT FROM old.email THEN
    UPDATE public.profiles
    SET
      email = lower(trim(coalesce(new.email, ''))),
      updated_at = now()
    WHERE id = new.id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated_email ON auth.users;
CREATE TRIGGER on_auth_user_updated_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  execute function public.handle_auth_user_email_updated();

COMMENT ON FUNCTION public.handle_new_user IS 'Inserta/upsert profiles al crear usuario Auth; rol operativo lo confirma invite-user (admin).';
COMMENT ON FUNCTION public.handle_auth_user_email_updated IS 'Replica cambio de email en profiles.';
