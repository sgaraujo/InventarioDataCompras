-- "Public Bucket Allows Listing" (Security Advisor): el bucket "evidencias"
-- ya es publico, lo que sirve cada archivo por su URL sin pasar por RLS --
-- la policy de SELECT que se habia agregado ahi era de mas y ademas dejaba
-- listar el contenido completo del bucket. Se quita: las fotos individuales
-- siguen cargando igual (via URL publica), pero ya no se puede pedir la
-- lista completa de archivos.

drop policy if exists "evidencias: lectura publica" on storage.objects;
