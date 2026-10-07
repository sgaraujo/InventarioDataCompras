import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../api/supabaseClient";
import type { Categoria } from "../api/types";
import { esAdmin } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";

// Catalogo de categorias de material (Equipos, Herramienta, Consumibles,
// Activos Fijos...). Cualquier rol la ve, pero solo admin puede agregar una
// nueva (ver RLS en supabase/migrations/0023_categorias.sql) -- por eso el
// formulario ni el boton de "+ Nueva categoría" se pintan para los demas.
export function Categorias() {
  const { usuario } = useAuth();
  const puedeCrear = esAdmin(usuario);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Categoria | null>(null);

  async function cargarCategorias() {
    setCargando(true);
    const { data } = await supabase.from("categorias").select("*").order("nombre");
    setCategorias((data as Categoria[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarCategorias();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    const { error } = await supabase.from("categorias").insert({ nombre: nombre.trim() });
    setGuardando(false);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    setNombre("");
    setMostrarForm(false);
    await cargarCategorias();
  }

  // El FK materiales.categoria_id (sin ON DELETE) bloquea el borrado si hay
  // materiales usando esta categoria -- se muestra ese caso con un mensaje
  // claro en vez del error crudo de postgres.
  async function eliminarCategoria(c: Categoria) {
    setConfirmandoEliminar(null);
    const { error } = await supabase.from("categorias").delete().eq("id", c.id);
    if (error) {
      setMensaje({
        texto:
          error.code === "23503"
            ? `No se puede eliminar "${c.nombre}" porque hay materiales usando esta categoría.`
            : error.message,
        tipo: "error",
      });
      return;
    }
    setMensaje({ texto: `Se eliminó "${c.nombre}" correctamente.`, tipo: "ok" });
    await cargarCategorias();
  }

  return (
    <section className="view">
      {puedeCrear && (
        <div style={{ marginBottom: 16 }}>
          {!mostrarForm ? (
            <button type="button" className="btn-nuevo" onClick={() => setMostrarForm(true)}>
              + Nueva categoría
            </button>
          ) : (
            <form className="tags-input" onSubmit={handleSubmit}>
              <input
                type="text"
                required
                autoFocus
                placeholder="Nombre de la categoría"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <button type="submit" disabled={guardando || !nombre.trim()}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                className="btn-secundario"
                onClick={() => {
                  setMostrarForm(false);
                  setNombre("");
                  setMensaje(null);
                }}
              >
                Cancelar
              </button>
            </form>
          )}
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </div>
      )}

      <div className="panel">
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Creada</th>
                {puedeCrear && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={puedeCrear ? 3 : 2} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : categorias.length === 0 ? (
                <tr>
                  <td colSpan={puedeCrear ? 3 : 2} className="empty-state">
                    Todavía no hay categorías.
                  </td>
                </tr>
              ) : (
                categorias.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{new Date(c.creado_en).toLocaleDateString("es-CO")}</td>
                    {puedeCrear && (
                      <td>
                        <button type="button" className="btn-rechazar" onClick={() => setConfirmandoEliminar(c)}>
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={`¿Eliminar "${confirmandoEliminar.nombre}"?`}
          descripcion="Esta acción no se puede deshacer."
          onConfirmar={() => eliminarCategoria(confirmandoEliminar)}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </section>
  );
}
