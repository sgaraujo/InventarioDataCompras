-- El auto-registro de Supabase Auth esta abierto (verificado: un POST a
-- /auth/v1/signup con solo la anon key crea una cuenta real) y el toggle de
-- "solo admin crea usuarios" no aparece en la version actual del dashboard
-- (o esta en otro lado). En vez de depender de encontrarlo, se cierra el
-- hueco donde de verdad importa: cualquier perfil nuevo nace INACTIVO por
-- defecto, y como toda policy de lectura ya exige perfiles.activo (ver
-- 0003_seguridad_stock_auditoria.sql), un auto-registro queda con sesion
-- valida pero cero acceso a datos hasta que un admin lo active a mano desde
-- /usuarios -- donde ademas queda visible en la lista, para poder detectarlo.
--
-- crear-usuario (la Edge Function) activa el perfil explicitamente cuando el
-- admin lo crea por el canal correcto -- ver el update agregado ahi.
--
-- Idempotente, mismo criterio que las migraciones anteriores.

create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email), 'consulta', false)
  on conflict (id) do nothing;
  return new;
end;
$$;
