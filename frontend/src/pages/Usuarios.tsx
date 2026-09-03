import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../api/supabaseClient";
import type { Rol, Usuario } from "../api/types";
import { ROL_LABEL } from "../lib/labels";
import { Modal } from "../components/Modal";

const FORM_VACIO = { email: "", password: "", nombre: "", rol: "consulta" as Rol };

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [creando, setCreando] = useState(false);

  async function cargarUsuarios() {
    setCargando(true);
    const { data } = await supabase.from("perfiles").select("*").order("creado_en", { ascending: false });
    setUsuarios((data as Usuario[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarUsuarios();
  }, []);

  function abrirNuevo() {
    setForm(FORM_VACIO);
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
    setCreando(true);
    setMensaje(null);
    try {
      const { data, error } = await supabase.functions.invoke("crear-usuario", { body: form });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMostrarForm(false);
      setForm(FORM_VACIO);
      await cargarUsuarios();
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : "Error al crear el usuario", tipo: "error" });
    } finally {
      setCreando(false);
    }
  }

  async function cambiarRol(u: Usuario, rol: Rol) {
    await supabase.from("perfiles").update({ rol }).eq("id", u.id);
    await cargarUsuarios();
  }

  async function cambiarActivo(u: Usuario) {
    await supabase.from("perfiles").update({ activo: !u.activo }).eq("id", u.id);
    await cargarUsuarios();
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
          titulo="Nuevo usuario"
          onClose={cerrarForm}
          confirmarCierre={Boolean(form.email || form.nombre || form.password)}
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
              <label>Contraseña temporal</label>
              <input
                type="text"
                required
                minLength={6}
                placeholder="Al menos 6 caracteres"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <label>Rol</label>
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
                {Object.entries(ROL_LABEL).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={creando}>
              {creando ? "Creando..." : "Crear usuario"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarForm}>
              Cancelar
            </button>
          </form>
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </Modal>
      )}

      <div className="panel">
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nombre}</td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.rol} onChange={(e) => cambiarRol(u, e.target.value as Rol)}>
                        {Object.entries(ROL_LABEL).map(([valor, etiqueta]) => (
                          <option key={valor} value={valor}>
                            {etiqueta}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.activo ? "ok" : "sin_existencias"}`}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>{new Date(u.creado_en).toLocaleDateString("es-CO")}</td>
                    <td>
                      <button type="button" className="btn-rechazar" onClick={() => cambiarActivo(u)}>
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
