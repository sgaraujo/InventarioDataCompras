-- Agrega el centro de costo FLM para NETCOL INGENIERIA SAS BIC (solicitado
-- por correo). Idempotente via el unique (empresa_id, nombre) de
-- centros_costo. Pegar en el SQL Editor o correr con psql.

insert into public.centros_costo (empresa_id, nombre)
select e.id, 'FLM'
from public.empresas e
where e.nombre = 'NETCOL INGENIERIA SAS BIC'
on conflict (empresa_id, nombre) do nothing;
