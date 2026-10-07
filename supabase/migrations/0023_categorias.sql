-- Modulo Categorias: catalogo simple (igual que empresas/centros_costo),
-- pero solo admin puede agregar categorias nuevas -- el resto solo las ve.
-- Se precargan las 4 que pidio el cliente. materiales.categoria_id queda
-- nullable (los materiales que ya existian no tienen categoria todavia, se
-- va completando al editarlos) pero la pantalla lo pide obligatorio al
-- crear uno nuevo.

create table if not exists public.categorias (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

insert into public.categorias (nombre)
values ('Equipos'), ('Herramienta'), ('Consumibles'), ('Activos Fijos')
on conflict (nombre) do nothing;

alter table public.categorias enable row level security;

drop policy if exists "categorias: lectura activos" on public.categorias;
create policy "categorias: lectura activos" on public.categorias for select
  using (es_activo());

drop policy if exists "categorias: crear admin" on public.categorias;
create policy "categorias: crear admin" on public.categorias for insert
  with check (es_admin());

alter table public.materiales
  add column if not exists categoria_id bigint references public.categorias(id);

create index if not exists idx_materiales_categoria_id on public.materiales (categoria_id);
