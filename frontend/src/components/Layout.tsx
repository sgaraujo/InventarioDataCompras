import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Boxes, PackagePlus, ScrollText, Menu, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROL_LABEL } from "../lib/labels";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Resumen general del inventario" },
  "/materiales": { title: "Materiales", subtitle: "Catálogo completo con existencias actuales" },
  "/movimientos": { title: "Movimientos", subtitle: "Registrar entradas y salidas de material" },
  "/historial": { title: "Historial", subtitle: "Historial completo de entradas y salidas" },
};

export function Layout() {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const meta = PAGE_META[location.pathname] ?? PAGE_META["/"];

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
          {(usuario?.rol === "admin" || usuario?.rol === "almacenista") && (
            <NavLink to="/movimientos" className={claseNavItem}>
              <PackagePlus className="icon" size={17} /> Movimientos
            </NavLink>
          )}
          <NavLink to="/historial" className={claseNavItem}>
            <ScrollText className="icon" size={17} /> Historial
          </NavLink>
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
        </header>

        <Outlet />
      </div>

      <div className="credito-app">by Equipo Transformación Digital - Inteegra</div>
    </div>
  );
}
