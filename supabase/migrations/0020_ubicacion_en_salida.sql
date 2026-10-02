-- En una Salida se puede indicar a donde quedo el material (ej. tenia
-- ubicacion "Bogota" y al sacarlo se va para "Medellin"). Esa ubicacion
-- nueva queda guardada en el propio movimiento (para el historial) y
-- ademas actualiza la ubicacion actual -- de la referencia puntual si el
-- material maneja referencias, o del material en general si no.

alter table public.movimientos add column if not exists ubicacion text;

create or replace function public.actualizar_ubicacion_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'salida' and new.ubicacion is not null and btrim(new.ubicacion) <> '' then
    if new.referencia_id is not null then
      update public.material_referencias set ubicacion = new.ubicacion where id = new.referencia_id;
    else
      update public.materiales set ubicacion = new.ubicacion where id = new.material_id;
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.actualizar_ubicacion_material() from anon, authenticated;

drop trigger if exists trg_actualizar_ubicacion_material on public.movimientos;
create trigger trg_actualizar_ubicacion_material
  after insert on public.movimientos
  for each row execute function public.actualizar_ubicacion_material();
