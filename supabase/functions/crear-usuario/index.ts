import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function error(mensaje: string, status = 400) {
  return new Response(JSON.stringify({ error: mensaje }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Crea un usuario en Supabase Auth + su fila en perfiles con el rol elegido.
// Requiere el service role key (nunca expuesta al navegador) -- por eso vive
// como Edge Function y no como llamada directa desde el frontend. Solo un
// admin puede invocarla (se valida el rol del que llama antes de crear nada).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return error("Falta la sesión", 401);

    const clienteUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await clienteUsuario.auth.getUser();
    if (!user) return error("Sesión inválida", 401);

    const { data: perfil } = await clienteUsuario.from("perfiles").select("rol").eq("id", user.id).single();
    if (perfil?.rol !== "admin") return error("Solo un administrador puede crear usuarios", 403);

    const { email, password, nombre, rol } = await req.json();
    if (!email || !password || !nombre || !rol) return error("Faltan datos (email, password, nombre, rol)");
    if (!["admin", "almacenista", "consulta"].includes(rol)) return error("Rol inválido");
    if (String(password).length < 6) return error("La contraseña debe tener al menos 6 caracteres");

    const clienteAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: nuevo, error: errorCrear } = await clienteAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errorCrear) return error(errorCrear.message);

    // El trigger on_auth_user_created (ver supabase/migrations/0001_init.sql)
    // ya inserto la fila en perfiles con rol "consulta" e "inactivo" por
    // defecto (ver 0005_bloquear_autoregistro.sql -- asi un auto-registro
    // directo contra la API de Auth, sin pasar por aca, no queda con acceso).
    // Al crear por el canal correcto (este admin autenticado) se activa de
    // una vez, junto con el rol y nombre elegidos en el formulario.
    const { error: errorPerfil } = await clienteAdmin
      .from("perfiles")
      .update({ nombre, rol, activo: true })
      .eq("id", nuevo.user!.id);
    if (errorPerfil) {
      // Sin esto quedaba un usuario huerfano en Auth (creado pero con el
      // perfil por defecto sin actualizar) y reintentar con el mismo email
      // fallaba para siempre.
      await clienteAdmin.auth.admin.deleteUser(nuevo.user!.id);
      return error(errorPerfil.message);
    }

    return new Response(JSON.stringify({ ok: true, id: nuevo.user!.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Error desconocido", 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function error(mensaje: string, status = 400) {
  return new Response(JSON.stringify({ error: mensaje }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Crea un usuario en Supabase Auth + su fila en perfiles con el rol elegido.
// Requiere el service role key (nunca expuesta al navegador) -- por eso vive
// como Edge Function y no como llamada directa desde el frontend. Solo un
// admin puede invocarla (se valida el rol del que llama antes de crear nada).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return error("Falta la sesión", 401);

    const clienteUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await clienteUsuario.auth.getUser();
    if (!user) return error("Sesión inválida", 401);

    const { data: perfil } = await clienteUsuario.from("perfiles").select("rol").eq("id", user.id).single();
    if (perfil?.rol !== "admin") return error("Solo un administrador puede crear usuarios", 403);

    const { email, password, nombre, rol } = await req.json();
    if (!email || !password || !nombre || !rol) return error("Faltan datos (email, password, nombre, rol)");
    if (!["admin", "almacenista", "consulta"].includes(rol)) return error("Rol inválido");
    if (String(password).length < 6) return error("La contraseña debe tener al menos 6 caracteres");

    const clienteAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: nuevo, error: errorCrear } = await clienteAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errorCrear) return error(errorCrear.message);

    // El trigger on_auth_user_created (ver supabase/migrations/0001_init.sql)
    // ya inserto la fila en perfiles con rol "consulta" por defecto -- se
    // actualiza al rol y nombre elegidos en el formulario.
    const { error: errorPerfil } = await clienteAdmin
      .from("perfiles")
      .update({ nombre, rol })
      .eq("id", nuevo.user!.id);
    if (errorPerfil) {
      // Sin esto quedaba un usuario huerfano en Auth (creado pero con el
      // perfil por defecto sin actualizar) y reintentar con el mismo email
      // fallaba para siempre.
      await clienteAdmin.auth.admin.deleteUser(nuevo.user!.id);
      return error(errorPerfil.message);
    }

    return new Response(JSON.stringify({ ok: true, id: nuevo.user!.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Error desconocido", 500);
  }
});
WW