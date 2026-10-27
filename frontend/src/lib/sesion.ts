// Limite de tiempo de sesion por seguridad -- mismo criterio que el
// maxAge de 8 horas del cookie de sesion en ProyectoDatacenter. Supabase
// Auth por defecto NO tiene esto: el refresh token se sigue renovando solo
// de forma indefinida mientras el navegador siga abierto, asi que sin esto
// una sesion se queda iniciada aunque pasen dias. Es un limite absoluto
// desde el login (no se reinicia con la actividad, igual que el cookie de
// express-session sin "rolling").
export const DURACION_MAXIMA_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas

const CLAVE_INICIO = "sesion_iniciada_en";
const CLAVE_AVISO_EXPIRADA = "sesion_expirada_aviso";

export function marcarInicioSesion(): void {
  localStorage.setItem(CLAVE_INICIO, String(Date.now()));
}

export function limpiarInicioSesion(): void {
  localStorage.removeItem(CLAVE_INICIO);
}

// true si ya paso la duracion maxima desde el login. Si no hay marca
// guardada (sesion que ya estaba abierta antes de este cambio, o
// localStorage limpiado en otra pestaña) se asume que recien empieza, para
// no botar a alguien de una sin haber podido guardar la marca todavia.
export function sesionExpirada(): boolean {
  const inicio = localStorage.getItem(CLAVE_INICIO);
  if (!inicio) {
    marcarInicioSesion();
    return false;
  }
  return Date.now() - Number(inicio) > DURACION_MAXIMA_SESION_MS;
}

// El cierre forzado por expiracion pasa por ProtectedRoute (usuario queda en
// null -> redirige a /login) sin forma directa de avisarle al usuario por
// que se cerro. Se deja una marca en sessionStorage (no sobrevive a abrir
// una pestaña nueva, que es justo lo que se quiere: solo avisa en la misma
// pestaña donde se vencio) que Login.tsx lee una sola vez y borra.
export function marcarAvisoSesionExpirada(): void {
  sessionStorage.setItem(CLAVE_AVISO_EXPIRADA, "1");
}

export function tomarAvisoSesionExpirada(): boolean {
  const hay = sessionStorage.getItem(CLAVE_AVISO_EXPIRADA) === "1";
  if (hay) sessionStorage.removeItem(CLAVE_AVISO_EXPIRADA);
  return hay;
}
