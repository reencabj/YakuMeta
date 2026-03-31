-- =============================================================================
-- Pedidos: staff interno (admin o user activo) ve todos los pedidos;
-- rol cliente (portal) solo los que creó (creado_por_usuario_id = auth.uid()).
-- =============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'user', 'cliente'));

CREATE OR REPLACE FUNCTION public.can_view_all_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.role IN ('admin', 'user') AND p.is_active
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_view_all_orders() IS
  'Staff interno (admin/user activo): listados globales de pedidos. Rol cliente queda excluido.';

DROP POLICY IF EXISTS "orders_select" ON public.orders;

CREATE POLICY "orders_select"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    public.can_view_all_orders()
    OR creado_por_usuario_id = auth.uid()
  );

-- Evita que un cliente actualice pedidos ajenos por UUID; el staff sigue pudiendo operar.
DROP POLICY IF EXISTS "orders_update" ON public.orders;

CREATE POLICY "orders_update"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    (estado <> 'entregado' OR public.is_admin())
    AND (
      public.can_view_all_orders()
      OR creado_por_usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    (estado <> 'entregado' OR public.is_admin())
    AND (
      public.can_view_all_orders()
      OR creado_por_usuario_id = auth.uid()
    )
  );
