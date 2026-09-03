import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { Material, Movimiento, Proveedor } from "../api/types";
import { money, ROL_LABEL, ESTADO_MOVIMIENTO_LABEL } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ComboMaterial } from "../components/ComboMaterial";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Download } from "lucide-react";

const TAMANO_PAGINA = 25;

// Pantalla dedicada a la ACCION de registrar una entrada de material -- el
// historial completo de solo lectura (entradas, salidas, rechazos, bajas,
// devoluciones) vive aparte en Historial.tsx. Separado a pedido explicito
// para que esta pantalla no se sienta "cargada" con todo mezclado, aunque
// igual tiene sus propios filtros y exportacion (acotados solo a entradas).
export function Entradas() {
  const { usuario } = useAuth();

  const [materialesTodos, setMaterialesTodos] = useState<Material[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [entradas, setEntradas] = useState<Movimiento[]>([]);
  const [cargandoTabla, setCargandoTabla] = useState(true);

  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroRef, setFiltroRef] = useState("");
  const [filtroOrden, setFiltroOrden] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");

  const [materialId, setMaterialId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [responsable, setResponsable] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    params.set("tipo", "entrada");
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    if (filtroRef) params.set("ref", filtroRef);
    if (filtroOrden) params.set("orden", filtroOrden);
    if (filtroResponsable) params.set("responsable", filtroResponsable);
    return params;
  }

  function cargarEntradas() {
    setCargandoTabla(true);
    return api
      .get<Movimiento[]>(`/api/movimientos?${construirParamsFiltro().toString()}`)
      .then(setEntradas)
      .finally(() => setCargandoTabla(false));
  }

  function limpiarFiltros() {
    setFiltroEstado("");
    setFiltroDesde("");
    setFiltroHasta("");
    setFiltroRef("");
    setFiltroOrden("");
    setFiltroResponsable("");
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/movimientos/exportar?${construirParamsFiltro().toString()}`, "entradas.xlsx");
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    entradas,
    TAMANO_PAGINA
  );

  useEffect(() => {
    api.get<Material[]>("/api/materiales?activo=true").then(setMaterialesTodos);
    api.get<Proveedor[]>("/api/proveedores").then(setProveedores);
  }, []);

  // No reinicia a la pagina 1 en la primera carga (dejaria "?pagina=1" en la
  // URL sin necesidad) -- solo cuando el usuario de verdad cambia un filtro,
  // que es cuando el listado resultante deja de tener nada que ver con la
  // pagina en la que estaba parado.
  const primeraCargaRef = useRef(true);
  useEffect(() => {
    cargarEntradas();
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroDesde, filtroHasta, filtroRef, filtroOrden, filtroResponsable]);

  function resetFormulario() {
    setMaterialId("");
    setCantidad("");
    setProveedorId("");
    setResponsable("");
    setObservaciones("");
  }

  const materialSeleccionado = materialesTodos.find((m) => String(m.id) === materialId);
  const proveedoresDelMaterial = materialSeleccionado?.proveedores ?? [];
  // Si el material tiene un solo proveedor asociado, se bloquea (no hay nada
  // que elegir). Si tiene varios, se deja elegir pero solo entre esos. Si no
  // tiene ninguno todavia (catalogo viejo), se deja elegir entre todos.
  const proveedorBloqueado = proveedoresDelMaterial.length === 1;
  const opcionesProveedor = proveedoresDelMaterial.length > 0 ? proveedoresDelMaterial : proveedores;

  function abrirNuevo() {
    resetFormulario();
    // el almacenista logueado es quien entrega -- el servidor arma "Nombre - Cargo"
    // igual, esto es solo para que el campo (deshabilitado) muestre lo mismo que va a quedar guardado
    setResponsable(usuario ? `${usuario.nombre} - ${ROL_LABEL[usuario.rol]}` : "");
    setMensaje(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    resetFormulario();
    setMensaje(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!materialId) {
      setMensaje({ texto: "Selecciona un material de la lista antes de registrar.", tipo: "error" });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    try {
      await api.post("/api/movimientos", {
        material_id: materialId,
        tipo: "entrada",
        cantidad,
        proveedor_id: proveedorId,
        responsable,
        observaciones,
      });
      setMostrarForm(false);
      resetFormulario();
      await cargarEntradas();
      api.get<Material[]>("/api/materiales?activo=true").then(setMaterialesTodos);
    } catch (err) {
      setMensaje({
        texto: err instanceof ApiClientError ? err.message : "Error al registrar el movimiento",
        tipo: "error",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="view">
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
          + Registrar entrada
        </button>
      </div>

      <div className="aviso-salidas">
        ¿Necesitas registrar una <strong>salida</strong> de material? Ahora se hace desde{" "}
        <NavLink to="/salidas">Salidas</NavLink> y queda pendiente de aprobación de un supervisor.
      </div>

      {mostrarForm && (
        <Modal
          titulo="Registrar entrada de material"
          onClose={cerrarForm}
          confirmarCierre={Boolean(materialId || cantidad || proveedorId || observaciones)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <ComboMaterial
              materiales={materialesTodos}
              materialId={materialId}
              onSeleccionar={(id) => {
                setMaterialId(id);
                const mat = materialesTodos.find((m) => String(m.id) === id);
                setProveedorId(mat?.proveedores.length === 1 ? String(mat.proveedores[0].id) : "");
              }}
            />
            <div>
              <label>Cantidad</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div>
              <label>Proveedor</label>
              <select
                required
                disabled={proveedorBloqueado}
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
              >
                <option value="">Selecciona un proveedor</option>
                {opcionesProveedor.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              {materialId && proveedoresDelMaterial.length === 0 && (
                <div className="stock-aviso">
                  Este material no tiene proveedor en su ficha — selecciónalo aquí o complétalo editando el material.
                </div>
              )}
              {materialId && proveedoresDelMaterial.length > 1 && (
                <div className="stock-aviso">¿Cuál de los proveedores de este material entregó esta entrada?</div>
              )}
            </div>
            <div>
              <label>Responsable</label>
              <input type="text" value={responsable} disabled />
            </div>
            <div>
              <label>Observaciones</label>
              <input
                type="text"
                placeholder="Opcional"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
            <button type="submit" disabled={enviando}>
              {enviando ? "Registrando..." : "Registrar entrada"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarForm}>
              Cancelar
            </button>
          </form>
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </Modal>
      )}

      <div className="panel">
        <h2>Entradas registradas</h2>
        <div className="filtros-mov">
          <div>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="devolucion">Devuelto a stock</option>
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
            <input
              type="number"
              inputMode="numeric"
              placeholder="Buscar RF..."
              value={filtroRef}
              onChange={(e) => setFiltroRef(e.target.value)}
            />
          </div>
          <div>
            <label>N° Orden</label>
            <input
              type="text"
              placeholder="OE-001..."
              value={filtroOrden}
              onChange={(e) => setFiltroOrden(e.target.value)}
            />
          </div>
          <div>
            <label>Responsable</label>
            <input
              type="text"
              placeholder="Buscar almacenista..."
              value={filtroResponsable}
              onChange={(e) => setFiltroResponsable(e.target.value)}
            />
          </div>
          <button type="button" className="btn-editar" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
          <button type="button" className="btn-editar" onClick={exportar} disabled={exportando}>
            <Download size={14} /> {exportando ? "Exportando..." : "Exportar"}
          </button>
        </div>
        {errorExportar && <div className="mensaje-form error">{errorExportar}</div>}
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>N° Orden</th>
                <th>RF</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Estado</th>
                <th>Proveedor</th>
                <th>Responsable</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoTabla ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    Aún no hay entradas registradas.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.creado_en).toLocaleString("es-CO")}</td>
                    <td>{m.numero_orden || "—"}</td>
                    <td>{m.rf_relacionada || "N/A"}</td>
                    <td>{m.producto}</td>
                    <td>
                      {money(m.cantidad)} {m.unidad}
                    </td>
                    <td>
                      {m.estado ? (
                        <span className={`badge ${m.estado}`}>{ESTADO_MOVIMIENTO_LABEL[m.estado]}</span>
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td>{m.proveedor_nombre || "N/A"}</td>
                    <td>{m.responsable || "—"}</td>
                    <td>{m.observaciones || "—"}</td>
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
          etiqueta="entradas"
          onCambiarPagina={irAPagina}
        />
      </div>
    </section>
  );
}
