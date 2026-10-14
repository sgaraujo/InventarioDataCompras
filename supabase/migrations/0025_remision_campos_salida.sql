-- Campos nuevos para llenar de verdad la remision de salida (ver analisis
-- de la plantilla nueva, 2026-10-14): area/proyecto y centro de costo son
-- texto libre especifico de esa salida (no el centro_costo_id del catalogo
-- del material, que puede no aplicar para este destino puntual), motivo de
-- salida queda separado de observaciones, y tipo_movimiento guarda la
-- opcion marcada (Consumo/Traslado/Prestamo/Alquiler/Otro).
--
-- remision_numero es un consecutivo real (secuencia de postgres) -- se pide
-- un numero nuevo una sola vez por salida y se guarda igual en todos los
-- movimientos que se crean juntos en esa salida (ademas de servir como
-- numero impreso, deja identificar despues cuales filas pertenecen a la
-- misma remision).

alter table public.movimientos
  add column if not exists remision_numero integer,
  add column if not exists area_proyecto text,
  add column if not exists centro_costo_texto text,
  add column if not exists motivo_salida text,
  add column if not exists tipo_movimiento text;

create sequence if not exists public.remision_numero_seq;

create or replace function public.siguiente_remision_numero()
returns integer
language sql
security definer
set search_path = public
as $$
  select nextval('public.remision_numero_seq')::integer;
$$;

revoke execute on function public.siguiente_remision_numero() from anon, authenticated;
grant execute on function public.siguiente_remision_numero() to authenticated;
