import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiClientError } from "../api/client";
import type { Usuario } from "../api/types";

interface AuthContextValue {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get<{ usuario: Usuario }>("/api/auth/me")
      .then((data) => setUsuario(data.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api.post<{ usuario: Usuario }>("/api/auth/login", { email, password });
    setUsuario(data.usuario);
  }

  async function logout() {
    try {
      await api.post("/api/auth/logout");
    } catch (err) {
      if (!(err instanceof ApiClientError)) throw err;
    }
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
