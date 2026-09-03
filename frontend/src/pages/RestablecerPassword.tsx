import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiClientError } from "../api/client";

export function RestablecerPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setEnviando(true);
    try {
      await api.post("/api/auth/restablecer-password", { token, password });
      navigate("/login", { state: { mensaje: "Contraseña actualizada. Ya puedes iniciar sesión." } });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No se pudo restablecer la contraseña");
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <img src="/img/logo1.png" alt="Inteegra" />
          <h1>Enlace inválido</h1>
          <div className="login-msg">Este enlace no es válido. Solicita uno nuevo.</div>
          <div className="login-links">
            <Link to="/olvide-password">Solicitar enlace nuevo</Link>
          </div>
        </div>
        <div className="credito-app">by Equipo Transformación Digital - Inteegra</div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/img/logo1.png" alt="Inteegra" />
        <h1>Crear nueva contraseña</h1>
        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="password">Contraseña nueva</label>
            <input
              type="password"
              id="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="confirmar">Confirmar contraseña</label>
            <input
              type="password"
              id="confirmar"
              required
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </div>
          <button type="submit" disabled={enviando}>
            {enviando ? "Guardando..." : "Guardar contraseña"}
          </button>
          <div id="login-error">{error}</div>
        </form>
        {error === "El enlace no es válido o ya expiró" && (
          <div className="login-links">
            <Link to="/olvide-password">Solicitar un enlace nuevo</Link>
          </div>
        )}
        <div className="login-links">
          <Link to="/login">Volver a iniciar sesión</Link>
        </div>
      </div>
      <div className="credito-app">by Equipo Transformación Digital - Inteegra</div>
    </div>
  );
}
