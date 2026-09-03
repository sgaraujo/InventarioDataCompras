import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiClientError } from "../api/client";

export function Login() {
  const { usuario, cargando, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mensajeExito = (location.state as { mensaje?: string } | null)?.mensaje;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (cargando) return <div className="loading-screen">Cargando...</div>;
  if (usuario) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/img/logo1.png" alt="Inteegra" />
        <h1>Control de Inventarios</h1>
        {mensajeExito && <div className="login-msg login-msg--ok">{mensajeExito}</div>}
        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input
              type="email"
              id="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <input
              type="password"
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={enviando}>
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <div id="login-error">{error}</div>
      </div>
      <div className="credito-app">by Equipo Transformación Digital - Inteegra</div>
    </div>
  );
}
