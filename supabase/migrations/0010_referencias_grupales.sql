-- Materiales que agrupan varias referencias/unidades individuales (ej. 20
-- generadores del mismo modelo, cada uno con su propio codigo de activo y su
-- propia ubicacion). Idempotente, mismo criterio que las migraciones
-- anteriores.

alter table public.materiales
  add column if not exists maneja_referencias boolean not null default false;

create table if not exists public.material_referencias (
  id bigint generated always as identity primary key,
  material_id bigint not null references public.materiales (id) on delete cascade,
  codigo text not null,
  ubicacion text,
  creado_en timestamptz not null default now(),
  unique (material_id, codigo)
);

alter table public.material_referencias enable row level security;

drop policy if exists "material_referencias: lectura activos" on public.material_referencias;
create policy "material_referencias: lectura activos" on public.material_referencias for select
  using (public.es_activo());

drop policy if exists "material_referencias: escritura editores" on public.material_referencias;
create policy "material_referencias: escritura editores" on public.material_referencias for all
  using (public.es_editor()) with check (public.es_editor());

-- ===========================================================================
-- Movimientos: cual referencia se movio (si el material maneja referencias)
-- ===========================================================================

alter table public.movimientos
  add column if not exists referencia_id bigint references public.material_referencias (id) on delete set null,
  add column if not exists referencia_codigo_snapshot text;

-- Extiende el trigger de snapshot (ver 0007) para que tambien guarde el
-- codigo de la referencia, no solo el del material -- asi el historial
-- nunca deja de decir cual referencia era, aunque despues se borre.
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
  if new.referencia_id is not null then
    select codigo into new.referencia_codigo_snapshot
      from public.material_referencias where id = new.referencia_id;
  end if;
  return new;
end;
$$;

-- Estado actual de cada referencia (disponible/afuera), derivado de su
-- ultimo movimiento -- nunca se guarda a mano, igual criterio que
-- materiales.stock_actual. Ordena por "id" (estrictamente creciente en
-- orden de insercion) y no por "creado_en": dos movimientos de la misma
-- transaccion comparten el mismo now(), asi que la fecha sola no alcanza
-- para saber cual fue el ultimo de verdad.
create or replace view public.material_referencias_estado as
select
  mr.id,
  mr.material_id,
  mr.codigo,
  mr.ubicacion,
  mr.creado_en,
  ultimo.tipo as ultimo_movimiento_tipo,
  ultimo.creado_en as ultimo_movimiento_en,
  coalesce(ultimo.tipo = 'entrada', false) as disponible
from public.material_referencias mr
left join lateral (
  select m.tipo, m.creado_en
  from public.movimientos m
  where m.referencia_id = mr.id
  order by m.id desc
  limit 1
) ultimo on true;

grant select on public.material_referencias_estado to authenticated;

-- Valida en la base (no solo en el formulario) que un movimiento de un
-- material con referencias siempre traiga cual referencia, cantidad 1, que
-- la referencia sea de ese material, y que una salida no saque una
-- referencia que ya esta afuera.
create or replace function public.validar_movimiento_referencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maneja_ref boolean;
  v_referencia_material_id bigint;
  v_disponible boolean;
begin
  select maneja_referencias into v_maneja_ref from public.materiales where id = new.material_id;

  if v_maneja_ref then
    if new.referencia_id is null then
      raise exception 'Este material maneja referencias -- selecciona cual referencia';
    end if;
    if new.cantidad <> 1 then
      raise exception 'Los movimientos de materiales con referencias son siempre de cantidad 1';
    end if;

    select material_id into v_referencia_material_id
      from public.material_referencias where id = new.referencia_id;
    if v_referencia_material_id is distinct from new.material_id then
      raise exception 'La referencia elegida no pertenece a este material';
    end if;

    if new.tipo = 'salida' then
      select disponible into v_disponible
        from public.material_referencias_estado where id = new.referencia_id;
      if not coalesce(v_disponible, false) then
        raise exception 'Esta referencia no esta disponible (ya esta afuera o nunca se recibio)';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_movimiento_referencia on public.movimientos;
create trigger trg_validar_movimiento_referencia
  before insert on public.movimientos
  for each row execute function public.validar_movimiento_referencia();
