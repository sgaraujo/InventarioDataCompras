-- "Multiple Permissive Policies" (Performance Advisor): en empresas,
-- centros_costo, solicitantes, materiales y material_referencias, la policy
-- "escritura editores" usaba FOR ALL, que incluye SELECT -- se solapaba con
-- la policy dedicada "lectura activos", obligando a Postgres a evaluar las
-- dos en cada lectura. Se separa en insert/update/delete (sin select), mismo
-- patron que ya se uso bien en movimientos. El permiso real no cambia en
-- nada, solo se deja de duplicar la evaluacion en SELECT.

do $$
declare
  t text;
begin
  foreach t in array array['empresas', 'centros_costo', 'solicitantes', 'materiales', 'material_referencias']
  loop
    execute format('drop policy if exists %I on public.%I', t || ': escritura editores', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.es_editor())',
      t || ': crear editores', t
    );
    execute format(
      'create policy %I on public.%I for update using (public.es_editor()) with check (public.es_editor())',
      t || ': editar editores', t
    );
    execute format(
      'create policy %I on public.%I for delete using (public.es_editor())',
      t || ': borrar editores', t
    );
  end loop;
end $$;
