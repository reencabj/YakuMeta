-- prioridad: null/0 = sin prioridad; 1 y 2 = niveles (UI)
alter table public.orders
  alter column prioridad set default 0;

update public.orders
set prioridad = 0
where prioridad is null;
