-- Esquema inicial de InventarioDataCompras.
-- Idempotente (se puede correr varias veces sin romper nada), mismo criterio
-- que db/schema.sql en ProyectoDatacenter. Pegar completo en el SQL Editor
-- del proyecto de Supabase y ejecutar.

-- ===========================================================================
-- 1. Perfiles (tabla propia enlazada 1:1 a auth.users por id)
-- ===========================================================================

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  rol text not null default 'consulta',
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.perfiles
  drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check
  check (rol in ('admin', 'comprador', 'aprobador', 'consulta'));

alter table public.perfiles enable row level security;

-- Crea el perfil automaticamente cuando alguien se registra en Supabase Auth
-- (SECURITY DEFINER: corre con permisos del dueño de la funcion, por eso
-- puede escribir en perfiles aunque el usuario nuevo todavia no tenga fila).
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email), 'consulta')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- Helpers de rol para usar en policies sin caer en recursion de RLS
-- (SECURITY DEFINER se salta el RLS de perfiles al leerla desde adentro).
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.es_aprobador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('aprobador', 'admin') and activo
  );
$$;

drop policy if exists "ver propio perfil o si es admin" on public.perfiles;
create policy "ver propio perfil o si es admin"
  on public.perfiles for select
  using (id = auth.uid() or public.es_admin());

drop policy if exists "admin actualiza cualquier perfil" on public.perfiles;
create policy "admin actualiza cualquier perfil"
  on public.perfiles for update
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "usuario actualiza su propio nombre" on public.perfiles;
create policy "usuario actualiza su propio nombre"
  on public.perfiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from public.perfiles where id = auth.uid()));

-- ===========================================================================
-- 2. Ordenes de compra: cabecera + lineas + eventos (patron reutilizado de
--    ProyectoDatacenter, ver GUIA_BASE_DATOS_SUPABASE.md seccion 3.1)
-- ===========================================================================

create table if not exists public.ordenes_compra (
  id bigint generated always as identity primary key,
  numero text generated always as ('OC-' || lpad(id::text, 5, '0')) stored,
  estado text not null default 'borrador',
  proveedor text not null,
  observaciones text,
  total numeric(14, 2) not null default 0,
  creado_por uuid not null references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now()
);

alter table public.ordenes_compra
  drop constraint if exists ordenes_compra_estado_check;
alter table public.ordenes_compra
  add constraint ordenes_compra_estado_check
  check (estado in ('borrador', 'pendiente', 'aprobada', 'rechazada', 'cancelada'));

alter table public.ordenes_compra enable row level security;

create table if not exists public.orden_compra_items (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes_compra (id) on delete cascade,
  descripcion text not null,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  precio_unitario numeric(14, 2) not null check (precio_unitario >= 0),
  subtotal numeric(14, 2) generated always as (cantidad * precio_unitario) stored
);

alter table public.orden_compra_items enable row level security;

create table if not exists public.orden_compra_eventos (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes_compra (id) on delete cascade,
  tipo text not null,
  actor uuid references public.perfiles (id),
  nota text,
  creado_en timestamptz not null default now()
);

alter table public.orden_compra_eventos
  drop constraint if exists orden_compra_eventos_tipo_check;
alter table public.orden_compra_eventos
  add constraint orden_compra_eventos_tipo_check
  check (tipo in ('creada', 'enviada_aprobacion', 'aprobada', 'rechazada', 'cancelada'));

alter table public.orden_compra_eventos enable row level security;

-- El total de la cabecera lo mantiene un trigger sumando las lineas (mismo
-- patron que materiales.stock_actual en el proyecto original) -- nunca lo
-- calcula la aplicacion.
create or replace function public.actualizar_total_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden_id bigint := coalesce(new.orden_id, old.orden_id);
begin
  update public.ordenes_compra
  set total = coalesce((select sum(subtotal) from public.orden_compra_items where orden_id = v_orden_id), 0)
  where id = v_orden_id;
  return null;
end;
$$;

drop trigger if exists trg_actualizar_total_orden on public.orden_compra_items;
create trigger trg_actualizar_total_orden
  after insert or update or delete on public.orden_compra_items
  for each row execute function public.actualizar_total_orden();

-- Visibilidad: el comprador ve solo sus propias ordenes; aprobador/admin ven
-- todas. Ver GUIA_BASE_DATOS_SUPABASE.md seccion 4 (RLS reemplaza el
-- construirFiltro() que hoy vive en el backend de Express).

drop policy if exists "ver ordenes propias o si aprueba" on public.ordenes_compra;
create policy "ver ordenes propias o si aprueba"
  on public.ordenes_compra for select
  using (creado_por = auth.uid() or public.es_aprobador());

drop policy if exists "crear orden propia" on public.ordenes_compra;
create policy "crear orden propia"
  on public.ordenes_compra for insert
  with check (creado_por = auth.uid());

drop policy if exists "editar orden propia en borrador" on public.ordenes_compra;
create policy "editar orden propia en borrador"
  on public.ordenes_compra for update
  using (creado_por = auth.uid() and estado = 'borrador')
  with check (creado_por = auth.uid());

drop policy if exists "aprobador decide el estado" on public.ordenes_compra;
create policy "aprobador decide el estado"
  on public.ordenes_compra for update
  using (public.es_aprobador())
  with check (public.es_aprobador());

drop policy if exists "ver lineas de ordenes visibles" on public.orden_compra_items;
create policy "ver lineas de ordenes visibles"
  on public.orden_compra_items for select
  using (
    exists (
      select 1 from public.ordenes_compra o
      where o.id = orden_id and (o.creado_por = auth.uid() or public.es_aprobador())
    )
  );

drop policy if exists "editar lineas de orden propia en borrador" on public.orden_compra_items;
create policy "editar lineas de orden propia en borrador"
  on public.orden_compra_items for all
  using (
    exists (
      select 1 from public.ordenes_compra o
      where o.id = orden_id and o.creado_por = auth.uid() and o.estado = 'borrador'
    )
  )
  with check (
    exists (
      select 1 from public.ordenes_compra o
      where o.id = orden_id and o.creado_por = auth.uid() and o.estado = 'borrador'
    )
  );

drop policy if exists "ver eventos de ordenes visibles" on public.orden_compra_eventos;
create policy "ver eventos de ordenes visibles"
  on public.orden_compra_eventos for select
  using (
    exists (
      select 1 from public.ordenes_compra o
      where o.id = orden_id and (o.creado_por = auth.uid() or public.es_aprobador())
    )
  );

drop policy if exists "crear evento en orden visible" on public.orden_compra_eventos;
create policy "crear evento en orden visible"
  on public.orden_compra_eventos for insert
  with check (
    exists (
      select 1 from public.ordenes_compra o
      where o.id = orden_id and (o.creado_por = auth.uid() or public.es_aprobador())
    )
  );
