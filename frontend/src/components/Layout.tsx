import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  ScrollText,
  ClipboardCheck,
  Undo2,
  Tags,
  Users,
  ClipboardList,
  Menu,
  LogOut,
  Wrench,
  Route,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROL_LABEL, esAdmin } from "../lib/labels";
import { NotificationBell } from "./NotificationBell";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Resumen general del inventario de materiales" },
  "/materiales": { title: "Materiales", subtitle: "Catálogo completo con existencias actuales" },
  "/entradas": { title: "Entradas", subtitle: "Registrar entradas de material" },
  "/historial": { title: "Historial", subtitle: "Historial completo de entradas y salidas de material" },
  "/salidas": { title: "Salidas", subtitle: "Solicitudes de salida y aprobación del supervisor" },
  "/devoluciones": { title: "Devoluciones", subtitle: "Reporte de uso real y disposición final de sobrantes" },
  "/trazabilidad": { title: "Trazabilidad", subtitle: "Recorrido completo de cada RF, de creada a cerrada" },
  "/usuarios": { title: "Usuarios", subtitle: "Gestión de cuentas y roles del sistema" },
  "/auditoria": { title: "Auditoría", subtitle: "Historial de cambios en el sistema" },
  "/catalogos": { title: "Catálogos", subtitle: "Categorías, proveedores y almacenes del catálogo de materiales" },
  "/herramientas": { title: "Herramientas", subtitle: "Préstamo y devolución de herramientas retornables" },
};

export function Layout() {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const meta = PAGE_META[location.pathname] ?? PAGE_META["/"];
  const enMateriales = location.pathname === "/materiales";

  // Cierra el drawer cada vez que se navega a otra vista (mobile/tablet)
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const claseNavItem = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? " active" : ""}`;

  return (
    <div className="app">
      {menuAbierto && <div className="sidebar__backdrop" onClick={() => setMenuAbierto(false)} />}

      <aside className={`sidebar${menuAbierto ? " sidebar--abierto" : ""}`}>
        <div className="sidebar__brand">
          <img src="/img/logo1.png" alt="Inteegra" className="sidebar__logo" />
        </div>
        <nav className="sidebar__nav">
          <NavLink to="/" end className={claseNavItem}>
            <LayoutDashboard className="icon" size={17} /> Dashboard
          </NavLink>
          <NavLink to="/materiales" className={claseNavItem}>
            <Boxes className="icon" size={17} /> Materiales
          </NavLink>
          {(esAdmin(usuario) || usuario?.rol === "almacenista") && (
            <NavLink to="/entradas" className={claseNavItem}>
              <PackagePlus className="icon" size={17} /> Entradas
            </NavLink>
          )}
          <NavLink to="/salidas" className={claseNavItem}>
            <ClipboardCheck className="icon" size={17} /> Salidas
          </NavLink>
          <NavLink to="/devoluciones" className={claseNavItem}>
            <Undo2 className="icon" size={17} /> Devoluciones
          </NavLink>
          {usuario?.rol !== "almacenista" && (
            <NavLink to="/trazabilidad" className={claseNavItem}>
              <Route className="icon" size={17} /> Trazabilidad
            </NavLink>
          )}
          {(esAdmin(usuario) || usuario?.rol === "almacenista") && (
            <NavLink to="/catalogos" className={claseNavItem}>
              <Tags className="icon" size={17} /> Catálogos
            </NavLink>
          )}
          {usuario?.rol !== "consulta" && (
            <NavLink to="/herramientas" className={claseNavItem}>
              <Wrench className="icon" size={17} /> Herramientas
            </NavLink>
          )}
          {esAdmin(usuario) && (
            <NavLink to="/usuarios" className={claseNavItem}>
              <Users className="icon" size={17} /> Usuarios
            </NavLink>
          )}
          <NavLink to="/historial" className={claseNavItem}>
            <ScrollText className="icon" size={17} /> Historial
          </NavLink>
          {esAdmin(usuario) && (
            <NavLink to="/auditoria" className={claseNavItem}>
              <ClipboardList className="icon" size={17} /> Auditoría
            </NavLink>
          )}
        </nav>
        <div className="sidebar__footer">
          {usuario && (
            <div id="usuario-info">
              {usuario.nombre}
              <br />
              <span className="usuario-rol">{ROL_LABEL[usuario.rol]}</span>
            </div>
          )}
          <button type="button" className="btn-logout" onClick={handleLogout}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__titulo-wrap">
            <button
              type="button"
              className="btn-menu"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1>{meta.title}</h1>
              <div className="topbar__subtitle">{meta.subtitle}</div>
            </div>
          </div>
          <div className="topbar__acciones">
            <div className="topbar__search" style={{ visibility: enMateriales ? "visible" : "hidden" }}>
              <input
                type="text"
                placeholder="Buscar por nombre o código..."
                value={searchParams.get("q") ?? ""}
                onChange={(e) => {
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value) next.set("q", e.target.value);
                  else next.delete("q");
                  setSearchParams(next, { replace: true });
                }}
              />
            </div>
            <NotificationBell />
          </div>
        </header>

        <Outlet />
      </div>

      <div className="credito-app">by Equipo Transformación Digital - Inteegra</div>
    </div>
  );
}
