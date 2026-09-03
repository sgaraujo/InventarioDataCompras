import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiClientError } from "../api/client";
import { supabase } from "../api/supabaseClient";
import type { Usuario } from "../api/types";

interface AuthContextValue {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// El perfil (rol, nombre, activo) vive en la tabla propia "perfiles",
// enlazada 1:1 a auth.users -- Supabase Auth solo maneja credenciales/sesion.
async function cargarUsuario(id: string, email: string | undefined): Promise<Usuario | null> {
  const { data, error } = await supabase.from("perfiles").select("*").eq("id", id).single();
  if (error || !data) return null;
  return {
    id: data.id,
    nombre: data.nombre,
    email: email ?? "",
    rol: data.rol,
    activo: data.activo,
    creado_en: data.creado_en,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setCargando(false);
        return;
      }
      cargarUsuario(session.user.id, session.user.email).then((u) => {
        setUsuario(u);
        setCargando(false);
      });
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!session) {
        setUsuario(null);
        return;
      }
      cargarUsuario(session.user.id, session.user.email).then(setUsuario);
    });

    return () => suscripcion.subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiClientError(error.message, error.status ?? 401);
    const u = await cargarUsuario(data.user.id, data.user.email);
    if (!u) throw new ApiClientError("No se encontro el perfil de este usuario", 403);
    setUsuario(u);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
