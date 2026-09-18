-- Simplifica "Eliminar material": siempre funciona (sin importar stock ni
-- historial), y el historial de movimientos nunca se pierde -- en vez de
-- bloquear el borrado (RESTRICT) o hacerlo caer a Desactivar, ahora
-- materiales.id se puede borrar y movimientos.material_id se pone en NULL
-- solo (ON DELETE SET NULL). Para que el historial siga mostrando que
-- material era aunque ya no exista, cada movimiento guarda su propia
-- "foto" del codigo/descripcion al momento de registrarse.
--
-- Idempotente, mismo criterio que las migraciones anteriores.

alter table public.movimientos
  add column if not exists material_codigo_snapshot text,
  add column if not exists material_descripcion_snapshot text;

-- Backfill de lo que ya existe, usando el material actual (si todavia existe).
update public.movimientos m
set
  material_codigo_snapshot = mat.codigo,
  material_descripcion_snapshot = mat.descripcion
from public.materiales mat
where m.material_id = mat.id and m.material_codigo_snapshot is null;

alter table public.movimientos alter column material_id drop not null;

alter table public.movimientos
  drop constraint if exists movimientos_material_id_fkey;
alter table public.movimientos
  add constraint movimientos_material_id_fkey
  foreign key (material_id) references public.materiales (id) on delete set null;

-- Guarda la foto del material en cada movimiento nuevo, para que el
-- historial no dependa de que el material siga existiendo despues.
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
  return new;
end;
$$;

drop trigger if exists trg_guardar_snapshot_material on public.movimientos;
create trigger trg_guardar_snapshot_material
  before insert on public.movimientos
  for each row execute function public.guardar_snapshot_material();
