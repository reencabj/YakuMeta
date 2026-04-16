-- =============================================================================
-- Origen de pedido + notificación Discord centralizada (AFTER INSERT en orders)
-- =============================================================================
-- Requisitos opcionales para que el trigger llame a la Edge Function notify-discord
-- desde la base (cualquier cliente: panel, portal, etc.):
--
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/notify-discord', 'notify_discord_invoker_url');
--   select vault.create_secret('<SERVICE_ROLE_JWT>', 'notify_discord_invoker_jwt');
--
-- Sin esos secretos en Vault, el INSERT del pedido sigue funcionando; solo no se
-- encola el POST a Discord (ver logs WARNING en Postgres si falla otra cosa).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS origen_pedido text NOT NULL DEFAULT 'admin'
    CHECK (origen_pedido IN ('admin', 'portal_clientes'));

COMMENT ON COLUMN public.orders.origen_pedido IS
  'Alta del pedido: panel interno (admin) o portal de clientes.';

-- -----------------------------------------------------------------------------
-- create_order: nuevo parámetro p_origen_pedido (default admin)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order(text, numeric, date, date, text);

CREATE OR REPLACE FUNCTION public.create_order(
  p_cliente_nombre text,
  p_cantidad_meta_kilos numeric,
  p_fecha_pedido date,
  p_fecha_encargo date,
  p_notas text,
  p_origen_pedido text DEFAULT 'admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_precio numeric;
  v_total numeric;
  v_origen text := coalesce(nullif(trim(p_origen_pedido), ''), 'admin');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF coalesce(trim(p_cliente_nombre), '') = '' THEN
    RAISE EXCEPTION 'cliente_required';
  END IF;
  IF p_cantidad_meta_kilos IS NULL OR p_cantidad_meta_kilos <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;
  IF v_origen NOT IN ('admin', 'portal_clientes') THEN
    RAISE EXCEPTION 'invalid_origen_pedido';
  END IF;

  v_precio := public.resolve_suggested_price_per_kg(p_cantidad_meta_kilos);
  v_total := round(p_cantidad_meta_kilos * coalesce(v_precio, 0), 2);

  INSERT INTO public.orders (
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
    origen_pedido
  )
  VALUES (
    v_id,
    trim(p_cliente_nombre),
    p_cantidad_meta_kilos,
    coalesce(p_fecha_pedido, current_date),
    p_fecha_encargo,
    v_uid,
    'pendiente',
    nullif(trim(p_notas), ''),
    v_precio,
    v_total,
    v_origen
  );

  INSERT INTO public.audit_logs (entity_type, entity_id, accion, usuario_id, new_values, metadata)
  VALUES (
    'order',
    v_id,
    'crear_pedido',
    v_uid,
    jsonb_build_object(
      'cliente_nombre', trim(p_cliente_nombre),
      'cantidad_meta_kilos', p_cantidad_meta_kilos,
      'precio_sugerido_por_kilo', v_precio,
      'total_sugerido', v_total,
      'origen_pedido', v_origen
    ),
    jsonb_build_object('fecha_pedido', p_fecha_pedido, 'fecha_encargo', p_fecha_encargo)
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(text, numeric, date, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_order(text, numeric, date, date, text, text) IS
  'Alta de pedido con snapshot de precio sugerido y origen (admin | portal_clientes).';

-- -----------------------------------------------------------------------------
-- Trigger: notificar Discord (async via pg_net) sin bloquear el INSERT
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_orders_notify_discord_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  v_url text;
  v_jwt text;
  v_body jsonb;
BEGIN
  SELECT max(ds.decrypted_secret) FILTER (WHERE ds.name = 'notify_discord_invoker_url'),
         max(ds.decrypted_secret) FILTER (WHERE ds.name = 'notify_discord_invoker_jwt')
    INTO v_url, v_jwt
  FROM vault.decrypted_secrets ds
  WHERE ds.name IN ('notify_discord_invoker_url', 'notify_discord_invoker_jwt');

  IF v_url IS NULL OR v_jwt IS NULL OR length(trim(v_url)) = 0 OR length(trim(v_jwt)) = 0 THEN
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'tipo_evento', 'nuevo_pedido',
    'cliente', NEW.cliente_nombre,
    'kilos', NEW.cantidad_meta_kilos,
    'origen_pedido', NEW.origen_pedido
  );

  PERFORM net.http_post(
    url := trim(v_url),
    body := v_body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_jwt)
    ),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'trg_orders_notify_discord_new_order: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_notify_discord_after_insert ON public.orders;

CREATE TRIGGER orders_notify_discord_after_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  execute function public.trg_orders_notify_discord_new_order();
