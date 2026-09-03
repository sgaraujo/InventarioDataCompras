import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiClientError } from "../api/client";
import type { Almacen, Rol, Usuario } from "../api/types";
import { ROL_LABEL } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { Paginacion } from "../components/Paginacion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, Trash2, AlertTriangle, Mail } from "lucide-react";

const TAMANO_PAGINA = 25;

const FORM_VACIO = {
  id: null as number | null,
  nombre: "",
  email: "",
  password: "",
  rol: "almacenista" as Rol,
  activo: true,
  almacen_id: null as number | null,
};

export function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<{ id: number; texto: string } | null>(null);
  const [reenviandoId, setReenviandoId] = useState<number | null>(null);
  const [avisoReenvio, setAvisoReenvio] = useState<{ id: number; texto: string; tipo: "ok" | "error" } | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Usuario | null>(null);
  const [filtroActivo, setFiltroActivo] = useState("true"); // por defecto solo Activos, para no ensuciar la lista con gente que ya no trabaja ahi

  const editando = form.id !== null;
  const formInicialRef = useRef(FORM_VACIO);

  function cargarUsuarios() {
    setCargando(true);
    const params = new URLSearchParams();
    if (filtroActivo) params.set("activo", filtroActivo);
    return api
      .get<Usuario[]>(`/api/usuarios?${params.toString()}`)
      .then(setUsuarios)
      .finally(() => setCargando(false));
  }

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    usuarios,
    TAMANO_PAGINA
  );

  // No reinicia a la pagina 1 en la primera carga -- solo cuando el usuario
  // de verdad cambia el filtro.
  const primeraCargaRef = useRef(true);
  useEffect(() => {
    cargarUsuarios();
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroActivo]);

  useEffect(() => {
    api.get<Almacen[]>("/api/almacenes").then(setAlmacenes);
  }, []);

  function abrirNuevo() {
    setForm(FORM_VACIO);
    formInicialRef.current = FORM_VACIO;
    setMensaje(null);
    setMostrarForm(true);
  }

  function editar(u: Usuario) {
    const datos = {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      password: "",
      rol: u.rol,
      activo: u.activo,
      almacen_id: u.almacen_id,
    };
    setForm(datos);
    formInicialRef.current = datos;
    setMensaje(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setMensaje(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const cuerpo: Record<string, unknown> = {
        nombre: form.nombre,
        email: form.email,
        rol: form.rol,
        password: form.password || undefined,
        almacen_id: form.almacen_id || undefined,
      };
      if (editando) cuerpo.activo = form.activo;

      if (editando) {
        await api.put(`/api/usuarios/${form.id}`, cuerpo);
        setMostrarForm(false);
        setForm(FORM_VACIO);
      } else {
        // correo_enviado: true = se le puso invitacion y salio bien | false = se
        // le puso invitacion pero el envio fallo (el usuario se crea igual,
        // queda "invitacion_pendiente" y se puede reenviar desde la lista) |
        // null = no aplica, el admin le puso contraseña a mano.
        const creado = await api.post<Usuario & { correo_enviado: boolean | null }>("/api/usuarios", cuerpo);
        if (creado.correo_enviado === null) {
          setMostrarForm(false);
          setForm(FORM_VACIO);
        } else {
          // Se deja el modal abierto para que el admin vea la confirmacion
          // (si se cerrara solo, no habria forma de enterarse sin ir a
          // revisar la bandeja del usuario nuevo). Se limpia el formulario
          // para que quede listo para el siguiente.
          setForm(FORM_VACIO);
          formInicialRef.current = FORM_VACIO;
          setMensaje(
            creado.correo_enviado
              ? { texto: "Usuario creado. Correo de bienvenida enviado exitosamente.", tipo: "ok" }
              : {
                  texto: "Usuario creado, pero no se pudo enviar el correo de bienvenida. Puedes reenviarlo desde la lista de usuarios.",
                  tipo: "error",
                }
          );
        }
      }
      await cargarUsuarios();
    } catch (err) {
      setMensaje({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar el usuario",
        tipo: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarUsuario(u: Usuario) {
    setConfirmandoEliminar(null);
    setEliminandoId(u.id);
    setErrorEliminar(null);
    try {
      await api.delete(`/api/usuarios/${u.id}`);
      await cargarUsuarios();
    } catch (err) {
      setErrorEliminar({
        id: u.id,
        texto: err instanceof ApiClientError ? err.message : "Error al eliminar el usuario",
      });
    } finally {
      setEliminandoId(null);
    }
  }

  async function reenviarInvitacion(u: Usuario) {
    setReenviandoId(u.id);
    setAvisoReenvio(null);
    try {
      await api.post(`/api/usuarios/${u.id}/reenviar-invitacion`);
      setAvisoReenvio({ id: u.id, texto: "Correo reenviado exitosamente.", tipo: "ok" });
    } catch (err) {
      setAvisoReenvio({
        id: u.id,
        texto: err instanceof ApiClientError ? err.message : "Error al reenviar el correo",
        tipo: "error",
      });
    } finally {
      setReenviandoId(null);
    }
  }

  async function desactivarUsuario(u: Usuario) {
    setEliminandoId(u.id);
    try {
      await api.put(`/api/usuarios/${u.id}`, { nombre: u.nombre, email: u.email, rol: u.rol, activo: false });
      setErrorEliminar(null);
      await cargarUsuarios();
    } catch (err) {
      setErrorEliminar({
        id: u.id,
        texto: err instanceof ApiClientError ? err.message : "Error al desactivar el usuario",
      });
    } finally {
      setEliminandoId(null);
    }
  }

  return (
    <section className="view">
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
          + Nuevo usuario
        </button>
      </div>

      {mostrarForm && (
        <Modal
          titulo={editando ? `Editar usuario: ${form.nombre}` : "Nuevo usuario"}
          onClose={cerrarForm}
          confirmarCierre={JSON.stringify(form) !== JSON.stringify(formInicialRef.current)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <div>
              <label>Nombre</label>
              <input
                type="text"
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <label>Correo</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label>{editando ? "Nueva contraseña (opcional)" : "Contraseña (opcional)"}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {!editando && (
                <small className="texto-ayuda">
                  Déjala vacía para enviarle al correo un enlace y que la persona cree su propia contraseña.
                </small>
              )}
            </div>
            <div>
              <label>Rol</label>
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })} required>
                <option value="admin">Administrador</option>
                <option value="coordinador">Coordinador</option>
                <option value="supervisor">Supervisor</option>
                <option value="almacenista">Almacenista</option>
                <option value="tecnico-ejecutor">Técnico</option>
                <option value="consulta">Consulta</option>
              </select>
            </div>
            <div>
              <label>Almacén (opcional)</label>
              <select
                value={form.almacen_id ?? ""}
                onChange={(e) => setForm({ ...form, almacen_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Sin asignar</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
            {editando && (
              <div>
                <label>Estado</label>
                <select
                  value={String(form.activo)}
                  onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            )}
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear usuario"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarForm}>
              Cancelar
            </button>
          </form>
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </Modal>
      )}

      <div className="panel">
        <h2>Usuarios del sistema</h2>
        <div className="filtros-mov">
          <div>
            <label>Estado</label>
            <select value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value)}>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
              <option value="">Todos</option>
            </select>
          </div>
        </div>
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Almacén</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No hay usuarios registrados.
                  </td>
                </tr>
              ) : (
                pageItems.map((u) => (
                  <Fragment key={u.id}>
                    <tr>
                      <td>{u.nombre}</td>
                      <td>{u.email}</td>
                      <td>{ROL_LABEL[u.rol]}</td>
                      <td>{u.almacen_nombre || "—"}</td>
                      <td>
                        {u.invitacion_pendiente ? (
                          <span className="badge pendiente">Invitación pendiente</span>
                        ) : (
                          <span className={`badge ${u.activo ? "ok" : "sin_existencias"}`}>
                            {u.activo ? "Activo" : "Inactivo"}
                          </span>
                        )}
                      </td>
                      <td>{new Date(u.creado_en).toLocaleDateString("es-CO")}</td>
                      <td>
                        <div className="acciones-solicitud">
                          <button type="button" className="btn-editar" onClick={() => editar(u)}>
                            <Pencil size={14} /> Editar
                          </button>
                          {u.invitacion_pendiente && (
                            <button
                              type="button"
                              className="btn-reenviar"
                              disabled={reenviandoId === u.id}
                              onClick={() => reenviarInvitacion(u)}
                            >
                              <Mail size={14} /> {reenviandoId === u.id ? "Enviando..." : "Reenviar correo"}
                            </button>
                          )}
                          {u.id !== usuarioActual?.id && (
                            <button
                              type="button"
                              className="btn-rechazar"
                              disabled={eliminandoId === u.id}
                              onClick={() => setConfirmandoEliminar(u)}
                            >
                              <Trash2 size={14} /> Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {avisoReenvio?.id === u.id && (
                      <tr className="fila-aviso">
                        <td colSpan={7}>
                          <div className={`mensaje-form ${avisoReenvio.tipo}`} style={{ margin: 0 }}>
                            {avisoReenvio.texto}
                          </div>
                        </td>
                      </tr>
                    )}
                    {errorEliminar?.id === u.id && (
                      <tr className="fila-aviso">
                        <td colSpan={7}>
                          <div className="aviso-bloqueo">
                            <AlertTriangle size={16} />
                            <div className="aviso-bloqueo__texto">
                              <strong>No se pudo eliminar a {u.nombre}</strong>
                              <span>{errorEliminar.texto}</span>
                            </div>
                            {u.activo && (
                              <button
                                type="button"
                                className="btn-secundario"
                                disabled={eliminandoId === u.id}
                                onClick={() => desactivarUsuario(u)}
                              >
                                Desactivar en su lugar
                              </button>
                            )}
                            <button type="button" className="aviso-bloqueo__cerrar" onClick={() => setErrorEliminar(null)}>
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Paginacion
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
          desde={desde}
          hasta={hasta}
          total={total}
          etiqueta="usuarios"
          onCambiarPagina={irAPagina}
        />
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={`¿Eliminar el usuario "${confirmandoEliminar.nombre}"?`}
          descripcion="Esta acción no se puede deshacer."
          onConfirmar={() => eliminarUsuario(confirmandoEliminar)}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </section>
  );
}
