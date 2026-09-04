-- Cierra 3 huecos encontrados en revision de codigo sobre 0001/0002:
--
-- 1. Las policies de SELECT solo exigian auth.role() = 'authenticated', sin
--    mirar perfiles.activo -- un usuario desactivado por un admin seguia
--    leyendo materiales/movimientos/etc. mientras su sesion no expirara.
-- 2. actualizar_stock_material() no bloqueaba la fila de materiales antes de
--    recalcular ni impedia stock negativo -- dos salidas concurrentes del
--    ultimo material en stock podian dejarlo en negativo.
-- 3. La policy de insert de movimientos no exigia registrado_por = auth.uid(),
--    asi que un insert directo por API podia atribuir el movimiento a otro
--    usuario.
--
-- Idempotente, mismo criterio que 0001/0002. Pegar en el SQL Editor o correr
-- con psql.

-- ===========================================================================
-- 1. Lectura exige perfil activo, no solo sesion valida
-- ===========================================================================

create or replace function public.es_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo
  );
$$;

drop policy if exists "empresas: lectura autenticados" on public.empresas;
create policy "empresas: lectura activos" on public.empresas for select
  using (public.es_activo());

drop policy if exists "centros_costo: lectura autenticados" on public.centros_costo;
create policy "centros_costo: lectura activos" on public.centros_costo for select
  using (public.es_activo());

drop policy if exists "solicitantes: lectura autenticados" on public.solicitantes;
create policy "solicitantes: lectura activos" on public.solicitantes for select
  using (public.es_activo());

drop policy if exists "materiales: lectura autenticados" on public.materiales;
create policy "materiales: lectura activos" on public.materiales for select
  using (public.es_activo());

drop policy if exists "movimientos: lectura autenticados" on public.movimientos;
create policy "movimientos: lectura activos" on public.movimientos for select
  using (public.es_activo());

-- ===========================================================================
-- 2. Stock nunca queda negativo, ni con salidas concurrentes del mismo
--    material (se serializa con un lock de fila antes de recalcular).
-- ===========================================================================

alter table public.materiales
  drop constraint if exists materiales_stock_no_negativo;
alter table public.materiales
  add constraint materiales_stock_no_negativo
  check (stock_actual >= 0);

create or replace function public.actualizar_stock_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material_id bigint := coalesce(new.material_id, old.material_id);
  v_stock numeric(14, 2);
begin
  -- Bloquea la fila del material para que una segunda salida concurrente del
  -- mismo material espere a que esta transaccion termine antes de recalcular
  -- (sin esto, dos salidas simultaneas podian leer el mismo stock de partida
  -- y ambas pasar la validacion, dejando stock_actual negativo).
  perform 1 from public.materiales where id = v_material_id for update;

  select coalesce(
    sum(case when tipo = 'entrada' then cantidad else -cantidad end), 0
  ) into v_stock
  from public.movimientos where material_id = v_material_id;

  update public.materiales set stock_actual = v_stock where id = v_material_id;
  return null;
end;
$$;

-- ===========================================================================
-- 3. Todo movimiento queda auditado a quien realmente lo registro.
-- ===========================================================================

drop policy if exists "movimientos: crear editores" on public.movimientos;
create policy "movimientos: crear editores" on public.movimientos for insert
  with check (public.es_editor() and registrado_por = auth.uid());
