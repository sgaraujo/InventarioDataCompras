import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { Almacen, Categoria, Material, Proveedor } from "../api/types";
import { ESTADO_LABEL, money, moneda, esAdmin } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ImportarExcelModal } from "../components/ImportarExcelModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, FileUp, Download, Trash2, AlertTriangle } from "lucide-react";

const TAMANO_PAGINA = 25;

const FORM_VACIO = {
  id: null as number | null,
  codigo: "",
  numero_parte: "",
  producto: "",
  unidad: "",
  categoria_id: "",
  proveedor_ids: [] as string[],
  almacen_id: "",
  valor_unitario: "",
  stock_minimo: "",
  marca: "",
  grupo: [] as string[],
  modelo: "",
  serial: "",
  activo: true,
};

// Categorias donde Modelo pasa a ser obligatorio (Marca ya es obligatoria siempre)
const CATEGORIAS_REQUIEREN_MODELO = ["herramienta", "equipos"];

// Union de las unidades ya usadas en el catalogo + algunas comunes del rubro,
// para que la lista no quede corta apenas empiecen a cargar herramientas/equipos.
const UNIDADES_SUGERIDAS = ["UND", "MTS", "KIT", "ROLLO", "PAR", "CAJA", "GALON"];

export function Materiales() {
  const { usuario } = useAuth();
  const puedeEditar = esAdmin(usuario) || usuario?.rol === "almacenista";

  const [searchParams, setSearchParams] = useSearchParams();
  const resaltarId = searchParams.get("resaltar");
  const filaResaltadaRef = useRef<HTMLTableRowElement>(null);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargando, setCargando] = useState(true);

  const [form, setForm] = useState(FORM_VACIO);
  const [grupoInput, setGrupoInput] = useState("");
  const [unidades, setUnidades] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const editando = form.id !== null;
  // Foto del form al abrir el modal (vacio, o los valores cargados al editar),
  // para saber si el usuario en verdad cambio algo antes de preguntar si
  // quiere salir sin guardar.
  const formInicialRef = useRef(FORM_VACIO);

  const categoriaSeleccionada = categorias.find((c) => String(c.id) === form.categoria_id);
  const requiereModelo = Boolean(
    categoriaSeleccionada && CATEGORIAS_REQUIEREN_MODELO.includes(categoriaSeleccionada.nombre.trim().toLowerCase())
  );

  const categoriaId = searchParams.get("categoria_id") ?? "";
  const q = searchParams.get("q") ?? "";

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (categoriaId) params.set("categoria_id", categoriaId);
    if (q) params.set("q", q);
    return params;
  }

  function cargarMateriales() {
    setCargando(true);
    return api
      .get<Material[]>(`/api/materiales?${construirParamsFiltro().toString()}`)
      .then(setMateriales)
      .finally(() => setCargando(false));
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/materiales/exportar?${construirParamsFiltro().toString()}`, "materiales.xlsx");
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    cargarMateriales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId, q]);

  useEffect(() => {
    api.get<Categoria[]>("/api/categorias").then(setCategorias);
    if (puedeEditar) {
      api.get<Proveedor[]>("/api/proveedores").then(setProveedores);
      api.get<Almacen[]>("/api/almacenes").then(setAlmacenes);
      api.get<string[]>("/api/materiales/unidades").then((usadas) => {
        setUnidades(Array.from(new Set([...usadas, ...UNIDADES_SUGERIDAS])).sort());
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeEditar]);

  function cambiarCategoria(valor: string) {
    const next = new URLSearchParams(searchParams);
    if (valor) next.set("categoria_id", valor);
    else next.delete("categoria_id");
    next.set("pagina", "1");
    setSearchParams(next, { replace: true });
  }

  function abrirNuevo() {
    setForm(FORM_VACIO);
    formInicialRef.current = FORM_VACIO;
    setGrupoInput("");
    setProveedorParaAgregar("");
    setMensaje(null);
    setMostrarForm(true);
  }

  function editar(m: Material) {
    const datos = {
      id: m.id,
      codigo: m.codigo ?? "",
      numero_parte: m.numero_parte ?? "",
      producto: m.producto,
      unidad: m.unidad,
      categoria_id: m.categoria_id ? String(m.categoria_id) : "",
      proveedor_ids: m.proveedores.map((p) => String(p.id)),
      almacen_id: m.almacen_id ? String(m.almacen_id) : "",
      valor_unitario: m.valor_unitario ?? "",
      stock_minimo: m.stock_minimo,
      marca: m.marca ?? "",
      grupo: m.grupo ?? [],
      modelo: m.modelo ?? "",
      serial: m.serial ?? "",
      activo: m.activo,
    };
    setForm(datos);
    formInicialRef.current = datos;
    setGrupoInput("");
    setProveedorParaAgregar("");
    setMensaje(null);
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setGrupoInput("");
    setProveedorParaAgregar("");
    setMensaje(null);
  }

  function agregarGrupo() {
    const valor = grupoInput.trim();
    if (valor && !form.grupo.includes(valor)) {
      setForm({ ...form, grupo: [...form.grupo, valor] });
    }
    setGrupoInput("");
  }

  function quitarGrupo(valor: string) {
    setForm({ ...form, grupo: form.grupo.filter((g) => g !== valor) });
  }

  const [proveedorParaAgregar, setProveedorParaAgregar] = useState("");

  function agregarProveedor() {
    if (proveedorParaAgregar && !form.proveedor_ids.includes(proveedorParaAgregar)) {
      setForm({ ...form, proveedor_ids: [...form.proveedor_ids, proveedorParaAgregar] });
    }
    setProveedorParaAgregar("");
  }

  function quitarProveedor(id: string) {
    setForm({ ...form, proveedor_ids: form.proveedor_ids.filter((p) => p !== id) });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.proveedor_ids.length === 0) {
      setMensaje({ texto: "Agrega al menos un proveedor.", tipo: "error" });
      return;
    }
    if (requiereModelo && !form.modelo.trim()) {
      setMensaje({ texto: "El modelo es obligatorio para materiales de categoría Herramienta o Equipos.", tipo: "error" });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const cuerpo = {
        codigo: form.codigo || undefined,
        numero_parte: form.numero_parte || undefined,
        producto: form.producto,
        unidad: form.unidad,
        categoria_id: form.categoria_id || undefined,
        proveedor_ids: form.proveedor_ids,
        almacen_id: form.almacen_id || undefined,
        valor_unitario: form.valor_unitario || undefined,
        stock_minimo: form.stock_minimo || 0,
        marca: form.marca,
        grupo: form.grupo,
        modelo: form.modelo || undefined,
        serial: form.serial || undefined,
        ...(editando ? { activo: form.activo } : {}),
      };
      if (editando) {
        await api.put(`/api/materiales/${form.id}`, cuerpo);
      } else {
        await api.post("/api/materiales", cuerpo);
      }
      setMostrarForm(false);
      setForm(FORM_VACIO);
      await cargarMateriales();
    } catch (err) {
      setMensaje({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar el material",
        tipo: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Material | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<{ id: number; texto: string } | null>(null);

  async function eliminarMaterial(m: Material) {
    setConfirmandoEliminar(null);
    setEliminandoId(m.id);
    setErrorEliminar(null);
    try {
      await api.delete(`/api/materiales/${m.id}`);
      await cargarMateriales();
    } catch (err) {
      setErrorEliminar({
        id: m.id,
        texto: err instanceof ApiClientError ? err.message : "Error al eliminar el material",
      });
    } finally {
      setEliminandoId(null);
    }
  }

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    materiales,
    TAMANO_PAGINA
  );

  // Las alertas de stock abren el catalogo en la pagina exacta del material
  // afectado y resaltan su fila para encontrarlo de inmediato.
  useEffect(() => {
    if (!resaltarId || !materiales.length) return;
    const indice = materiales.findIndex((m) => String(m.id) === resaltarId);
    if (indice === -1) return;
    const paginaDelItem = Math.floor(indice / TAMANO_PAGINA) + 1;
    if (paginaDelItem !== paginaActual) {
      irAPagina(paginaDelItem);
      return;
    }
    if (filaResaltadaRef.current) {
      filaResaltadaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const limpiar = setTimeout(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("resaltar");
        setSearchParams(next, { replace: true });
      }, 3000);
      return () => clearTimeout(limpiar);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltarId, materiales, paginaActual]);

  return (
    <section className="view">
      <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
        {puedeEditar && (
          <>
            <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
              + Nuevo material
            </button>
            <button type="button" className="btn-editar" onClick={() => setMostrarImportar(true)}>
              <FileUp size={14} /> Importar desde Excel
            </button>
          </>
        )}
        <button type="button" className="btn-editar" onClick={exportar} disabled={exportando}>
          <Download size={14} /> {exportando ? "Exportando..." : "Exportar"}
        </button>
      </div>
      {errorExportar && <div className="mensaje-form error">{errorExportar}</div>}

      {puedeEditar && mostrarImportar && (
        <ImportarExcelModal
          titulo="Importar materiales desde Excel"
          endpointPlantilla="/api/materiales/plantilla"
          nombreArchivoPlantilla="plantilla_materiales.xlsx"
          endpointImportar="/api/materiales/importar"
          claveSegundaLista="actualizados"
          etiquetaSegundaLista="Se actualizarán (código ya existe)"
          onClose={() => setMostrarImportar(false)}
          onConfirmado={cargarMateriales}
        />
      )}

      {puedeEditar && mostrarForm && (
        <Modal
          titulo={editando ? `Editar material: ${form.producto}` : "Nuevo material"}
          onClose={cerrarForm}
          confirmarCierre={
            JSON.stringify(form) !== JSON.stringify(formInicialRef.current) ||
            grupoInput.trim() !== "" ||
            proveedorParaAgregar !== ""
          }
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <div>
              <label>Código SAP</label>
              <input
                type="text"
                placeholder="Opcional"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              />
            </div>
            <div>
              <label>Número de parte (fabricante)</label>
              <input
                type="text"
                placeholder="Opcional"
                value={form.numero_parte}
                onChange={(e) => setForm({ ...form, numero_parte: e.target.value })}
              />
            </div>
            <div>
              <label>Producto</label>
              <input
                type="text"
                required
                value={form.producto}
                onChange={(e) => setForm({ ...form, producto: e.target.value })}
              />
            </div>
            <div>
              <label>Unidad</label>
              <select required value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
                <option value="">Selecciona una unidad</option>
                {unidades.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Marca</label>
              <input
                type="text"
                required
                placeholder="Obligatorio"
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
            </div>
            <div>
              <label>Categoría</label>
              <select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="full">
              <label>Grupo</label>
              <div className="tags-input">
                <input
                  type="text"
                  placeholder="Escribe un grupo y presiona Enter"
                  value={grupoInput}
                  onChange={(e) => setGrupoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      agregarGrupo();
                    }
                  }}
                />
                <button type="button" className="btn-secundario" onClick={agregarGrupo}>
                  Agregar
                </button>
              </div>
              {form.grupo.length > 0 && (
                <div className="tags-lista">
                  {form.grupo.map((g) => (
                    <span key={g} className="tag-chip">
                      {g}
                      <button type="button" onClick={() => quitarGrupo(g)} aria-label={`Quitar ${g}`}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {requiereModelo && (
              <>
                <div>
                  <label>Modelo</label>
                  <input
                    type="text"
                    required
                    placeholder="Obligatorio para Herramienta/Equipos"
                    value={form.modelo}
                    onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                  />
                </div>
                <div>
                  <label>Serial (opcional)</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={form.serial}
                    onChange={(e) => setForm({ ...form, serial: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="full">
              <label>Proveedores</label>
              <div className="tags-input">
                <select value={proveedorParaAgregar} onChange={(e) => setProveedorParaAgregar(e.target.value)}>
                  <option value="">Selecciona un proveedor...</option>
                  {proveedores
                    .filter((p) => !form.proveedor_ids.includes(String(p.id)))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                </select>
                <button type="button" className="btn-secundario" onClick={agregarProveedor}>
                  Agregar
                </button>
              </div>
              {form.proveedor_ids.length > 0 ? (
                <div className="tags-lista">
                  {form.proveedor_ids.map((id) => {
                    const p = proveedores.find((prov) => String(prov.id) === id);
                    return (
                      <span key={id} className="tag-chip">
                        {p?.nombre ?? id}
                        <button type="button" onClick={() => quitarProveedor(id)} aria-label={`Quitar ${p?.nombre ?? id}`}>
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="stock-aviso">Agrega al menos un proveedor.</div>
              )}
            </div>
            <div>
              <label>Almacén</label>
              <select value={form.almacen_id} onChange={(e) => setForm({ ...form, almacen_id: e.target.value })}>
                <option value="">Sin almacén</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Valor unitario</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Opcional"
                value={form.valor_unitario}
                onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })}
              />
            </div>
            <div>
              <label>Stock mínimo</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.stock_minimo}
                onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
              />
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

      <div className="tabs">
        <button
          type="button"
          className={`tab${categoriaId === "" ? " active" : ""}`}
          onClick={() => cambiarCategoria("")}
        >
          Todos
        </button>
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`tab${categoriaId === String(c.id) ? " active" : ""}`}
            onClick={() => cambiarCategoria(String(c.id))}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código SAP</th>
                <th>Nro. parte</th>
                <th>Producto</th>
                <th>Marca</th>
                <th>Categoría</th>
                <th>Unidad</th>
                <th>Proveedor</th>
                <th>Almacén</th>
                <th>Valor unitario</th>
                <th>Valor total</th>
                <th>Stock mínimo</th>
                <th>Stock actual</th>
                <th>Estado</th>
                {puedeEditar && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={puedeEditar ? 14 : 13} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={puedeEditar ? 14 : 13} className="empty-state">
                    No se encontraron materiales con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <Fragment key={m.id}>
                    <tr
                      ref={String(m.id) === resaltarId ? filaResaltadaRef : undefined}
                      className={String(m.id) === resaltarId ? "fila-resaltada" : undefined}
                    >
                      <td>{m.codigo || "—"}</td>
                      <td>{m.numero_parte || "—"}</td>
                      <td>
                        {m.producto} {!m.activo && <span className="badge sin_existencias">Inactivo</span>}
                      </td>
                      <td>{m.marca || "—"}</td>
                      <td>
                        <span className="cat-pill">{m.categoria_nombre || "—"}</span>
                      </td>
                      <td>{m.unidad}</td>
                      <td>{m.proveedores.length ? m.proveedores.map((p) => p.nombre).join(", ") : "—"}</td>
                      <td>{m.almacen_nombre || "—"}</td>
                      <td>{moneda(m.valor_unitario)}</td>
                      <td>{moneda(m.valor_total)}</td>
                      <td>{money(m.stock_minimo)}</td>
                      <td>{money(m.stock_actual)}</td>
                      <td>
                        <span className={`badge ${m.estado}`}>{ESTADO_LABEL[m.estado]}</span>
                      </td>
                      {puedeEditar && (
                        <td>
                          <div className="acciones-solicitud">
                            <button type="button" className="btn-editar" onClick={() => editar(m)}>
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              className="btn-rechazar"
                              disabled={eliminandoId === m.id}
                              onClick={() => setConfirmandoEliminar(m)}
                            >
                              <Trash2 size={14} /> Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {errorEliminar?.id === m.id && (
                      <tr className="fila-aviso">
                        <td colSpan={puedeEditar ? 14 : 13}>
                          <div className="aviso-bloqueo">
                            <AlertTriangle size={16} />
                            <div className="aviso-bloqueo__texto">
                              <strong>No se pudo eliminar "{m.producto}"</strong>
                              <span>{errorEliminar.texto}</span>
                            </div>
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
          etiqueta="materiales"
          onCambiarPagina={irAPagina}
        />
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={`¿Eliminar el material "${confirmandoEliminar.producto}"?`}
          descripcion="Esta acción no se puede deshacer."
          onConfirmar={() => eliminarMaterial(confirmandoEliminar)}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </section>
  );
}
