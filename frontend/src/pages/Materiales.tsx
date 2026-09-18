import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { subirEvidencia } from "../api/storage";
import type { CentroCosto, Empresa, Material } from "../api/types";
import { esAdmin, money, puedeEditar } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, ImageOff } from "lucide-react";

const TAMANO_PAGINA = 25;

const FORM_VACIO = {
  id: null as number | null,
  empresa_id: "",
  centro_costo_id: "",
  descripcion: "",
  activo: true,
};

export function Materiales() {
  const { usuario } = useAuth();
  const editable = puedeEditar(usuario);
  const admin = esAdmin(usuario);

  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").toLowerCase();
  const empresaFiltro = searchParams.get("empresa_id") ?? "";
  const stockFiltro = searchParams.get("stock") ?? ""; // "" | "con" | "sin"

  const [materiales, setMateriales] = useState<Material[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [cargando, setCargando] = useState(true);

  const [form, setForm] = useState(FORM_VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const [nuevoCentroCosto, setNuevoCentroCosto] = useState("");
  const [creandoCentroCosto, setCreandoCentroCosto] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const editando = form.id !== null;
  const formInicialRef = useRef(FORM_VACIO);

  async function cargarMateriales() {
    setCargando(true);
    const { data, error } = await supabase
      .from("materiales")
      .select("*, empresas(nombre), centros_costo(nombre)")
      .order("id", { ascending: false });
    if (!error && data) {
      setMateriales(
        data.map((m) => ({
          ...m,
          empresa_nombre: (m.empresas as { nombre: string } | null)?.nombre ?? "—",
          centro_costo_nombre: (m.centros_costo as { nombre: string } | null)?.nombre ?? null,
        })) as Material[]
      );
    }
    setCargando(false);
  }

  useEffect(() => {
    cargarMateriales();
    supabase
      .from("empresas")
      .select("*")
      .order("nombre")
      .then(({ data }) => setEmpresas((data as Empresa[]) ?? []));
    supabase
      .from("centros_costo")
      .select("*")
      .order("nombre")
      .then(({ data }) => setCentrosCosto((data as CentroCosto[]) ?? []));
  }, []);

  const materialesFiltrados = materiales.filter((m) => {
    if (empresaFiltro && String(m.empresa_id) !== empresaFiltro) return false;
    if (q && !m.descripcion.toLowerCase().includes(q) && !m.codigo.toLowerCase().includes(q)) return false;
    if (stockFiltro === "con" && Number(m.stock_actual) <= 0) return false;
    if (stockFiltro === "sin" && Number(m.stock_actual) > 0) return false;
    return true;
  });

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    materialesFiltrados,
    TAMANO_PAGINA
  );

  function cambiarEmpresaFiltro(valor: string) {
    const next = new URLSearchParams(searchParams);
    if (valor) next.set("empresa_id", valor);
    else next.delete("empresa_id");
    setSearchParams(next, { replace: true });
  }

  function abrirNuevo() {
    setForm(FORM_VACIO);
    formInicialRef.current = FORM_VACIO;
    setFoto(null);
    setNuevoCentroCosto("");
    setMensaje(null);
    setMostrarForm(true);
  }

  function editar(m: Material) {
    const datos = {
      id: m.id,
      empresa_id: String(m.empresa_id),
      centro_costo_id: m.centro_costo_id ? String(m.centro_costo_id) : "",
      descripcion: m.descripcion,
      activo: m.activo,
    };
    setForm(datos);
    formInicialRef.current = datos;
    setFoto(null);
    setNuevoCentroCosto("");
    setMensaje(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setFoto(null);
    setNuevoCentroCosto("");
    setMensaje(null);
  }

  const centrosDeLaEmpresa = centrosCosto.filter((c) => String(c.empresa_id) === form.empresa_id);

  // Los centros de costo no vienen pre-cargados -- se van creando uno a uno
  // a medida que hacen falta, directo desde el formulario de material.
  async function agregarCentroCosto() {
    const nombre = nuevoCentroCosto.trim();
    if (!nombre || !form.empresa_id) return;
    setCreandoCentroCosto(true);
    const { data, error } = await supabase
      .from("centros_costo")
      .insert({ empresa_id: Number(form.empresa_id), nombre })
      .select()
      .single();
    setCreandoCentroCosto(false);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    setCentrosCosto((prev) => [...prev, data as CentroCosto]);
    setForm((f) => ({ ...f, centro_costo_id: String(data.id) }));
    setNuevoCentroCosto("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      let fotoUrl: string | undefined;
      if (foto) fotoUrl = await subirEvidencia("materiales", foto);

      const cuerpo = {
        empresa_id: Number(form.empresa_id),
        centro_costo_id: form.centro_costo_id ? Number(form.centro_costo_id) : null,
        descripcion: form.descripcion,
        ...(fotoUrl ? { foto: fotoUrl } : {}),
        ...(editando ? { activo: form.activo } : {}),
      };

      const { error } = editando
        ? await supabase.from("materiales").update(cuerpo).eq("id", form.id!)
        : await supabase.from("materiales").insert(cuerpo);

      if (error) throw error;
      setMostrarForm(false);
      setForm(FORM_VACIO);
      await cargarMateriales();
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : "Error al guardar el material", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  }

  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState<Material | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Material | null>(null);

  async function desactivarMaterial(m: Material) {
    setConfirmandoDesactivar(null);
    await supabase.from("materiales").update({ activo: !m.activo }).eq("id", m.id);
    await cargarMateriales();
  }

  async function eliminarMaterial(m: Material) {
    setConfirmandoEliminar(null);

    if (m.stock_actual !== 0) {
      setMensaje({
        texto: `No se puede eliminar "${m.descripcion}" porque tiene stock actual (${m.stock_actual}).`,
        tipo: "error",
      });
      return;
    }

    const { error } = await supabase.from("materiales").delete().eq("id", m.id);
    if (error) {
      // 23503 = viola la FK de movimientos.material_id (ON DELETE RESTRICT,
      // ver supabase/migrations/0004_preservar_historial_materiales.sql) --
      // la base nunca deja borrar un material con historial. En vez de solo
      // avisar y obligar a ir a tocar otro boton, "Eliminar" cae solo a
      // Desactivar -- el material sale de circulacion igual, pero su
      // historial de movimientos queda intacto.
      if (error.code === "23503") {
        await supabase.from("materiales").update({ activo: false }).eq("id", m.id);
        setMensaje({
          texto: `"${m.descripcion}" tiene movimientos en su historial, así que no se puede borrar del todo -- se desactivó en su lugar (su historial sigue disponible).`,
          tipo: "ok",
        });
        await cargarMateriales();
        return;
      }
      setMensaje({ texto: error.message || "No se pudo eliminar el material", tipo: "error" });
      return;
    }

    setMensaje({ texto: `Se eliminó "${m.descripcion}" correctamente.`, tipo: "ok" });
    await cargarMateriales();
  }

  const [confirmandoEliminarDefinitivo, setConfirmandoEliminarDefinitivo] = useState<Material | null>(null);

  // Solo para admin -- a diferencia de eliminarMaterial() (que protege el
  // historial cayendo a Desactivar), esto SI borra el historial de
  // movimientos del material antes de borrarlo a el. Pensado para corregir
  // materiales creados por error (duplicados, mal cargados), no para uso
  // normal -- por eso el boton solo lo ve admin y el dialogo de confirmacion
  // es explicito sobre que se pierde el historial.
  async function eliminarDefinitivamente(m: Material) {
    setConfirmandoEliminarDefinitivo(null);
    const { error: errorMovimientos } = await supabase.from("movimientos").delete().eq("material_id", m.id);
    if (errorMovimientos) {
      setMensaje({ texto: errorMovimientos.message || "No se pudo borrar el historial del material", tipo: "error" });
      return;
    }
    const { error } = await supabase.from("materiales").delete().eq("id", m.id);
    if (error) {
      setMensaje({ texto: error.message || "No se pudo eliminar el material", tipo: "error" });
      return;
    }
    setMensaje({ texto: `Se eliminó "${m.descripcion}" y todo su historial, de forma permanente.`, tipo: "ok" });
    await cargarMateriales();
  }

  return (
    <section className="view">
      {editable && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
            + Nuevo material
          </button>
        </div>
      )}

      <div className="filtros-mov">
        <div>
          <label>Empresa</label>
          <select value={empresaFiltro} onChange={(e) => cambiarEmpresaFiltro(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Existencias</label>
          <select
            value={stockFiltro}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("stock", e.target.value);
              else next.delete("stock");
              setSearchParams(next, { replace: true });
            }}
          >
            <option value="">Todas</option>
            <option value="con">Con existencias</option>
            <option value="sin">Sin existencias</option>
          </select>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <label>Buscar</label>
          <input
            type="text"
            style={{ width: "100%" }}
            placeholder="Buscar por descripción o código..."
            value={searchParams.get("q") ?? ""}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("q", e.target.value);
              else next.delete("q");
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
      </div>

      {editable && mostrarForm && (
        <Modal
          titulo={editando ? `Editar material: ${form.descripcion}` : "Nuevo material"}
          onClose={cerrarForm}
          confirmarCierre={
            JSON.stringify(form) !== JSON.stringify(formInicialRef.current) ||
            Boolean(foto) ||
            nuevoCentroCosto.trim() !== ""
          }
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <div>
              <label>Empresa</label>
              <select
                required
                value={form.empresa_id}
                onChange={(e) => setForm({ ...form, empresa_id: e.target.value, centro_costo_id: "" })}
              >
                <option value="">Selecciona una empresa</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Centro de costo</label>
              <select
                value={form.centro_costo_id}
                disabled={!form.empresa_id}
                onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })}
              >
                <option value="">Sin asignar</option>
                {centrosDeLaEmpresa.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.nombre}
                  </option>
                ))}
              </select>
              {form.empresa_id && (
                <div className="tags-input" style={{ marginTop: 6 }}>
                  <input
                    type="text"
                    placeholder="¿No está en la lista? Escribe el nombre y agrégalo"
                    value={nuevoCentroCosto}
                    onChange={(e) => setNuevoCentroCosto(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secundario"
                    disabled={!nuevoCentroCosto.trim() || creandoCentroCosto}
                    onClick={agregarCentroCosto}
                  >
                    {creandoCentroCosto ? "Agregando..." : "+ Agregar"}
                  </button>
                </div>
              )}
            </div>
            <div className="full">
              <label>Descripción</label>
              <input
                type="text"
                required
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div className="full">
              <label>Foto del material (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
            {editando && (
              <div>
                <label>Estado</label>
                <select value={String(form.activo)} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            )}
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear material"}
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
                <th>Foto</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Empresa</th>
                <th>Centro de costo</th>
                <th>Stock actual</th>
                <th>Estado</th>
                {editable && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={editable ? 8 : 7} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 8 : 7} className="empty-state">
                    No se encontraron materiales con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.foto ? (
                        <img src={m.foto} alt={m.descripcion} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        <ImageOff size={18} color="var(--text-muted)" />
                      )}
                    </td>
                    <td>{m.codigo}</td>
                    <td>
                      {m.descripcion} {!m.activo && <span className="badge sin_existencias">Inactivo</span>}
                    </td>
                    <td>{m.empresa_nombre}</td>
                    <td>{m.centro_costo_nombre || "—"}</td>
                    <td>{money(m.stock_actual)}</td>
                    <td>
                      <span className={`badge ${m.stock_actual > 0 ? "ok" : "sin_existencias"}`}>
                        {m.stock_actual > 0 ? "Con stock" : "Sin existencias"}
                      </span>
                    </td>
                    {editable && (
                      <td>
                        <div className="acciones-solicitud">
                          <button type="button" className="btn-editar" onClick={() => editar(m)}>
                            <Pencil size={14} /> Editar
                          </button>
                          <button type="button" className="btn-rechazar" onClick={() => setConfirmandoDesactivar(m)}>
                            {m.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            className="btn-rechazar"
                            onClick={() => setConfirmandoEliminar(m)}
                            disabled={m.stock_actual !== 0}
                            title={m.stock_actual !== 0 ? "No se puede eliminar un material con stock" : "Eliminar material"}
                          >
                            Eliminar
                          </button>
                          {admin && (
                            <button
                              type="button"
                              className="btn-rechazar"
                              onClick={() => setConfirmandoEliminarDefinitivo(m)}
                              title="Borra el material y todo su historial de movimientos, sin posibilidad de deshacer"
                            >
                              Eliminar definitivamente
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
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
          etiqueta="materiales"
          onCambiarPagina={irAPagina}
        />
      </div>

      {confirmandoDesactivar && (
        <ConfirmDialog
          titulo={`¿${confirmandoDesactivar.activo ? "Desactivar" : "Activar"} "${confirmandoDesactivar.descripcion}"?`}
          descripcion="Los materiales inactivos no se pueden usar en nuevos movimientos."
          onConfirmar={() => desactivarMaterial(confirmandoDesactivar)}
          onCancelar={() => setConfirmandoDesactivar(null)}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={`¿Eliminar "${confirmandoEliminar.descripcion}"?`}
          descripcion={
            confirmandoEliminar.stock_actual !== 0
              ? "No se puede eliminar un material con stock actual."
              : "Si el material nunca tuvo movimientos, se borra por completo (no se puede deshacer). Si ya tiene historial, en vez de eso se desactiva -- su historial de movimientos queda intacto."
          }
          onConfirmar={() => eliminarMaterial(confirmandoEliminar)}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}

      {confirmandoEliminarDefinitivo && (
        <ConfirmDialog
          titulo={`¿Eliminar "${confirmandoEliminarDefinitivo.descripcion}" definitivamente?`}
          descripcion="Esto borra el material Y todo su historial de movimientos (entradas, salidas, fotos, soportes). No hay forma de deshacerlo ni de recuperar esos datos. Úsalo solo para corregir materiales creados por error."
          onConfirmar={() => eliminarDefinitivamente(confirmandoEliminarDefinitivo)}
          onCancelar={() => setConfirmandoEliminarDefinitivo(null)}
        />
      )}
    </section>
  );
}
