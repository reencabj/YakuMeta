-- Permitir a usuarios autenticados gestionar depósitos (equipo operativo pequeño).
-- Si preferís solo admin, revertí esta migración y manten políticas anteriores.

drop policy if exists "storage_locations_insert_admin" on public.storage_locations;
drop policy if exists "storage_locations_update_admin" on public.storage_locations;
drop policy if exists "storage_locations_insert_authenticated" on public.storage_locations;
drop policy if exists "storage_locations_update_authenticated" on public.storage_locations;

create policy "storage_locations_insert_authenticated"
  on public.storage_locations for insert
  to authenticated
  with check (true);

create policy "storage_locations_update_authenticated"
  on public.storage_locations for update
  to authenticated
  using (true)
  with check (true);
