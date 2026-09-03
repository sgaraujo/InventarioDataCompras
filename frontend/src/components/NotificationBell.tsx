import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { api } from "../api/client";
import type { Notificacion } from "../api/types";

const INTERVALO_REFRESCO_MS = 30000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function cargar() {
    api.get<Notificacion[]>("/api/notificaciones").then(setNotificaciones);
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("click", onClickFuera, true);
    return () => document.removeEventListener("click", onClickFuera, true);
  }, []);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  async function marcarLeida(n: Notificacion) {
    if (!n.leida) {
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      await api.post(`/api/notificaciones/${n.id}/leer`);
    }
    setAbierto(false);
    if (n.entidad === "solicitudes_salida" && n.entidad_id) {
      navigate(`/salidas?resaltar=${n.entidad_id}`);
    } else if (n.entidad === "solicitud_salida_devoluciones" && n.entidad_id) {
      navigate(`/devoluciones?resaltar=${n.entidad_id}`);
    } else if (n.entidad === "materiales" && n.entidad_id) {
      navigate(`/materiales?resaltar=${n.entidad_id}`);
    }
  }

  async function marcarTodasLeidas() {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    await api.post("/api/notificaciones/leer-todas");
  }

  // No navega ni marca leida -- solo borra esa notificacion puntual, para que
  // la lista no se llene de anios de historial si no interesa conservarla.
  async function eliminarNotificacion(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    setNotificaciones((prev) => prev.filter((n) => n.id !== id));
    await api.delete(`/api/notificaciones/${id}`);
  }

  async function vaciarTodas() {
    setNotificaciones([]);
    await api.delete("/api/notificaciones");
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className="notif-bell__boton"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Notificaciones"
      >
        <Bell size={19} />
        {noLeidas > 0 && <span className="notif-bell__contador">{noLeidas > 9 ? "9+" : noLeidas}</span>}
      </button>
      {abierto && (
        <div className="notif-bell__panel">
          <div className="notif-bell__header">
            <span>Notificaciones</span>
            <div className="notif-bell__header-acciones">
              {noLeidas > 0 && (
                <button type="button" onClick={marcarTodasLeidas}>
                  Marcar todas leídas
                </button>
              )}
              {notificaciones.length > 0 && (
                <button type="button" onClick={vaciarTodas}>
                  Vaciar todas
                </button>
              )}
            </div>
          </div>
          <div className="notif-bell__lista">
            {notificaciones.length === 0 ? (
              <div className="notif-bell__vacio">No tienes notificaciones.</div>
            ) : (
              notificaciones.map((n) => (
                <div
                  key={n.id}
                  className={`notif-bell__item${n.leida ? "" : " no-leida"}`}
                  onClick={() => marcarLeida(n)}
                >
                  <button
                    type="button"
                    className="notif-bell__borrar"
                    aria-label="Borrar notificación"
                    onClick={(e) => eliminarNotificacion(e, n.id)}
                  >
                    <X size={13} />
                  </button>
                  <div>{n.mensaje}</div>
                  <div className="notif-bell__fecha">{new Date(n.creado_en).toLocaleString("es-CO")}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
