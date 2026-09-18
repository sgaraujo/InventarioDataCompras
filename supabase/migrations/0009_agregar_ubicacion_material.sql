-- Agrega el campo "ubicacion" a materiales, para identificar donde esta
-- fisicamente cada material dentro del inventario. Idempotente.

alter table public.materiales
  add column if not exists ubicacion text;
