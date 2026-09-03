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
  // El coordinador pasa cualquier RoleGate que incluya "admin", igual que del
  // lado del backend (ver esAdminEquivalente en src/middleware/auth.js).
  const permitido = usuario && (roles.includes(usuario.rol) || (usuario.rol === "coordinador" && roles.includes("admin")));
  if (!permitido) return <Navigate to="/" replace />;
  return <Outlet />;
}
