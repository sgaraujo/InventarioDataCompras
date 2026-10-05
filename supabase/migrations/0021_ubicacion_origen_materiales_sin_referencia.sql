-- Un material SIN referencias es una cantidad (cable, tornillos...), no una
-- unidad fisica unica -- no tiene sentido sobreescribir su "ubicacion" base
-- en cada salida (puede quedar parte en un sitio y salir otra parte para
-- otro). Por eso esta migracion dos cosas:
--   1. actualizar_ubicacion_material() deja de tocar materiales.ubicacion --
--      solo sigue actualizando la ubicacion real cuando la salida es de una
--      referencia puntual (ahi si es una unidad fisica que de verdad se
--      movio).
--   2. guardar_snapshot_material() ahora tambien guarda en el propio
--      movimiento la ubicacion que tenia el material ANTES de esta salida
--      (ubicacion_origen), igual que ya se hace con codigo/descripcion, para
--      que Historial/Ultimos movimientos puedan mostrar "De X a Y" sin
--      depender de que la ubicacion del material no cambie despues.

alter table public.movimientos add column if not exists ubicacion_origen text;

create or replace function public.guardar_snapshot_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.material_id is not null then
    select codigo, descripcion
      into new.material_codigo_snapshot, new.material_descripcion_snapshot
      from public.materiales where id = new.material_id;
  end if;
  if new.referencia_id is not null then
    select codigo into new.referencia_codigo_snapshot
      from public.material_referencias where id = new.referencia_id;
  end if;
  if new.tipo = 'salida' and new.referencia_id is null
     and new.ubicacion is not null and btrim(new.ubicacion) <> '' then
    select ubicacion into new.ubicacion_origen
      from public.materiales where id = new.material_id;
  end if;
  return new;
end;
$$;

create or replace function public.actualizar_ubicacion_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'salida' and new.referencia_id is not null
     and new.ubicacion is not null and btrim(new.ubicacion) <> '' then
    update public.material_referencias set ubicacion = new.ubicacion where id = new.referencia_id;
  end if;
  return null;
end;
$$;
