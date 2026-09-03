import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Rol } from "../api/types";

export function ProtectedRoute() {
  const { usuario, cargando } = useAuth();

  if (cargando) return <div className="loading-screen">Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function RoleGate({ roles }: { roles: Rol[] }) {
  const { usuario } = useAuth();
  const permitido = usuario && roles.includes(usuario.rol);
  if (!permitido) return <Navigate to="/" replace />;
  return <Outlet />;
}
