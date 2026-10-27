-- remision_numero es un consecutivo unico por salida (como el numero de
-- una factura) -- nunca se repite entre salidas distintas, aunque sean del
-- mismo material o el mismo dia. Con galeria_carpetas.remision_numero como
-- columna suelta (ver 0026), una carpeta solo podia amarrarse a UNA
-- remision -- si una misma entrega fisica terminaba registrada como varias
-- salidas separadas, tocaria crear una carpeta de fotos por cada una,
-- fragmentando todo sin necesidad (discusion 2026-10-27).
--
-- Se reemplaza esa columna por una tabla puente N a N: una carpeta puede
-- tener cero, una o varias remisiones asociadas, y una remision (en teoria)
-- podria aparecer en mas de una carpeta.

create table if not exists public.galeria_carpeta_remisiones (
  carpeta_id bigint not null references public.galeria_carpetas(id) on delete cascade,
  remision_numero integer not null,
  primary key (carpeta_id, remision_numero)
);

create index if not exists idx_galeria_carpeta_remisiones_remision
  on public.galeria_carpeta_remisiones (remision_numero);

-- Migra lo que ya hubiera en la columna vieja antes de borrarla.
insert into public.galeria_carpeta_remisiones (carpeta_id, remision_numero)
select id, remision_numero from public.galeria_carpetas where remision_numero is not null
on conflict do nothing;

alter table public.galeria_carpetas drop column if exists remision_numero;

alter table public.galeria_carpeta_remisiones enable row level security;

-- Mismo nivel de permiso que renombrar una carpeta (cualquier activo):
-- asociar/desasociar una remision es organizativo, no borra fotos ni
-- carpetas.
drop policy if exists "galeria_carpeta_remisiones: lectura activos" on public.galeria_carpeta_remisiones;
create policy "galeria_carpeta_remisiones: lectura activos" on public.galeria_carpeta_remisiones for select
  using (public.es_activo());

drop policy if exists "galeria_carpeta_remisiones: asociar activos" on public.galeria_carpeta_remisiones;
create policy "galeria_carpeta_remisiones: asociar activos" on public.galeria_carpeta_remisiones for insert
  with check (public.es_activo());

drop policy if exists "galeria_carpeta_remisiones: desasociar activos" on public.galeria_carpeta_remisiones;
create policy "galeria_carpeta_remisiones: desasociar activos" on public.galeria_carpeta_remisiones for delete
  using (public.es_activo());
