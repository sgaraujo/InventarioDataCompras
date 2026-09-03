import { useEffect, useRef, useState } from "react";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { Movimiento } from "../api/types";
import { money, ESTADO_MOVIMIENTO_LABEL } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Download } from "lucide-react";

const TAMANO_PAGINA = 25;

// Vista de solo lectura del historial combinado (entradas, salidas, rechazos,
// cancelaciones, bajas de material, devoluciones). Separada de Entradas.tsx
// (donde vive la accion de registrar) a pedido explicito, para no mezclar la
// accion con la consulta.
export function Historial() {
  const { usuario } = useAuth();

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargandoTabla, setCargandoTabla] = useState(true);

  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroRef, setFiltroRef] = useState("");
  const [filtroOrden, setFiltroOrden] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    if (filtroRef) params.set("ref", filtroRef);
    if (filtroOrden) params.set("orden", filtroOrden);
    if (filtroResponsable) params.set("responsable", filtroResponsable);
    return params;
  }

  function cargarMovimientos() {
    setCargandoTabla(true);
    return api
      .get<Movimiento[]>(`/api/movimientos?${construirParamsFiltro().toString()}`)
      .then(setMovimientos)
      .finally(() => setCargandoTabla(false));
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/movimientos/exportar?${construirParamsFiltro().toString()}`, "movimientos.xlsx");
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    movimientos,
    TAMANO_PAGINA
  );

  // No reinicia a la pagina 1 en la primera carga -- solo cuando el usuario
  // de verdad cambia un filtro.
  const primeraCargaRef = useRef(true);
  useEffect(() => {
    cargarMovimientos();
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, filtroEstado, filtroDesde, filtroHasta, filtroRef, filtroOrden, filtroResponsable]);

  function limpiarFiltros() {
    setFiltroTipo("");
    setFiltroEstado("");
    setFiltroDesde("");
    setFiltroHasta("");
    setFiltroRef("");
    setFiltroOrden("");
    setFiltroResponsable("");
  }

  return (
    <section className="view">
      <div className="panel">
        <h2>Historial de movimientos</h2>
        <div className="filtros-mov">
          <div>
            <label>Tipo</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="lista">Material OK</option>
              <option value="rechazada">Rechazada</option>
              <option value="cancelada">Cancelada</option>
              <option value="baja">Baja de material</option>
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
              placeholder="OS-001, OE-001..."
              value={filtroOrden}
              onChange={(e) => setFiltroOrden(e.target.value)}
            />
          </div>
          {usuario?.rol !== "tecnico-ejecutor" && (
            <div>
              <label>Responsable</label>
              <input
                type="text"
                placeholder="Buscar técnico o almacenista..."
                value={filtroResponsable}
                onChange={(e) => setFiltroResponsable(e.target.value)}
              />
            </div>
          )}
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
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Estado</th>
                <th>Proveedor</th>
                <th>Responsable</th>
                <th>RF</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoTabla ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    No hay movimientos con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.creado_en).toLocaleString("es-CO")}</td>
                    <td>{m.numero_orden || "—"}</td>
                    <td>{m.producto}</td>
                    <td>
                      <span className={`badge ${m.tipo}`}>{m.tipo === "entrada" ? "Entrada" : "Salida"}</span>
                    </td>
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
                    <td>{m.rf_relacionada || "N/A"}</td>
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
          etiqueta="movimientos"
          onCambiarPagina={irAPagina}
        />
      </div>
    </section>
  );
}
