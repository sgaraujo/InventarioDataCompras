import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute, RoleGate } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Materiales } from "./pages/Materiales";
import { Movimientos } from "./pages/Movimientos";
import { Historial } from "./pages/Historial";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/materiales" element={<Materiales />} />
              <Route path="/historial" element={<Historial />} />
              <Route element={<RoleGate roles={["admin", "almacenista"]} />}>
                <Route path="/movimientos" element={<Movimientos />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
