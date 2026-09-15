-- Añadir columna acta_entrega para soportes de salidas (texto con URL en storage)
alter table if exists public.movimientos
  add column if not exists acta_entrega text;

-- No se requieren cambios en policies si se usa la misma policy de insert/select.
