-- Ajuste al diseño de referencias (ver 0010): una misma referencia SI puede
-- tener varias unidades en stock (ej. la referencia "112313" recibe 5 de una
-- vez), no maximo 1 como se asumio primero. "disponible" (booleano) pasa a
-- ser "stock_disponible" (numero), calculado igual que materiales.stock_actual
-- pero filtrado por referencia. Idempotente.

-- CREATE OR REPLACE no permite quitar columnas (cambia disponible/ultimo_
-- movimiento_* por stock_disponible), asi que hay que recrearla entera.
drop view if exists public.material_referencias_estado;

create view public.material_referencias_estado as
select
  mr.id,
  mr.material_id,
  mr.codigo,
  mr.ubicacion,
  mr.creado_en,
  coalesce(mov.stock, 0) as stock_disponible
from public.material_referencias mr
left join lateral (
  select sum(case when m.tipo = 'entrada' then m.cantidad else -m.cantidad end) as stock
  from public.movimientos m
  where m.referencia_id = mr.id
) mov on true;

grant select on public.material_referencias_estado to authenticated;

create or replace function public.validar_movimiento_referencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maneja_ref boolean;
  v_referencia_material_id bigint;
  v_stock_disponible numeric;
begin
  select maneja_referencias into v_maneja_ref from public.materiales where id = new.material_id;

  if v_maneja_ref then
    if new.referencia_id is null then
      raise exception 'Este material maneja referencias -- selecciona cual referencia';
    end if;

    select material_id into v_referencia_material_id
      from public.material_referencias where id = new.referencia_id;
    if v_referencia_material_id is distinct from new.material_id then
      raise exception 'La referencia elegida no pertenece a este material';
    end if;

    if new.tipo = 'salida' then
      select stock_disponible into v_stock_disponible
        from public.material_referencias_estado where id = new.referencia_id;
      if new.cantidad > coalesce(v_stock_disponible, 0) then
        raise exception 'No hay suficiente stock en esta referencia (disponible: %)', coalesce(v_stock_disponible, 0);
      end if;
    end if;
  end if;

  return new;
end;
$$;
