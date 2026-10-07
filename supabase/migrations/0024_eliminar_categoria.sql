-- Permite borrar categorias -- solo admin (igual que crearlas). Si la
-- categoria esta en uso por algun material, el FK materiales.categoria_id
-- (sin ON DELETE) bloquea el borrado con un error claro, no la deja
-- huerfana ni borra materiales en cascada.

drop policy if exists "categorias: borrar admin" on public.categorias;
create policy "categorias: borrar admin" on public.categorias for delete
  using (es_admin());
