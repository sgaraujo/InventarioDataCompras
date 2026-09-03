-- Reemplaza el dominio de "ordenes de compra" (mal alcance inicial) por el
-- dominio real que pidio el cliente: control de inventario por empresa y
-- centro de costo. Idempotente. Pegar en el SQL Editor o correr con psql.

-- ===========================================================================
-- 0. Sale el dominio de compras/aprobacion (no lo pidio el cliente)
-- ===========================================================================

drop table if exists public.orden_compra_eventos cascade;
drop table if exists public.orden_compra_items cascade;
drop table if exists public.ordenes_compra cascade;
drop function if exists public.actualizar_total_orden() cascade;
drop function if exists public.es_aprobador() cascade;

-- Roles reales de este dominio (ver GUIA_BASE_DATOS_SUPABASE.md): admin,
-- almacenista (registra materiales/movimientos), consulta (solo lectura).
alter table public.perfiles
  drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check
  check (rol in ('admin', 'almacenista', 'consulta'));

create or replace function public.es_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('admin', 'almacenista') and activo
  );
$$;

-- ===========================================================================
-- 1. Catalogos: empresas, centros de costo, solicitantes
-- ===========================================================================

create table if not exists public.empresas (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

alter table public.empresas enable row level security;

create table if not exists public.centros_costo (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas (id) on delete cascade,
  nombre text not null,
  creado_en timestamptz not null default now(),
  unique (empresa_id, nombre)
);

alter table public.centros_costo enable row level security;

create table if not exists public.solicitantes (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.solicitantes enable row level security;

drop policy if exists "empresas: lectura autenticados" on public.empresas;
create policy "empresas: lectura autenticados" on public.empresas for select
  using (auth.role() = 'authenticated');
drop policy if exists "empresas: escritura editores" on public.empresas;
create policy "empresas: escritura editores" on public.empresas for all
  using (public.es_editor()) with check (public.es_editor());

drop policy if exists "centros_costo: lectura autenticados" on public.centros_costo;
create policy "centros_costo: lectura autenticados" on public.centros_costo for select
  using (auth.role() = 'authenticated');
drop policy if exists "centros_costo: escritura editores" on public.centros_costo;
create policy "centros_costo: escritura editores" on public.centros_costo for all
  using (public.es_editor()) with check (public.es_editor());

drop policy if exists "solicitantes: lectura autenticados" on public.solicitantes;
create policy "solicitantes: lectura autenticados" on public.solicitantes for select
  using (auth.role() = 'authenticated');
drop policy if exists "solicitantes: escritura editores" on public.solicitantes;
create policy "solicitantes: escritura editores" on public.solicitantes for all
  using (public.es_editor()) with check (public.es_editor());

-- ===========================================================================
-- 2. Materiales
-- ===========================================================================

create table if not exists public.materiales (
  id bigint generated always as identity primary key,
  codigo text generated always as ('MAT-' || lpad(id::text, 5, '0')) stored,
  empresa_id bigint not null references public.empresas (id),
  centro_costo_id bigint references public.centros_costo (id),
  descripcion text not null,
  stock_actual numeric(14, 2) not null default 0,
  foto text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.materiales enable row level security;

-- El centro de costo tiene que pertenecer a la empresa del material -- nunca
-- lo valida la aplicacion, lo valida un trigger (mismo criterio que el resto
-- del esquema).
create or replace function public.validar_centro_costo_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.centro_costo_id is not null and not exists (
    select 1 from public.centros_costo
    where id = new.centro_costo_id and empresa_id = new.empresa_id
  ) then
    raise exception 'El centro de costo no pertenece a la empresa seleccionada';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_centro_costo_material on public.materiales;
create trigger trg_validar_centro_costo_material
  before insert or update on public.materiales
  for each row execute function public.validar_centro_costo_material();

drop policy if exists "materiales: lectura autenticados" on public.materiales;
create policy "materiales: lectura autenticados" on public.materiales for select
  using (auth.role() = 'authenticated');
drop policy if exists "materiales: escritura editores" on public.materiales;
create policy "materiales: escritura editores" on public.materiales for all
  using (public.es_editor()) with check (public.es_editor());

-- ===========================================================================
-- 3. Movimientos (entradas/salidas) -- stock_actual lo mantiene el trigger,
--    nunca la aplicacion (mismo patron que ProyectoDatacenter).
-- ===========================================================================

create table if not exists public.movimientos (
  id bigint generated always as identity primary key,
  material_id bigint not null references public.materiales (id) on delete cascade,
  tipo text not null,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  solicitante_id bigint references public.solicitantes (id),
  foto text,
  adjunto text,
  observaciones text,
  registrado_por uuid not null references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now()
);

alter table public.movimientos
  drop constraint if exists movimientos_tipo_check;
alter table public.movimientos
  add constraint movimientos_tipo_check
  check (tipo in ('entrada', 'salida'));

alter table public.movimientos enable row level security;

create or replace function public.actualizar_stock_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material_id bigint := coalesce(new.material_id, old.material_id);
begin
  update public.materiales
  set stock_actual = coalesce(
    (select sum(case when tipo = 'entrada' then cantidad else -cantidad end)
     from public.movimientos where material_id = v_material_id),
    0
  )
  where id = v_material_id;
  return null;
end;
$$;

drop trigger if exists trg_actualizar_stock_material on public.movimientos;
create trigger trg_actualizar_stock_material
  after insert or update or delete on public.movimientos
  for each row execute function public.actualizar_stock_material();

drop policy if exists "movimientos: lectura autenticados" on public.movimientos;
create policy "movimientos: lectura autenticados" on public.movimientos for select
  using (auth.role() = 'authenticated');
drop policy if exists "movimientos: crear editores" on public.movimientos;
create policy "movimientos: crear editores" on public.movimientos for insert
  with check (public.es_editor());
drop policy if exists "movimientos: corregir solo admin" on public.movimientos;
create policy "movimientos: corregir solo admin" on public.movimientos for update
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists "movimientos: eliminar solo admin" on public.movimientos;
create policy "movimientos: eliminar solo admin" on public.movimientos for delete
  using (public.es_admin());

-- Resumen mensual (entradas/salidas totales por mes) -- lo pide el cliente
-- para "evidenciar movimiento de inventario por mes". Misma logica que
-- resumen-mensual en ProyectoDatacenter, pero como funcion RPC de Postgres.
create or replace function public.resumen_movimientos_mensual(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_material_id bigint default null
)
returns table (mes text, entradas numeric, salidas numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    to_char(date_trunc('month', creado_en), 'YYYY-MM') as mes,
    coalesce(sum(cantidad) filter (where tipo = 'entrada'), 0) as entradas,
    coalesce(sum(cantidad) filter (where tipo = 'salida'), 0) as salidas
  from public.movimientos
  where (p_desde is null or creado_en >= p_desde)
    and (p_hasta is null or creado_en <= p_hasta)
    and (p_material_id is null or material_id = p_material_id)
  group by 1
  order by 1;
$$;

-- ===========================================================================
-- 4. Storage: fotos de materiales y soportes documentales de movimientos
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

drop policy if exists "evidencias: lectura publica" on storage.objects;
create policy "evidencias: lectura publica" on storage.objects for select
  using (bucket_id = 'evidencias');

drop policy if exists "evidencias: subir autenticados" on storage.objects;
create policy "evidencias: subir autenticados" on storage.objects for insert
  with check (bucket_id = 'evidencias' and auth.role() = 'authenticated');

drop policy if exists "evidencias: borrar editores" on storage.objects;
create policy "evidencias: borrar editores" on storage.objects for delete
  using (bucket_id = 'evidencias' and public.es_editor());
