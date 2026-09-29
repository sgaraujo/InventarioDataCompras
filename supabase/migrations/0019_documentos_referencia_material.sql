-- Documentos adjuntos de cada referencia/serial (ver 0010): certificados de
-- calibracion, facturas, manuales, etc. A diferencia de la foto (ver 0018,
-- una sola por referencia), una referencia puede tener varios documentos,
-- por eso van en tabla aparte. El archivo vive en el bucket "evidencias" y
-- aca se guarda su URL publica y el nombre original para mostrarlo.
-- Idempotente.

create table if not exists public.material_referencia_documentos (
  id bigint generated always as identity primary key,
  referencia_id bigint not null references public.material_referencias (id) on delete cascade,
  nombre text not null,
  url text not null,
  creado_en timestamptz not null default now()
);

-- FK sin indice propio la marca el Performance Advisor (ver 0015).
create index if not exists idx_material_referencia_documentos_referencia_id
  on public.material_referencia_documentos (referencia_id);

alter table public.material_referencia_documentos enable row level security;

-- Mismo esquema de policies que material_referencias (ver 0014): lectura
-- para activos, escritura separada por operacion para editores.
drop policy if exists "material_referencia_documentos: lectura activos" on public.material_referencia_documentos;
create policy "material_referencia_documentos: lectura activos" on public.material_referencia_documentos for select
  using (public.es_activo());

drop policy if exists "material_referencia_documentos: crear editores" on public.material_referencia_documentos;
create policy "material_referencia_documentos: crear editores" on public.material_referencia_documentos for insert
  with check (public.es_editor());

drop policy if exists "material_referencia_documentos: editar editores" on public.material_referencia_documentos;
create policy "material_referencia_documentos: editar editores" on public.material_referencia_documentos for update
  using (public.es_editor()) with check (public.es_editor());

drop policy if exists "material_referencia_documentos: borrar editores" on public.material_referencia_documentos;
create policy "material_referencia_documentos: borrar editores" on public.material_referencia_documentos for delete
  using (public.es_editor());
