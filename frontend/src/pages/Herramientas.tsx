import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { EstadoDevolucionHerramienta, EstadoFisico, Herramienta, PrestamoHerramienta, Receptor } from "../api/types";
import { ROL_LABEL, ESTADO_DISPONIBILIDAD_LABEL, money } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ImportarExcelModal } from "../components/ImportarExcelModal";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, FileUp, Download, Undo2, RotateCcw } from "lucide-react";

const TAMANO_PAGINA = 25;
const ESTADOS_FISICOS: EstadoFisico[] = ["Nuevo", "Bueno", "Regular", "Malo"];
const ESTADOS_DEVOLUCION: EstadoDevolucionHerramienta[] = ["Nuevo", "Bueno", "Regular", "Malo", "Perdido"];

const FORM_VACIO = {
  id: null as number | null,
  descripcion: "",
  marca: "",
  modelo: "",
  serial: "",
  material: "",
  empaque: "",
  accesorios: "",
  estado_fisico: "Nuevo" as EstadoFisico,
  cantidad_total: "",
};

const PRESTAR_VACIO = {
  cantidad: "",
  recibe_usuario_id: "",
  rf_relacionada: "",
  estado_entrega: "Nuevo" as EstadoFisico,
  observaciones: "",
};

const DEVOLVER_VACIO = {
  estado_devolucion: "Bueno" as EstadoDevolucionHerramienta,
  observaciones: "",
};

// Buscador de "a quien se presta": escribe para filtrar por nombre, cada
// resultado muestra el rol junto al nombre para no confundir tecnicos y
// supervisores con nombres parecidos.
function SelectorReceptor({
  receptores,
  valor,
  onCambiar,
}: {
  receptores: Receptor[];
  valor: string;
  onCambiar: (id: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("click", onClickFuera, true);
    return () => document.removeEventListener("click", onClickFuera, true);
  }, []);

  const seleccionado = receptores.find((r) => String(r.id) === valor);
  const filtrados = receptores.filter((r) => r.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div className="selector-receptor" ref={ref}>
      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={abierto ? busqueda : seleccionado ? `${seleccionado.nombre} (${ROL_LABEL[seleccionado.rol]})` : ""}
        onFocus={() => {
          setAbierto(true);
          setBusqueda("");
        }}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {abierto && (
        <div className="selector-receptor__lista">
          {filtrados.length === 0 ? (
            <div className="selector-receptor__vacio">Sin resultados</div>
          ) : (
            filtrados.map((r) => (
              <button
                type="button"
                key={r.id}
                className="selector-receptor__item"
                onClick={() => {
                  onCambiar(String(r.id));
                  setAbierto(false);
                  setBusqueda("");
                }}
              >
                {r.nombre}
                <span className="rol-tag">{ROL_LABEL[r.rol]}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Herramientas() {
  const { usuario } = useAuth();
  // Tecnico/supervisor solo consultan su propio historial, sin catalogo ni
  // acciones -- el backend ya los limita a sus propios prestamos (ver
  // construirFiltroPrestamos en herramientas.js), aca solo se adapta la UI.
  const esSoloLectura = usuario?.rol === "tecnico-ejecutor" || usuario?.rol === "supervisor";

  const [vista, setVista] = useState<"catalogo" | "historial">(esSoloLectura ? "historial" : "catalogo");

  // ---------------- Catalogo ----------------
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [receptores, setReceptores] = useState<Receptor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [filtroDisponibilidad, setFiltroDisponibilidad] = useState<"" | "disponible" | "agotada">("");

  function construirParamsCatalogo() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filtroDisponibilidad) params.set("estado", filtroDisponibilidad);
    return params;
  }

  function cargarHerramientas() {
    setCargando(true);
    return api
      .get<Herramienta[]>(`/api/herramientas?${construirParamsCatalogo().toString()}`)
      .then(setHerramientas)
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    if (esSoloLectura) return;
    cargarHerramientas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filtroDisponibilidad]);

  const [exportandoCatalogo, setExportandoCatalogo] = useState(false);
  const [errorExportarCatalogo, setErrorExportarCatalogo] = useState<string | null>(null);

  async function exportarCatalogo() {
    setExportandoCatalogo(true);
    setErrorExportarCatalogo(null);
    try {
      await descargarArchivo(`/api/herramientas/exportar?${construirParamsCatalogo().toString()}`, "herramientas.xlsx");
    } catch (err) {
      setErrorExportarCatalogo(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportandoCatalogo(false);
    }
  }

  useEffect(() => {
    if (esSoloLectura) return;
    api.get<Receptor[]>("/api/herramientas/receptores").then(setReceptores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState(FORM_VACIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const editando = form.id !== null;
  const herramientaEditando = editando ? herramientas.find((h) => h.id === form.id) : undefined;
  const formInicialRef = useRef(FORM_VACIO);

  function abrirNuevo() {
    setForm(FORM_VACIO);
    formInicialRef.current = FORM_VACIO;
    setMensaje(null);
    setMostrarForm(true);
  }

  function editar(h: Herramienta) {
    const datos = {
      id: h.id,
      descripcion: h.descripcion,
      marca: h.marca ?? "",
      modelo: h.modelo ?? "",
      serial: h.serial ?? "",
      material: h.material ?? "",
      empaque: h.empaque ?? "",
      accesorios: h.accesorios ?? "",
      estado_fisico: h.estado_fisico,
      cantidad_total: h.cantidad_total,
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
      const cuerpo = {
        descripcion: form.descripcion,
        marca: form.marca || undefined,
        modelo: form.modelo || undefined,
        serial: form.serial || undefined,
        material: form.material || undefined,
        empaque: form.empaque || undefined,
        accesorios: form.accesorios || undefined,
        estado_fisico: form.estado_fisico,
        cantidad_total: form.cantidad_total,
      };
      if (editando) {
        await api.put(`/api/herramientas/${form.id}`, cuerpo);
      } else {
        await api.post("/api/herramientas", cuerpo);
      }
      setMostrarForm(false);
      setForm(FORM_VACIO);
      await cargarHerramientas();
    } catch (err) {
      setMensaje({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar la herramienta",
        tipo: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  // ---------------- Prestar ----------------
  const [prestarPara, setPrestarPara] = useState<Herramienta | null>(null);
  const [formPrestar, setFormPrestar] = useState(PRESTAR_VACIO);
  const [guardandoPrestamo, setGuardandoPrestamo] = useState(false);
  const [mensajePrestamo, setMensajePrestamo] = useState<string | null>(null);

  function abrirPrestar(h: Herramienta) {
    setPrestarPara(h);
    setFormPrestar(PRESTAR_VACIO);
    setMensajePrestamo(null);
  }

  function cerrarPrestar() {
    setPrestarPara(null);
    setFormPrestar(PRESTAR_VACIO);
    setMensajePrestamo(null);
  }

  async function handlePrestar(e: FormEvent) {
    e.preventDefault();
    if (!prestarPara) return;
    setGuardandoPrestamo(true);
    setMensajePrestamo(null);
    try {
      await api.post(`/api/herramientas/${prestarPara.id}/prestar`, {
        cantidad: formPrestar.cantidad,
        recibe_usuario_id: formPrestar.recibe_usuario_id,
        rf_relacionada: formPrestar.rf_relacionada || undefined,
        estado_entrega: formPrestar.estado_entrega,
        observaciones: formPrestar.observaciones || undefined,
      });
      cerrarPrestar();
      await cargarHerramientas();
    } catch (err) {
      setMensajePrestamo(err instanceof ApiClientError ? err.message : "Error al registrar el préstamo");
    } finally {
      setGuardandoPrestamo(false);
    }
  }

  // ---------------- Historial de prestamos ----------------
  const [prestamos, setPrestamos] = useState<PrestamoHerramienta[]>([]);
  const [cargandoPrestamos, setCargandoPrestamos] = useState(false);
  const [filtroHerramienta, setFiltroHerramienta] = useState("");
  const [filtroRecibe, setFiltroRecibe] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"" | "prestado" | "devuelto">("");
  const [filtroRf, setFiltroRf] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  function construirParamsHistorial() {
    const params = new URLSearchParams();
    if (filtroHerramienta) params.set("herramienta_id", filtroHerramienta);
    if (filtroRecibe) params.set("recibe_usuario_id", filtroRecibe);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroRf) params.set("rf", filtroRf);
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    return params;
  }

  function cargarPrestamos() {
    setCargandoPrestamos(true);
    return api
      .get<PrestamoHerramienta[]>(`/api/herramientas/prestamos?${construirParamsHistorial().toString()}`)
      .then(setPrestamos)
      .finally(() => setCargandoPrestamos(false));
  }

  useEffect(() => {
    if (vista === "historial") cargarPrestamos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, filtroHerramienta, filtroRecibe, filtroEstado, filtroRf, filtroDesde, filtroHasta]);

  function limpiarFiltrosHistorial() {
    setFiltroHerramienta("");
    setFiltroRecibe("");
    setFiltroEstado("");
    setFiltroRf("");
    setFiltroDesde("");
    setFiltroHasta("");
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportarPrestamos() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(
        `/api/herramientas/prestamos/exportar?${construirParamsHistorial().toString()}`,
        "prestamos_herramientas.xlsx"
      );
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  // ---------------- Devolver ----------------
  const [devolverPara, setDevolverPara] = useState<PrestamoHerramienta | null>(null);
  const [formDevolver, setFormDevolver] = useState(DEVOLVER_VACIO);
  const [guardandoDevolucion, setGuardandoDevolucion] = useState(false);
  const [mensajeDevolucion, setMensajeDevolucion] = useState<string | null>(null);

  function abrirDevolver(p: PrestamoHerramienta) {
    setDevolverPara(p);
    setFormDevolver(DEVOLVER_VACIO);
    setMensajeDevolucion(null);
  }

  function cerrarDevolver() {
    setDevolverPara(null);
    setFormDevolver(DEVOLVER_VACIO);
    setMensajeDevolucion(null);
  }

  async function handleDevolver(e: FormEvent) {
    e.preventDefault();
    if (!devolverPara) return;
    setGuardandoDevolucion(true);
    setMensajeDevolucion(null);
    try {
      await api.post(`/api/herramientas/prestamos/${devolverPara.id}/devolver`, {
        estado_devolucion: formDevolver.estado_devolucion,
        observaciones: formDevolver.observaciones || undefined,
      });
      cerrarDevolver();
      await Promise.all([cargarHerramientas(), cargarPrestamos()]);
    } catch (err) {
      setMensajeDevolucion(err instanceof ApiClientError ? err.message : "Error al registrar la devolución");
    } finally {
      setGuardandoDevolucion(false);
    }
  }

  // ---------------- Recuperar (herramienta que se daba por perdida) ----------------
  const [recuperandoId, setRecuperandoId] = useState<number | null>(null);
  const [errorRecuperar, setErrorRecuperar] = useState<string | null>(null);

  async function recuperar(p: PrestamoHerramienta) {
    setRecuperandoId(p.id);
    setErrorRecuperar(null);
    try {
      await api.post(`/api/herramientas/prestamos/${p.id}/recuperar`);
      await Promise.all([cargarHerramientas(), cargarPrestamos()]);
    } catch (err) {
      setErrorRecuperar(err instanceof ApiClientError ? err.message : "Error al marcar como recuperada");
    } finally {
      setRecuperandoId(null);
    }
  }

  const paginacionCatalogo = usePaginacion(herramientas, TAMANO_PAGINA);
  const paginacionHistorial = usePaginacion(prestamos, TAMANO_PAGINA);

  return (
    <section className="view">
      {!esSoloLectura && (
        <div className="tabs">
          <button
            type="button"
            className={`tab${vista === "catalogo" ? " active" : ""}`}
            onClick={() => setVista("catalogo")}
          >
            Catálogo
          </button>
          <button
            type="button"
            className={`tab${vista === "historial" ? " active" : ""}`}
            onClick={() => setVista("historial")}
          >
            Historial de préstamos
          </button>
        </div>
      )}

      {!esSoloLectura && vista === "catalogo" && (
        <>
          <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
              + Nueva herramienta
            </button>
          </div>

          <div className="filtros-mov">
            <div>
              <label>Buscar</label>
              <input
                type="text"
                placeholder="Nombre, marca, modelo o serial..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <label>Disponibilidad</label>
              <select value={filtroDisponibilidad} onChange={(e) => setFiltroDisponibilidad(e.target.value as typeof filtroDisponibilidad)}>
                <option value="">Todas</option>
                <option value="disponible">Disponibles</option>
                <option value="agotada">Agotadas</option>
              </select>
            </div>
            <button type="button" className="btn-editar" onClick={() => setMostrarImportar(true)}>
              <FileUp size={14} /> Importar desde Excel
            </button>
            <button type="button" className="btn-editar" onClick={exportarCatalogo} disabled={exportandoCatalogo}>
              <Download size={14} /> {exportandoCatalogo ? "Exportando..." : "Exportar"}
            </button>
          </div>
          {errorExportarCatalogo && <div className="mensaje-form error">{errorExportarCatalogo}</div>}

          {mostrarImportar && (
            <ImportarExcelModal
              titulo="Importar herramientas desde Excel"
              endpointPlantilla="/api/herramientas/plantilla"
              nombreArchivoPlantilla="plantilla_herramientas.xlsx"
              endpointImportar="/api/herramientas/importar"
              claveSegundaLista="existentes"
              etiquetaSegundaLista="Ya existen (no se importarán)"
              onClose={() => setMostrarImportar(false)}
              onConfirmado={cargarHerramientas}
            />
          )}

          {mostrarForm && (
            <Modal
              titulo={editando ? `Editar herramienta: ${form.descripcion}` : "Nueva herramienta"}
              onClose={cerrarForm}
              confirmarCierre={JSON.stringify(form) !== JSON.stringify(formInicialRef.current)}
            >
              <form className="form-grid" onSubmit={handleSubmit}>
                <div className="full">
                  <label>Descripción</label>
                  <input
                    type="text"
                    required
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  />
                </div>
                <div>
                  <label>Marca</label>
                  <input type="text" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                </div>
                <div>
                  <label>Modelo</label>
                  <input type="text" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
                </div>
                <div>
                  <label>Serial</label>
                  <input type="text" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} />
                </div>
                <div>
                  <label>Material</label>
                  <input
                    type="text"
                    placeholder="Acero, Plástico..."
                    value={form.material}
                    onChange={(e) => setForm({ ...form, material: e.target.value })}
                  />
                </div>
                <div>
                  <label>Empaque</label>
                  <input
                    type="text"
                    placeholder="Unidad, Set x 13 piezas..."
                    value={form.empaque}
                    onChange={(e) => setForm({ ...form, empaque: e.target.value })}
                  />
                </div>
                <div className="full">
                  <label>Accesorios</label>
                  <input
                    type="text"
                    value={form.accesorios}
                    onChange={(e) => setForm({ ...form, accesorios: e.target.value })}
                  />
                </div>
                <div>
                  <label>Estado</label>
                  <select
                    value={form.estado_fisico}
                    onChange={(e) => setForm({ ...form, estado_fisico: e.target.value as EstadoFisico })}
                  >
                    {ESTADOS_FISICOS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Cantidad {editando ? "total" : ""}</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={form.cantidad_total}
                    onChange={(e) => setForm({ ...form, cantidad_total: e.target.value })}
                  />
                  {editando && (
                    <div className="stock-aviso">
                      Disponible actual: {money(herramientaEditando?.cantidad_disponible ?? 0)}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear herramienta"}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrarForm}>
                  Cancelar
                </button>
              </form>
              {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
            </Modal>
          )}

          {prestarPara && (
            <Modal titulo={`Prestar: ${prestarPara.descripcion}`} onClose={cerrarPrestar} confirmarCierre>
              <form className="form-grid" onSubmit={handlePrestar}>
                <div>
                  <label>Cantidad (disponible: {money(prestarPara.cantidad_disponible)})</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max={prestarPara.cantidad_disponible}
                    required
                    value={formPrestar.cantidad}
                    onChange={(e) => setFormPrestar({ ...formPrestar, cantidad: e.target.value })}
                  />
                </div>
                <div>
                  <label>Estado de entrega</label>
                  <select
                    value={formPrestar.estado_entrega}
                    onChange={(e) => setFormPrestar({ ...formPrestar, estado_entrega: e.target.value as EstadoFisico })}
                  >
                    {ESTADOS_FISICOS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="full">
                  <label>¿Para quién es?</label>
                  <SelectorReceptor
                    receptores={receptores}
                    valor={formPrestar.recibe_usuario_id}
                    onCambiar={(id) => setFormPrestar({ ...formPrestar, recibe_usuario_id: id })}
                  />
                </div>
                <div>
                  <label>RF relacionada</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formPrestar.rf_relacionada}
                    onChange={(e) => setFormPrestar({ ...formPrestar, rf_relacionada: e.target.value })}
                  />
                </div>
                <div className="full">
                  <label>Observaciones</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formPrestar.observaciones}
                    onChange={(e) => setFormPrestar({ ...formPrestar, observaciones: e.target.value })}
                  />
                </div>
                <button type="submit" disabled={guardandoPrestamo || !formPrestar.recibe_usuario_id}>
                  {guardandoPrestamo ? "Guardando..." : "Prestar"}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrarPrestar}>
                  Cancelar
                </button>
              </form>
              {mensajePrestamo && <div className="mensaje-form error">{mensajePrestamo}</div>}
            </Modal>
          )}

          <div className="panel">
            <div className="tabla-wrap">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Serial</th>
                    <th>Material</th>
                    <th>Empaque</th>
                    <th>Estado</th>
                    <th>Cantidad total</th>
                    <th>Disponible</th>
                    <th>Disponibilidad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr>
                      <td colSpan={11} className="empty-state">
                        Cargando...
                      </td>
                    </tr>
                  ) : paginacionCatalogo.pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty-state">
                        No se encontraron herramientas con ese filtro.
                      </td>
                    </tr>
                  ) : (
                    paginacionCatalogo.pageItems.map((h) => (
                      <tr key={h.id}>
                        <td>{h.descripcion}</td>
                        <td>{h.marca || "—"}</td>
                        <td>{h.modelo || "—"}</td>
                        <td>{h.serial || "—"}</td>
                        <td>{h.material || "—"}</td>
                        <td>{h.empaque || "—"}</td>
                        <td>
                          <span className={`badge ${h.estado_fisico.toLowerCase()}`}>{h.estado_fisico}</span>
                        </td>
                        <td>{money(h.cantidad_total)}</td>
                        <td>{money(h.cantidad_disponible)}</td>
                        <td>
                          <span className={`badge ${h.estado}`}>{ESTADO_DISPONIBILIDAD_LABEL[h.estado]}</span>
                        </td>
                        <td>
                          <div className="acciones-solicitud">
                            <button type="button" className="btn-editar" onClick={() => editar(h)}>
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              className="btn-aprobar"
                              disabled={Number(h.cantidad_disponible) <= 0}
                              onClick={() => abrirPrestar(h)}
                            >
                              Prestar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Paginacion
              paginaActual={paginacionCatalogo.paginaActual}
              totalPaginas={paginacionCatalogo.totalPaginas}
              desde={paginacionCatalogo.desde}
              hasta={paginacionCatalogo.hasta}
              total={paginacionCatalogo.total}
              etiqueta="herramientas"
              onCambiarPagina={paginacionCatalogo.irAPagina}
            />
          </div>
        </>
      )}

      {vista === "historial" && (
        <div className="panel">
          <div className="filtros-mov">
            {!esSoloLectura && (
              <div>
                <label>Herramienta</label>
                <select value={filtroHerramienta} onChange={(e) => setFiltroHerramienta(e.target.value)}>
                  <option value="">Todas</option>
                  {herramientas.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.descripcion}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!esSoloLectura && (
              <div>
                <label>Recibe</label>
                <select value={filtroRecibe} onChange={(e) => setFiltroRecibe(e.target.value)}>
                  <option value="">Todos</option>
                  {receptores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({ROL_LABEL[r.rol]})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label>Estado</label>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}>
                <option value="">Todos</option>
                <option value="prestado">Prestado</option>
                <option value="devuelto">Devuelto</option>
              </select>
            </div>
            <div>
              <label>Desde</label>
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
            </div>
            <div>
              <label>Hasta</label>
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
            </div>
            <div>
              <label>RF</label>
              <input type="text" placeholder="Buscar RF..." value={filtroRf} onChange={(e) => setFiltroRf(e.target.value)} />
            </div>
            <button type="button" className="btn-editar" onClick={limpiarFiltrosHistorial}>
              Limpiar filtros
            </button>
            {!esSoloLectura && (
              <button type="button" className="btn-editar" onClick={exportarPrestamos} disabled={exportando}>
                <Download size={14} /> {exportando ? "Exportando..." : "Exportar"}
              </button>
            )}
          </div>
          {errorExportar && <div className="mensaje-form error">{errorExportar}</div>}
          {errorRecuperar && <div className="mensaje-form error">{errorRecuperar}</div>}

          {devolverPara && (
            <Modal titulo={`Registrar devolución: ${devolverPara.herramienta_descripcion}`} onClose={cerrarDevolver} confirmarCierre>
              <form className="form-grid" onSubmit={handleDevolver}>
                <div>
                  <label>Estado en que vuelve</label>
                  <select
                    value={formDevolver.estado_devolucion}
                    onChange={(e) => setFormDevolver({ ...formDevolver, estado_devolucion: e.target.value as EstadoDevolucionHerramienta })}
                  >
                    {ESTADOS_DEVOLUCION.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="full">
                  <label>Observaciones</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formDevolver.observaciones}
                    onChange={(e) => setFormDevolver({ ...formDevolver, observaciones: e.target.value })}
                  />
                </div>
                {formDevolver.estado_devolucion === "Perdido" && (
                  <div className="full stock-aviso">
                    No se sumará de vuelta a la cantidad disponible.
                  </div>
                )}
                <button type="submit" disabled={guardandoDevolucion}>
                  {guardandoDevolucion ? "Guardando..." : "Registrar devolución"}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrarDevolver}>
                  Cancelar
                </button>
              </form>
              {mensajeDevolucion && <div className="mensaje-form error">{mensajeDevolucion}</div>}
            </Modal>
          )}

          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Herramienta</th>
                  <th>Cantidad</th>
                  <th>Recibe</th>
                  <th>RF</th>
                  <th>Prestado por</th>
                  <th>Fecha préstamo</th>
                  <th>Estado</th>
                  <th>Estado devolución</th>
                  <th>Fecha devolución</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargandoPrestamos ? (
                  <tr>
                    <td colSpan={10} className="empty-state">
                      Cargando...
                    </td>
                  </tr>
                ) : paginacionHistorial.pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-state">
                      No hay préstamos con ese filtro.
                    </td>
                  </tr>
                ) : (
                  paginacionHistorial.pageItems.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.herramienta_descripcion}
                        {p.herramienta_marca ? ` — ${p.herramienta_marca}` : ""}
                      </td>
                      <td>{money(p.cantidad)}</td>
                      <td>
                        {p.recibe_nombre} <span className="rol-tag">{ROL_LABEL[p.recibe_rol]}</span>
                      </td>
                      <td>{p.rf_relacionada || "—"}</td>
                      <td>{p.prestado_por_nombre || "—"}</td>
                      <td>{new Date(p.prestado_en).toLocaleString("es-CO")}</td>
                      <td>
                        {p.estado === "prestado" ? (
                          <span className="badge prestado">Prestado</span>
                        ) : p.estado_devolucion === "Perdido" ? (
                          <span className="badge perdido">Perdida</span>
                        ) : (
                          <span className="badge devuelto">Devuelto</span>
                        )}
                      </td>
                      <td>
                        {p.estado_devolucion ? (
                          <span className={`badge ${p.estado_devolucion.toLowerCase()}`}>{p.estado_devolucion}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{p.devuelto_en ? new Date(p.devuelto_en).toLocaleString("es-CO") : "—"}</td>
                      <td>
                        {!esSoloLectura && (
                          <div className="acciones-solicitud">
                            {p.estado === "prestado" && (
                              <button type="button" className="btn-editar" onClick={() => abrirDevolver(p)}>
                                <Undo2 size={14} /> Registrar devolución
                              </button>
                            )}
                            {p.estado === "devuelto" && p.estado_devolucion === "Perdido" && (
                              <button
                                type="button"
                                className="btn-aprobar"
                                disabled={recuperandoId === p.id}
                                onClick={() => recuperar(p)}
                              >
                                <RotateCcw size={14} /> {recuperandoId === p.id ? "Guardando..." : "Marcar como recuperada"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Paginacion
            paginaActual={paginacionHistorial.paginaActual}
            totalPaginas={paginacionHistorial.totalPaginas}
            desde={paginacionHistorial.desde}
            hasta={paginacionHistorial.hasta}
            total={paginacionHistorial.total}
            etiqueta="préstamos"
            onCambiarPagina={paginacionHistorial.irAPagina}
          />
        </div>
      )}
    </section>
  );
}
