-- El feature de "Eliminar material" (agregado en un commit de Santiago)
-- validaba en el navegador que el stock fuera 0 antes de borrar, pero
-- movimientos.material_id tenia "ON DELETE CASCADE" -- borrar un material
-- borraba tambien TODO su historial de entradas/salidas, justo lo que el
-- cliente pidio poder "evidenciar" con detalle. Un insert/delete directo por
-- API (sin pasar por el chequeo del navegador) tampoco tenia nada que lo
-- frenara del lado de la base.
--
-- Con RESTRICT, Postgres impide borrar un material mientras exista al menos
-- un movimiento que lo referencie -- el historial nunca se pierde. En la
-- practica esto vuelve "Eliminar" util solo para corregir un material creado
-- por error (sin ningun movimiento todavia); cualquier material con
-- historial real solo se puede Desactivar (ver Materiales.tsx), nunca borrar.
--
-- Idempotente, mismo criterio que las migraciones anteriores.

alter table public.movimientos
  drop constraint if exists movimientos_material_id_fkey;
alter table public.movimientos
  add constraint movimientos_material_id_fkey
  foreign key (material_id) references public.materiales (id) on delete restrict;
