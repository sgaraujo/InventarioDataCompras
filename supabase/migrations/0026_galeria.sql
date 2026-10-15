-- Modulo Galeria: carpetas con nombre para guardar registros fotograficos
-- de los procesos de salida y envio de material. La carpeta es libre (no
-- depende de un movimiento), pero opcionalmente se puede asociar a una
-- remision (movimientos.remision_numero, ver 0025) para encontrarla desde
-- el detalle de la salida en Historial.
--
-- Permisos (decision del cliente, 2026-10-15): cualquier usuario activo ve,
-- crea y renombra carpetas y sube fotos; solo admin elimina carpetas o fotos.
-- Las fotos viven en el bucket publico "evidencias" bajo galeria/ (mismo
-- esquema que el resto de evidencias, ver 0002 y 0016); la tabla
-- galeria_fotos guarda la URL publica de cada una.

create table if not exists public.galeria_carpetas (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  remision_numero integer,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

create index if not exists idx_galeria_carpetas_remision on public.galeria_carpetas (remision_numero);

create table if not exists public.galeria_fotos (
  id bigint generated always as identity primary key,
  carpeta_id bigint not null references public.galeria_carpetas(id) on delete cascade,
  url text not null,
  nombre_archivo text,
  subido_por uuid references public.perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

create index if not exists idx_galeria_fotos_carpeta on public.galeria_fotos (carpeta_id);

alter table public.galeria_carpetas enable row level security;
alter table public.galeria_fotos enable row level security;

-- Carpetas
drop policy if exists "galeria_carpetas: lectura activos" on public.galeria_carpetas;
create policy "galeria_carpetas: lectura activos" on public.galeria_carpetas for select
  using (public.es_activo());

drop policy if exists "galeria_carpetas: crear activos" on public.galeria_carpetas;
create policy "galeria_carpetas: crear activos" on public.galeria_carpetas for insert
  with check (public.es_activo());

drop policy if exists "galeria_carpetas: renombrar activos" on public.galeria_carpetas;
create policy "galeria_carpetas: renombrar activos" on public.galeria_carpetas for update
  using (public.es_activo()) with check (public.es_activo());

drop policy if exists "galeria_carpetas: borrar admin" on public.galeria_carpetas;
create policy "galeria_carpetas: borrar admin" on public.galeria_carpetas for delete
  using (public.es_admin());

-- Fotos
drop policy if exists "galeria_fotos: lectura activos" on public.galeria_fotos;
create policy "galeria_fotos: lectura activos" on public.galeria_fotos for select
  using (public.es_activo());

drop policy if exists "galeria_fotos: subir activos" on public.galeria_fotos;
create policy "galeria_fotos: subir activos" on public.galeria_fotos for insert
  with check (public.es_activo());

drop policy if exists "galeria_fotos: borrar admin" on public.galeria_fotos;
create policy "galeria_fotos: borrar admin" on public.galeria_fotos for delete
  using (public.es_admin());
