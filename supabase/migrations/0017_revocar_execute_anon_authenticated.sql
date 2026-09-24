-- La migracion 0015 revoco el EXECUTE de PUBLIC, pero Supabase le da
-- EXECUTE a "anon" y "authenticated" de forma directa (no solo via PUBLIC)
-- a cada funcion nueva por defecto -- por eso el Advisor seguia marcando
-- todo. Se revoca explicitamente de esos dos roles y se vuelve a otorgar
-- solo a "authenticated" donde de verdad hace falta.

revoke execute on function public.es_admin() from anon, authenticated;
revoke execute on function public.es_editor() from anon, authenticated;
revoke execute on function public.es_activo() from anon, authenticated;
revoke execute on function public.rol_actual() from anon, authenticated;
revoke execute on function public.resumen_movimientos_mensual(timestamptz, timestamptz, bigint) from anon, authenticated;
revoke execute on function public.actualizar_stock_material() from anon, authenticated;
revoke execute on function public.guardar_snapshot_material() from anon, authenticated;
revoke execute on function public.manejar_usuario_nuevo() from anon, authenticated;
revoke execute on function public.validar_centro_costo_material() from anon, authenticated;
revoke execute on function public.validar_movimiento_referencia() from anon, authenticated;

grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_editor() to authenticated;
grant execute on function public.es_activo() to authenticated;
grant execute on function public.rol_actual() to authenticated;
grant execute on function public.resumen_movimientos_mensual(timestamptz, timestamptz, bigint) to authenticated;
