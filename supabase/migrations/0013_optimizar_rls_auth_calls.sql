-- El Performance Advisor marco varias policies que llaman a auth.uid()/
-- auth.role() directo, en vez de envuelto en un (select ...) -- sin el
-- select, Postgres puede re-evaluar la funcion en cada fila escaneada en vez
-- de una sola vez por consulta. Se reescriben las 4 policies que lo tenian
-- asi en todo el esquema (las demas ya usan las funciones propias es_admin/
-- es_editor/es_activo, que Postgres cachea bien por ser STABLE).

drop policy if exists "ver propio perfil o si es admin" on public.perfiles;
create policy "ver propio perfil o si es admin"
  on public.perfiles for select
  using (id = (select auth.uid()) or public.es_admin());

drop policy if exists "usuario actualiza su propio nombre" on public.perfiles;
create policy "usuario actualiza su propio nombre"
  on public.perfiles for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and rol = (select rol from public.perfiles where id = (select auth.uid()))
  );

drop policy if exists "movimientos: crear editores" on public.movimientos;
create policy "movimientos: crear editores"
  on public.movimientos for insert
  with check (public.es_editor() and registrado_por = (select auth.uid()));

drop policy if exists "evidencias: subir autenticados" on storage.objects;
create policy "evidencias: subir autenticados"
  on storage.objects for insert
  with check (bucket_id = 'evidencias' and (select auth.role()) = 'authenticated');
