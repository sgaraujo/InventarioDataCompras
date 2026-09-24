-- Sigue cerrando hallazgos del Performance/Security Advisor de Supabase.

-- ===========================================================================
-- 1. Multiple Permissive Policies en perfiles: dos policies de UPDATE
--    (admin edita cualquiera / usuario edita su propio nombre) se solapaban.
--    Se fusionan en una sola con el mismo permiso real.
-- ===========================================================================

drop policy if exists "admin actualiza cualquier perfil" on public.perfiles;
drop policy if exists "usuario actualiza su propio nombre" on public.perfiles;

create policy "actualizar perfil (admin o dueño)"
  on public.perfiles for update
  using (public.es_admin() or id = (select auth.uid()))
  with check (
    public.es_admin()
    or (
      id = (select auth.uid())
      and rol = (select rol from public.perfiles where id = (select auth.uid()))
    )
  );

-- ===========================================================================
-- 2. Public/Signed-in Can Execute SECURITY DEFINER Function: por defecto
--    Postgres deja cualquier funcion nueva ejecutable por PUBLIC (incluye
--    anon). Se cierra todo y se vuelve a abrir solo lo que de verdad hace
--    falta: las funciones que las RLS policies llaman en cada consulta
--    (deben poder ejecutarlas los usuarios logueados) y el RPC del
--    Dashboard. Las funciones que solo disparan triggers (nunca se llaman
--    directo desde el cliente) quedan sin ningun grant.
-- ===========================================================================

revoke execute on function public.es_admin() from public;
revoke execute on function public.es_editor() from public;
revoke execute on function public.es_activo() from public;
revoke execute on function public.rol_actual() from public;
revoke execute on function public.resumen_movimientos_mensual(timestamptz, timestamptz, bigint) from public;
revoke execute on function public.actualizar_stock_material() from public;
revoke execute on function public.guardar_snapshot_material() from public;
revoke execute on function public.manejar_usuario_nuevo() from public;
revoke execute on function public.validar_centro_costo_material() from public;
revoke execute on function public.validar_movimiento_referencia() from public;

grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_editor() to authenticated;
grant execute on function public.es_activo() to authenticated;
grant execute on function public.rol_actual() to authenticated;
grant execute on function public.resumen_movimientos_mensual(timestamptz, timestamptz, bigint) to authenticated;

-- ===========================================================================
-- 3. Unindexed foreign keys: 6 columnas que apuntan a otra tabla sin indice
--    propio (las otras FK ya quedan cubiertas por un unique existente, ver
--    centros_costo(empresa_id, nombre) y material_referencias(material_id,
--    codigo) -- por eso el advisor no las marco).
-- ===========================================================================

create index if not exists idx_materiales_empresa_id on public.materiales (empresa_id);
create index if not exists idx_materiales_centro_costo_id on public.materiales (centro_costo_id);
create index if not exists idx_movimientos_material_id on public.movimientos (material_id);
create index if not exists idx_movimientos_referencia_id on public.movimientos (referencia_id);
create index if not exists idx_movimientos_registrado_por on public.movimientos (registrado_por);
create index if not exists idx_movimientos_solicitante_id on public.movimientos (solicitante_id);
