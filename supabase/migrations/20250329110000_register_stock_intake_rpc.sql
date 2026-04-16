-- Ingreso atómico: lote + movimiento (ingreso), validando usuario y depósito activo
create or replace function public.register_stock_intake(
  p_deposito_id uuid,
  p_cantidad_meta_kilos numeric,
  p_fecha_guardado date,
  p_observaciones text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_dias integer;
  v_venc date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_cantidad_meta_kilos is null or p_cantidad_meta_kilos <= 0 then
    raise exception 'invalid_quantity';
  end if;

  if not exists (
    select 1 from public.storage_locations sl
    where sl.id = p_deposito_id and sl.is_active = true
  ) then
    raise exception 'deposit_not_found_or_inactive';
  end if;

  select dias_duracion_meta_por_defecto into v_dias
  from public.app_settings where id = 1;

  v_dias := coalesce(v_dias, 7);
  v_venc := p_fecha_guardado + v_dias;

  insert into public.stock_batches (
    deposito_id,
    cantidad_meta_kilos,
    fecha_guardado,
    guardado_por_usuario_id,
    fecha_vencimiento_estimada,
    observaciones,
    created_by,
    estado
  )
  values (
    p_deposito_id,
    p_cantidad_meta_kilos,
    p_fecha_guardado,
    v_uid,
    v_venc,
    nullif(trim(p_observaciones), ''),
    v_uid,
    'disponible'
  )
  returning id into v_batch_id;

  insert into public.stock_movements (
    tipo_movimiento,
    lote_id,
    deposito_id,
    cantidad_meta_kilos,
    usuario_id,
    notas
  )
  values (
    'ingreso',
    v_batch_id,
    p_deposito_id,
    p_cantidad_meta_kilos,
    v_uid,
    nullif(trim(p_observaciones), '')
  );

  return v_batch_id;
end;
$$;

grant execute on function public.register_stock_intake(uuid, numeric, date, text) to authenticated;

comment on function public.register_stock_intake(uuid, numeric, date, text) is
  'Crea lote y movimiento ingreso en una transacción';
