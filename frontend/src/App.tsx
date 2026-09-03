import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute, RoleGate } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { OlvidePassword } from "./pages/OlvidePassword";
import { RestablecerPassword } from "./pages/RestablecerPassword";
import { Dashboard } from "./pages/Dashboard";
import { Materiales } from "./pages/Materiales";
import { Entradas } from "./pages/Entradas";
import { Historial } from "./pages/Historial";
import { SolicitudesSalida } from "./pages/SolicitudesSalida";
import { Devoluciones } from "./pages/Devoluciones";
import { Usuarios } from "./pages/Usuarios";
import { Auditoria } from "./pages/Auditoria";
import { Catalogos } from "./pages/Catalogos";
import { Herramientas } from "./pages/Herramientas";
import { Trazabilidad } from "./pages/Trazabilidad";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/olvide-password" element={<OlvidePassword />} />
          <Route path="/restablecer-password" element={<RestablecerPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/materiales" element={<Materiales />} />
              <Route path="/historial" element={<Historial />} />
              <Route path="/salidas" element={<SolicitudesSalida />} />
              <Route path="/devoluciones" element={<Devoluciones />} />
              {/* Almacenista no la ve -- su trabajo ya esta cubierto por sus
                  propias colas filtradas en Salidas/Devoluciones. */}
              <Route element={<RoleGate roles={["admin", "supervisor", "tecnico-ejecutor", "consulta"]} />}>
                <Route path="/trazabilidad" element={<Trazabilidad />} />
              </Route>
              <Route element={<RoleGate roles={["admin", "almacenista"]} />}>
                <Route path="/entradas" element={<Entradas />} />
                <Route path="/catalogos" element={<Catalogos />} />
              </Route>
              {/* Admin/almacenista ven el modulo completo; tecnico/supervisor
                  solo su propio historial de prestamos (de solo lectura) --
                  el componente decide que mostrar segun el rol. */}
              <Route element={<RoleGate roles={["admin", "almacenista", "tecnico-ejecutor", "supervisor"]} />}>
                <Route path="/herramientas" element={<Herramientas />} />
              </Route>
              <Route element={<RoleGate roles={["admin"]} />}>
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/auditoria" element={<Auditoria />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
