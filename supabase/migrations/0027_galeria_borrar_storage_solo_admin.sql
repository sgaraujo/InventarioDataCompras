-- La tabla galeria_fotos ya exige admin para borrar una fila (ver
-- "galeria_fotos: borrar admin" en 0026), pero el archivo fisico vivia bajo
-- "evidencias: borrar editores" (es_editor() = admin O almacenista, ver
-- 0002) -- esa policy no distingue de que subcarpeta del bucket es el
-- archivo, asi que un almacenista podia borrar una foto de galeria/ llamando
-- el storage directo aunque la fila de la tabla se lo negara. Postgres junta
-- varias policies permisivas con OR, asi que no basta con agregar una mas
-- estricta: hay que sacar galeria/ de la policy vieja (que sigue aplicando
-- igual a materiales/, referencias/ y movimientos/) y dejarla solo en una
-- nueva, exclusiva para admin.
--
-- Nota: esto ya se corrio a mano en produccion (2026-10-15) antes de que
-- este archivo existiera -- queda aca para que el historial de migraciones
-- en el repo coincida con lo que ya tiene la base de datos.

drop policy if exists "evidencias: borrar editores" on storage.objects;
create policy "evidencias: borrar editores" on storage.objects for delete
  using (bucket_id = 'evidencias' and public.es_editor() and (storage.foldername(name))[1] is distinct from 'galeria');

drop policy if exists "evidencias: borrar galeria solo admin" on storage.objects;
create policy "evidencias: borrar galeria solo admin" on storage.objects for delete
  using (bucket_id = 'evidencias' and (storage.foldername(name))[1] = 'galeria' and public.es_admin());
