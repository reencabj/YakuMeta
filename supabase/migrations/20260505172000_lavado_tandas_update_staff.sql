-- =============================================================================
-- Lavado: permitir que staff interno (admin/user activo) actualice tandas
-- =============================================================================

drop policy if exists "lavado_tandas_update_owner_or_admin" on public.lavado_tandas;

create policy "lavado_tandas_update_staff_or_owner"
  on public.lavado_tandas for update to authenticated
  using (
    public.can_view_all_orders()
    or usuario_id = auth.uid()
  )
  with check (
    public.can_view_all_orders()
    or usuario_id = auth.uid()
  );
