-- =============================================================================
-- Pedidos Lavado: permitir borrar historial/test solo a admin
-- =============================================================================

drop policy if exists "lavado_pedidos_delete_admin" on public.lavado_pedidos;
create policy "lavado_pedidos_delete_admin"
  on public.lavado_pedidos for delete
  to authenticated
  using (public.is_admin());

grant delete on public.lavado_pedidos to authenticated;
