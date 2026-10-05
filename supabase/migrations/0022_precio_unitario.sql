-- Precio de adquisicion por unidad -- opcional, se puede ir completando con
-- el tiempo. El "valor total" nunca se guarda: siempre es precio_unitario *
-- stock (igual que stock_actual, se recalcula solo con cada movimiento, asi
-- que una salida ya lo deja reflejado sin tocar nada aparte).
--
-- Solo el rol admin puede poner/cambiar el precio -- los demas roles lo ven
-- pero no lo pueden tocar, ni siquiera mandando el campo en el payload
-- (el trigger lo revierte silenciosamente si quien edita no es admin).

alter table public.materiales
  add column if not exists precio_unitario numeric(14, 2);

alter table public.material_referencias
  add column if not exists precio_unitario numeric(14, 2);

create or replace function public.restringir_precio_a_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    if tg_op = 'INSERT' then
      new.precio_unitario := null;
    elsif new.precio_unitario is distinct from old.precio_unitario then
      new.precio_unitario := old.precio_unitario;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.restringir_precio_a_admin() from anon, authenticated;

drop trigger if exists trg_restringir_precio_materiales on public.materiales;
create trigger trg_restringir_precio_materiales
  before insert or update on public.materiales
  for each row execute function public.restringir_precio_a_admin();

drop trigger if exists trg_restringir_precio_referencias on public.material_referencias;
create trigger trg_restringir_precio_referencias
  before insert or update on public.material_referencias
  for each row execute function public.restringir_precio_a_admin();

-- La vista expone precio_unitario y el valor total ya calculado para esa
-- referencia (precio * stock disponible). Se recrea entera por la misma
-- razon que en 0018 (CREATE OR REPLACE solo permite agregar columnas al
-- final en el mismo orden, mas limpio recrearla completa).
drop view if exists public.material_referencias_estado;

create view public.material_referencias_estado
with (security_invoker = true) as
select
  mr.id,
  mr.material_id,
  mr.codigo,
  mr.ubicacion,
  mr.foto,
  mr.precio_unitario,
  mr.creado_en,
  coalesce(mov.stock, 0) as stock_disponible,
  mr.precio_unitario * coalesce(mov.stock, 0) as valor_total
from public.material_referencias mr
left join lateral (
  select sum(case when m.tipo = 'entrada' then m.cantidad else -m.cantidad end) as stock
  from public.movimientos m
  where m.referencia_id = mr.id
) mov on true;

grant select on public.material_referencias_estado to authenticated;
