-- El Security Advisor de Supabase marco material_referencias_estado como
-- SECURITY DEFINER (por defecto en Postgres, una vista corre con los
-- permisos de quien la creo, no de quien la consulta) -- eso significaba que
-- un usuario inactivo podia leer esta vista puntual saltandose el RLS de
-- perfiles.activo que si se respeta en el resto de la app. security_invoker
-- (Postgres 15+) hace que la vista corra con los permisos reales de quien
-- pregunta, como debe ser.

alter view public.material_referencias_estado set (security_invoker = true);
