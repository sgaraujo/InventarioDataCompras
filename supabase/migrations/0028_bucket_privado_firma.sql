-- Bucket privado para archivos sensibles que no deben quedar en el codigo
-- fuente ni empaquetados en el JS publico de la app (una SPA sin backend
-- manda el bundle entero a cualquiera que abra el sitio, antes de iniciar
-- sesion). Caso concreto: la firma real de Xiomara Urueña para la remision
-- de salida (ver lib/remision.ts) -- antes vivia como base64 en
-- src/assets/remision/firma.ts, visible para cualquiera.
--
-- A diferencia de "evidencias" (bucket publico, cualquiera con la URL ve el
-- archivo, ver 0002), este bucket NO es publico: solo se puede leer via
-- supabase.storage.download() con una sesion de un usuario activo (no
-- existe una URL publica que sirva el archivo directo). Subir/reemplazar/
-- borrar queda solo para admin -- este bucket es para archivos sensibles
-- curados a mano desde el Dashboard de Supabase, no para subida libre desde
-- la app.

insert into storage.buckets (id, name, public)
values ('privado', 'privado', false)
on conflict (id) do nothing;

drop policy if exists "privado: lectura activos" on storage.objects;
create policy "privado: lectura activos" on storage.objects for select
  using (bucket_id = 'privado' and public.es_activo());

drop policy if exists "privado: subir admin" on storage.objects;
create policy "privado: subir admin" on storage.objects for insert
  with check (bucket_id = 'privado' and public.es_admin());

drop policy if exists "privado: actualizar admin" on storage.objects;
create policy "privado: actualizar admin" on storage.objects for update
  using (bucket_id = 'privado' and public.es_admin())
  with check (bucket_id = 'privado' and public.es_admin());

drop policy if exists "privado: borrar admin" on storage.objects;
create policy "privado: borrar admin" on storage.objects for delete
  using (bucket_id = 'privado' and public.es_admin());
