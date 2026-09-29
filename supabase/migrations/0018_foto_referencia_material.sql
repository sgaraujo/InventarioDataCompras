-- Referencia fotografica de cada referencia/serial (ver 0010): cada unidad
-- individual de un material con serial puede tener su propia foto, aparte
-- de materiales.foto (que es la del material en general). Se guarda igual
-- que materiales.foto: la URL publica del archivo en el bucket "evidencias".
-- Idempotente.

alter table public.material_referencias
  add column if not exists foto text;

-- La vista tiene que exponer la columna nueva. CREATE OR REPLACE solo deja
-- agregar columnas al final, asi que se recrea entera (mismo criterio que
-- 0011) y se le vuelve a poner security_invoker (ver 0012).
drop view if exists public.material_referencias_estado;

create view public.material_referencias_estado
with (security_invoker = true) as
select
  mr.id,
  mr.material_id,
  mr.codigo,
  mr.ubicacion,
  mr.foto,
  mr.creado_en,
  coalesce(mov.stock, 0) as stock_disponible
from public.material_referencias mr
left join lateral (
  select sum(case when m.tipo = 'entrada' then m.cantidad else -m.cantidad end) as stock
  from public.movimientos m
  where m.referencia_id = mr.id
) mov on true;

grant select on public.material_referencias_estado to authenticated;
