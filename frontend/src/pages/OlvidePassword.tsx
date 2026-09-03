import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../api/client";

export function OlvidePassword() {
  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const data = await api.post<{ mensaje: string }>("/api/auth/olvide-password", { email });
      setMensaje(data.mensaje);
      setEnviado(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No se pudo procesar la solicitud");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/img/logo1.png" alt="Inteegra" />
        <h1>Recuperar contraseña</h1>
        {enviado ? (
          <div className="login-msg login-msg--ok">{mensaje}</div>
        ) : (
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
            <button type="submit" disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar enlace"}
            </button>
            <div id="login-error">{error}</div>
          </form>
        )}
        <div className="login-links">
          <Link to="/login">Volver a iniciar sesión</Link>
        </div>
      </div>
      <div className="credito-app">by Equipo Transformación Digital - Inteegra</div>
    </div>
  );
}
