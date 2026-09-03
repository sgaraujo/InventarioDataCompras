import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { Almacen, Categoria, Proveedor } from "../api/types";
import { Modal } from "../components/Modal";
import { ImportarExcelModal } from "../components/ImportarExcelModal";
import { Paginacion } from "../components/Paginacion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, FileUp, Download, Trash2, AlertTriangle } from "lucide-react";

const TAMANO_PAGINA = 25;

const FORM_VACIO_CATEGORIA = { id: null as number | null, nombre: "" };

const FORM_VACIO_PROVEEDOR = {
  id: null as number | null,
  nombre: "",
  contacto: "",
  telefono: "",
  email: "",
  notas: "",
  activo: true,
};

const FORM_VACIO_ALMACEN = {
  id: null as number | null,
  nombre: "",
  ubicacion: "",
  responsable: "",
  activo: true,
};

// Categorias, Proveedores y Almacenes son los catalogos de referencia que
// alimentan a Materiales (categoria_id, proveedor_ids, almacen_id) -- misma
// funcion en los tres casos (un CRUD simple), asi que quedan unificados en
// un solo modulo con pestañas, igual que Herramientas separa Catalogo/Historial.
export function Catalogos() {
  const [vista, setVista] = useState<"categorias" | "proveedores" | "almacenes">("categorias");

  // ---------- Categorias ----------
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [formCategoria, setFormCategoria] = useState(FORM_VACIO_CATEGORIA);
  const [mensajeCategoria, setMensajeCategoria] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardandoCategoria, setGuardandoCategoria] = useState(false);
  const [mostrarFormCategoria, setMostrarFormCategoria] = useState(false);
  const [mostrarImportarCategoria, setMostrarImportarCategoria] = useState(false);
  const [eliminandoIdCategoria, setEliminandoIdCategoria] = useState<number | null>(null);
  const [errorEliminarCategoria, setErrorEliminarCategoria] = useState<{ id: number; texto: string } | null>(null);
  const [confirmandoEliminarCategoria, setConfirmandoEliminarCategoria] = useState<Categoria | null>(null);
  const editandoCategoria = formCategoria.id !== null;
  const formInicialCategoriaRef = useRef(FORM_VACIO_CATEGORIA);

  function cargarCategorias() {
    setCargandoCategorias(true);
    return api
      .get<Categoria[]>("/api/categorias")
      .then(setCategorias)
      .finally(() => setCargandoCategorias(false));
  }

  useEffect(() => {
    cargarCategorias();
  }, []);

  const paginacionCategorias = usePaginacion(categorias, TAMANO_PAGINA);

  const [exportandoCategorias, setExportandoCategorias] = useState(false);
  const [errorExportarCategorias, setErrorExportarCategorias] = useState<string | null>(null);

  async function exportarCategorias() {
    setExportandoCategorias(true);
    setErrorExportarCategorias(null);
    try {
      await descargarArchivo("/api/categorias/exportar", "categorias.xlsx");
    } catch (err) {
      setErrorExportarCategorias(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportandoCategorias(false);
    }
  }

  function abrirNuevaCategoria() {
    setFormCategoria(FORM_VACIO_CATEGORIA);
    formInicialCategoriaRef.current = FORM_VACIO_CATEGORIA;
    setMensajeCategoria(null);
    setMostrarFormCategoria(true);
  }

  function editarCategoria(c: Categoria) {
    const datos = { id: c.id, nombre: c.nombre };
    setFormCategoria(datos);
    formInicialCategoriaRef.current = datos;
    setMensajeCategoria(null);
    setMostrarFormCategoria(true);
  }

  function cerrarFormCategoria() {
    setMostrarFormCategoria(false);
    setFormCategoria(FORM_VACIO_CATEGORIA);
    setMensajeCategoria(null);
  }

  async function handleSubmitCategoria(e: FormEvent) {
    e.preventDefault();
    setGuardandoCategoria(true);
    setMensajeCategoria(null);
    try {
      if (editandoCategoria) {
        await api.put(`/api/categorias/${formCategoria.id}`, { nombre: formCategoria.nombre });
      } else {
        await api.post("/api/categorias", { nombre: formCategoria.nombre });
      }
      setMostrarFormCategoria(false);
      setFormCategoria(FORM_VACIO_CATEGORIA);
      await cargarCategorias();
    } catch (err) {
      setMensajeCategoria({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar la categoría",
        tipo: "error",
      });
    } finally {
      setGuardandoCategoria(false);
    }
  }

  async function eliminarCategoria(c: Categoria) {
    setConfirmandoEliminarCategoria(null);
    setEliminandoIdCategoria(c.id);
    setErrorEliminarCategoria(null);
    try {
      await api.delete(`/api/categorias/${c.id}`);
      await cargarCategorias();
    } catch (err) {
      setErrorEliminarCategoria({
        id: c.id,
        texto: err instanceof ApiClientError ? err.message : "Error al eliminar la categoría",
      });
    } finally {
      setEliminandoIdCategoria(null);
    }
  }

  // ---------- Proveedores ----------
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargandoProveedores, setCargandoProveedores] = useState(true);
  const [formProveedor, setFormProveedor] = useState(FORM_VACIO_PROVEEDOR);
  const [mensajeProveedor, setMensajeProveedor] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [mostrarFormProveedor, setMostrarFormProveedor] = useState(false);
  const [mostrarImportarProveedor, setMostrarImportarProveedor] = useState(false);
  const editandoProveedor = formProveedor.id !== null;
  const formInicialProveedorRef = useRef(FORM_VACIO_PROVEEDOR);

  function cargarProveedores() {
    setCargandoProveedores(true);
    return api
      .get<Proveedor[]>("/api/proveedores")
      .then(setProveedores)
      .finally(() => setCargandoProveedores(false));
  }

  useEffect(() => {
    cargarProveedores();
  }, []);

  const paginacionProveedores = usePaginacion(proveedores, TAMANO_PAGINA);

  const [exportandoProveedores, setExportandoProveedores] = useState(false);
  const [errorExportarProveedores, setErrorExportarProveedores] = useState<string | null>(null);

  async function exportarProveedores() {
    setExportandoProveedores(true);
    setErrorExportarProveedores(null);
    try {
      await descargarArchivo("/api/proveedores/exportar", "proveedores.xlsx");
    } catch (err) {
      setErrorExportarProveedores(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportandoProveedores(false);
    }
  }

  function abrirNuevoProveedor() {
    setFormProveedor(FORM_VACIO_PROVEEDOR);
    formInicialProveedorRef.current = FORM_VACIO_PROVEEDOR;
    setMensajeProveedor(null);
    setMostrarFormProveedor(true);
  }

  function editarProveedor(p: Proveedor) {
    const datos = {
      id: p.id,
      nombre: p.nombre,
      contacto: p.contacto ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      notas: p.notas ?? "",
      activo: p.activo,
    };
    setFormProveedor(datos);
    formInicialProveedorRef.current = datos;
    setMensajeProveedor(null);
    setMostrarFormProveedor(true);
  }

  function cerrarFormProveedor() {
    setMostrarFormProveedor(false);
    setFormProveedor(FORM_VACIO_PROVEEDOR);
    setMensajeProveedor(null);
  }

  async function handleSubmitProveedor(e: FormEvent) {
    e.preventDefault();
    setGuardandoProveedor(true);
    setMensajeProveedor(null);
    try {
      const cuerpo = {
        nombre: formProveedor.nombre,
        contacto: formProveedor.contacto || undefined,
        telefono: formProveedor.telefono || undefined,
        email: formProveedor.email || undefined,
        notas: formProveedor.notas || undefined,
        ...(editandoProveedor ? { activo: formProveedor.activo } : {}),
      };
      if (editandoProveedor) {
        await api.put(`/api/proveedores/${formProveedor.id}`, cuerpo);
      } else {
        await api.post("/api/proveedores", cuerpo);
      }
      setMostrarFormProveedor(false);
      setFormProveedor(FORM_VACIO_PROVEEDOR);
      await cargarProveedores();
    } catch (err) {
      setMensajeProveedor({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar el proveedor",
        tipo: "error",
      });
    } finally {
      setGuardandoProveedor(false);
    }
  }

  // ---------- Almacenes ----------
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargandoAlmacenes, setCargandoAlmacenes] = useState(true);
  const [formAlmacen, setFormAlmacen] = useState(FORM_VACIO_ALMACEN);
  const [mensajeAlmacen, setMensajeAlmacen] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardandoAlmacen, setGuardandoAlmacen] = useState(false);
  const [mostrarFormAlmacen, setMostrarFormAlmacen] = useState(false);
  const editandoAlmacen = formAlmacen.id !== null;
  const formInicialAlmacenRef = useRef(FORM_VACIO_ALMACEN);

  function cargarAlmacenes() {
    setCargandoAlmacenes(true);
    return api
      .get<Almacen[]>("/api/almacenes")
      .then(setAlmacenes)
      .finally(() => setCargandoAlmacenes(false));
  }

  useEffect(() => {
    cargarAlmacenes();
  }, []);

  const paginacionAlmacenes = usePaginacion(almacenes, TAMANO_PAGINA);

  const [exportandoAlmacenes, setExportandoAlmacenes] = useState(false);
  const [errorExportarAlmacenes, setErrorExportarAlmacenes] = useState<string | null>(null);

  async function exportarAlmacenes() {
    setExportandoAlmacenes(true);
    setErrorExportarAlmacenes(null);
    try {
      await descargarArchivo("/api/almacenes/exportar", "almacenes.xlsx");
    } catch (err) {
      setErrorExportarAlmacenes(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportandoAlmacenes(false);
    }
  }

  function abrirNuevoAlmacen() {
    setFormAlmacen(FORM_VACIO_ALMACEN);
    formInicialAlmacenRef.current = FORM_VACIO_ALMACEN;
    setMensajeAlmacen(null);
    setMostrarFormAlmacen(true);
  }

  function editarAlmacen(a: Almacen) {
    const datos = {
      id: a.id,
      nombre: a.nombre,
      ubicacion: a.ubicacion ?? "",
      responsable: a.responsable ?? "",
      activo: a.activo,
    };
    setFormAlmacen(datos);
    formInicialAlmacenRef.current = datos;
    setMensajeAlmacen(null);
    setMostrarFormAlmacen(true);
  }

  function cerrarFormAlmacen() {
    setMostrarFormAlmacen(false);
    setFormAlmacen(FORM_VACIO_ALMACEN);
    setMensajeAlmacen(null);
  }

  async function handleSubmitAlmacen(e: FormEvent) {
    e.preventDefault();
    setGuardandoAlmacen(true);
    setMensajeAlmacen(null);
    try {
      const cuerpo = {
        nombre: formAlmacen.nombre,
        ubicacion: formAlmacen.ubicacion || undefined,
        responsable: formAlmacen.responsable || undefined,
        ...(editandoAlmacen ? { activo: formAlmacen.activo } : {}),
      };
      if (editandoAlmacen) {
        await api.put(`/api/almacenes/${formAlmacen.id}`, cuerpo);
      } else {
        await api.post("/api/almacenes", cuerpo);
      }
      setMostrarFormAlmacen(false);
      setFormAlmacen(FORM_VACIO_ALMACEN);
      await cargarAlmacenes();
    } catch (err) {
      setMensajeAlmacen({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar el almacén",
        tipo: "error",
      });
    } finally {
      setGuardandoAlmacen(false);
    }
  }

  return (
    <section className="view">
      <div className="tabs">
        <button
          type="button"
          className={`tab${vista === "categorias" ? " active" : ""}`}
          onClick={() => setVista("categorias")}
        >
          Categorías
        </button>
        <button
          type="button"
          className={`tab${vista === "proveedores" ? " active" : ""}`}
          onClick={() => setVista("proveedores")}
        >
          Proveedores
        </button>
        <button
          type="button"
          className={`tab${vista === "almacenes" ? " active" : ""}`}
          onClick={() => setVista("almacenes")}
        >
          Almacenes
        </button>
      </div>

      {vista === "categorias" && (
        <>
          <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
            <button type="button" className="btn-nuevo" onClick={abrirNuevaCategoria}>
              + Nueva categoría
            </button>
            <button type="button" className="btn-editar" onClick={() => setMostrarImportarCategoria(true)}>
              <FileUp size={14} /> Importar desde Excel
            </button>
            <button type="button" className="btn-editar" onClick={exportarCategorias} disabled={exportandoCategorias}>
              <Download size={14} /> {exportandoCategorias ? "Exportando..." : "Exportar"}
            </button>
          </div>
          {errorExportarCategorias && <div className="mensaje-form error">{errorExportarCategorias}</div>}

          {mostrarImportarCategoria && (
            <ImportarExcelModal
              titulo="Importar categorías desde Excel"
              endpointPlantilla="/api/categorias/plantilla"
              nombreArchivoPlantilla="plantilla_categorias.xlsx"
              endpointImportar="/api/categorias/importar"
              claveSegundaLista="existentes"
              etiquetaSegundaLista="Ya existen (no se tocan)"
              onClose={() => setMostrarImportarCategoria(false)}
              onConfirmado={cargarCategorias}
            />
          )}

          {mostrarFormCategoria && (
            <Modal
              titulo={editandoCategoria ? `Editar categoría: ${formCategoria.nombre}` : "Nueva categoría"}
              onClose={cerrarFormCategoria}
              confirmarCierre={JSON.stringify(formCategoria) !== JSON.stringify(formInicialCategoriaRef.current)}
            >
              <form className="form-grid" onSubmit={handleSubmitCategoria}>
                <div>
                  <label>Nombre</label>
                  <input
                    type="text"
                    required
                    value={formCategoria.nombre}
                    onChange={(e) => setFormCategoria({ ...formCategoria, nombre: e.target.value })}
                  />
                </div>
                <button type="submit" disabled={guardandoCategoria}>
                  {guardandoCategoria ? "Guardando..." : editandoCategoria ? "Guardar cambios" : "Crear categoría"}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrarFormCategoria}>
                  Cancelar
                </button>
              </form>
              {mensajeCategoria && <div className={`mensaje-form ${mensajeCategoria.tipo}`}>{mensajeCategoria.texto}</div>}
            </Modal>
          )}

          <div className="panel">
            <h2>Categorías</h2>
            <div className="tabla-wrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Creada</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoCategorias ? (
                    <tr>
                      <td colSpan={3} className="empty-state">Cargando...</td>
                    </tr>
                  ) : paginacionCategorias.pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="empty-state">No hay categorías registradas.</td>
                    </tr>
                  ) : (
                    paginacionCategorias.pageItems.map((c) => (
                      <Fragment key={c.id}>
                        <tr>
                          <td>{c.nombre}</td>
                          <td>{new Date(c.creado_en).toLocaleDateString("es-CO")}</td>
                          <td>
                            <div className="acciones-solicitud">
                              <button type="button" className="btn-editar" onClick={() => editarCategoria(c)}>
                                <Pencil size={14} /> Editar
                              </button>
                              <button
                                type="button"
                                className="btn-rechazar"
                                disabled={eliminandoIdCategoria === c.id}
                                onClick={() => setConfirmandoEliminarCategoria(c)}
                              >
                                <Trash2 size={14} /> Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                        {errorEliminarCategoria?.id === c.id && (
                          <tr className="fila-aviso">
                            <td colSpan={3}>
                              <div className="aviso-bloqueo">
                                <AlertTriangle size={16} />
                                <div className="aviso-bloqueo__texto">
                                  <strong>No se pudo eliminar "{c.nombre}"</strong>
                                  <span>{errorEliminarCategoria.texto}</span>
                                </div>
                                <button
                                  type="button"
                                  className="aviso-bloqueo__cerrar"
                                  onClick={() => setErrorEliminarCategoria(null)}
                                >
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
              paginaActual={paginacionCategorias.paginaActual}
              totalPaginas={paginacionCategorias.totalPaginas}
              desde={paginacionCategorias.desde}
              hasta={paginacionCategorias.hasta}
              total={paginacionCategorias.total}
              etiqueta="categorías"
              onCambiarPagina={paginacionCategorias.irAPagina}
            />
          </div>

          {confirmandoEliminarCategoria && (
            <ConfirmDialog
              titulo={`¿Eliminar la categoría "${confirmandoEliminarCategoria.nombre}"?`}
              descripcion="Esta acción no se puede deshacer."
              onConfirmar={() => eliminarCategoria(confirmandoEliminarCategoria)}
              onCancelar={() => setConfirmandoEliminarCategoria(null)}
            />
          )}
        </>
      )}

      {vista === "proveedores" && (
        <>
          <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
            <button type="button" className="btn-nuevo" onClick={abrirNuevoProveedor}>
              + Nuevo proveedor
            </button>
            <button type="button" className="btn-editar" onClick={() => setMostrarImportarProveedor(true)}>
              <FileUp size={14} /> Importar desde Excel
            </button>
            <button type="button" className="btn-editar" onClick={exportarProveedores} disabled={exportandoProveedores}>
              <Download size={14} /> {exportandoProveedores ? "Exportando..." : "Exportar"}
            </button>
          </div>
          {errorExportarProveedores && <div className="mensaje-form error">{errorExportarProveedores}</div>}

          {mostrarImportarProveedor && (
            <ImportarExcelModal
              titulo="Importar proveedores desde Excel"
              endpointPlantilla="/api/proveedores/plantilla"
              nombreArchivoPlantilla="plantilla_proveedores.xlsx"
              endpointImportar="/api/proveedores/importar"
              claveSegundaLista="actualizados"
              etiquetaSegundaLista="Se actualizarán (ya existen)"
              onClose={() => setMostrarImportarProveedor(false)}
              onConfirmado={cargarProveedores}
            />
          )}

          {mostrarFormProveedor && (
            <Modal
              titulo={editandoProveedor ? `Editar proveedor: ${formProveedor.nombre}` : "Nuevo proveedor"}
              onClose={cerrarFormProveedor}
              confirmarCierre={JSON.stringify(formProveedor) !== JSON.stringify(formInicialProveedorRef.current)}
            >
              <form className="form-grid" onSubmit={handleSubmitProveedor}>
                <div>
                  <label>Nombre</label>
                  <input
                    type="text"
                    required
                    value={formProveedor.nombre}
                    onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <label>Contacto</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formProveedor.contacto}
                    onChange={(e) => setFormProveedor({ ...formProveedor, contacto: e.target.value })}
                  />
                </div>
                <div>
                  <label>Teléfono</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formProveedor.telefono}
                    onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })}
                  />
                </div>
                <div>
                  <label>Correo</label>
                  <input
                    type="email"
                    placeholder="Opcional"
                    value={formProveedor.email}
                    onChange={(e) => setFormProveedor({ ...formProveedor, email: e.target.value })}
                  />
                </div>
                <div>
                  <label>Notas</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formProveedor.notas}
                    onChange={(e) => setFormProveedor({ ...formProveedor, notas: e.target.value })}
                  />
                </div>
                {editandoProveedor && (
                  <div>
                    <label>Estado</label>
                    <select
                      value={String(formProveedor.activo)}
                      onChange={(e) => setFormProveedor({ ...formProveedor, activo: e.target.value === "true" })}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </div>
                )}
                <button type="submit" disabled={guardandoProveedor}>
                  {guardandoProveedor ? "Guardando..." : editandoProveedor ? "Guardar cambios" : "Crear proveedor"}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrarFormProveedor}>
                  Cancelar
                </button>
              </form>
              {mensajeProveedor && <div className={`mensaje-form ${mensajeProveedor.tipo}`}>{mensajeProveedor.texto}</div>}
            </Modal>
          )}

          <div className="panel">
            <h2>Proveedores</h2>
            <div className="tabla-wrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Contacto</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoProveedores ? (
                    <tr><td colSpan={6} className="empty-state">Cargando...</td></tr>
                  ) : paginacionProveedores.pageItems.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">No hay proveedores registrados.</td></tr>
                  ) : (
                    paginacionProveedores.pageItems.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nombre}</td>
                        <td>{p.contacto || "—"}</td>
                        <td>{p.telefono || "—"}</td>
                        <td>{p.email || "—"}</td>
                        <td>
                          <span className={`badge ${p.activo ? "ok" : "sin_existencias"}`}>{p.activo ? "Activo" : "Inactivo"}</span>
                        </td>
                        <td>
                          <button type="button" className="btn-editar" onClick={() => editarProveedor(p)}>
                            <Pencil size={14} /> Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Paginacion
              paginaActual={paginacionProveedores.paginaActual}
              totalPaginas={paginacionProveedores.totalPaginas}
              desde={paginacionProveedores.desde}
              hasta={paginacionProveedores.hasta}
              total={paginacionProveedores.total}
              etiqueta="proveedores"
              onCambiarPagina={paginacionProveedores.irAPagina}
            />
          </div>
        </>
      )}

      {vista === "almacenes" && (
        <>
          <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
            <button type="button" className="btn-nuevo" onClick={abrirNuevoAlmacen}>
              + Nuevo almacén
            </button>
            <button type="button" className="btn-editar" onClick={exportarAlmacenes} disabled={exportandoAlmacenes}>
              <Download size={14} /> {exportandoAlmacenes ? "Exportando..." : "Exportar"}
            </button>
          </div>
          {errorExportarAlmacenes && <div className="mensaje-form error">{errorExportarAlmacenes}</div>}

          {mostrarFormAlmacen && (
            <Modal
              titulo={editandoAlmacen ? `Editar almacén: ${formAlmacen.nombre}` : "Nuevo almacén"}
              onClose={cerrarFormAlmacen}
              confirmarCierre={JSON.stringify(formAlmacen) !== JSON.stringify(formInicialAlmacenRef.current)}
            >
              <form className="form-grid" onSubmit={handleSubmitAlmacen}>
                <div>
                  <label>Nombre</label>
                  <input
                    type="text"
                    required
                    value={formAlmacen.nombre}
                    onChange={(e) => setFormAlmacen({ ...formAlmacen, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <label>Ubicación</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formAlmacen.ubicacion}
                    onChange={(e) => setFormAlmacen({ ...formAlmacen, ubicacion: e.target.value })}
                  />
                </div>
                <div>
                  <label>Responsable</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formAlmacen.responsable}
                    onChange={(e) => setFormAlmacen({ ...formAlmacen, responsable: e.target.value })}
                  />
                </div>
                {editandoAlmacen && (
                  <div>
                    <label>Estado</label>
                    <select
                      value={String(formAlmacen.activo)}
                      onChange={(e) => setFormAlmacen({ ...formAlmacen, activo: e.target.value === "true" })}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </div>
                )}
                <button type="submit" disabled={guardandoAlmacen}>
                  {guardandoAlmacen ? "Guardando..." : editandoAlmacen ? "Guardar cambios" : "Crear almacén"}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrarFormAlmacen}>
                  Cancelar
                </button>
              </form>
              {mensajeAlmacen && <div className={`mensaje-form ${mensajeAlmacen.tipo}`}>{mensajeAlmacen.texto}</div>}
            </Modal>
          )}

          <div className="panel">
            <h2>Almacenes</h2>
            <div className="tabla-wrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Ubicación</th>
                    <th>Responsable</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoAlmacenes ? (
                    <tr><td colSpan={5} className="empty-state">Cargando...</td></tr>
                  ) : paginacionAlmacenes.pageItems.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">No hay almacenes registrados.</td></tr>
                  ) : (
                    paginacionAlmacenes.pageItems.map((a) => (
                      <tr key={a.id}>
                        <td>{a.nombre}</td>
                        <td>{a.ubicacion || "—"}</td>
                        <td>{a.responsable || "—"}</td>
                        <td>
                          <span className={`badge ${a.activo ? "ok" : "sin_existencias"}`}>{a.activo ? "Activo" : "Inactivo"}</span>
                        </td>
                        <td>
                          <button type="button" className="btn-editar" onClick={() => editarAlmacen(a)}>
                            <Pencil size={14} /> Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Paginacion
              paginaActual={paginacionAlmacenes.paginaActual}
              totalPaginas={paginacionAlmacenes.totalPaginas}
              desde={paginacionAlmacenes.desde}
              hasta={paginacionAlmacenes.hasta}
              total={paginacionAlmacenes.total}
              etiqueta="almacenes"
              onCambiarPagina={paginacionAlmacenes.irAPagina}
            />
          </div>
        </>
      )}
    </section>
  );
}
