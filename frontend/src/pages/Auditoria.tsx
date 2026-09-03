import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { RegistroAuditoria, ResumenDiarioAuditoria, ResumenAccionAuditoria } from "../api/types";
import { ACCION_LABEL, ENTIDAD_LABEL } from "../lib/labels";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Download } from "lucide-react";

const TAMANO_PAGINA = 25;

// "2026-08-21" -> "21 ago" (eje X del grafico de actividad diaria)
function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

// Texto del rango activo para el titulo de los graficos resumen -- si el
// usuario no filtro Desde/Hasta, muestra el rango por defecto que ya aplica
// el backend (ver rangoFechas en auditoria.js); si filtro, muestra el rango
// real en vez de dejar el texto fijo desactualizado.
function rangoLabel(desde: string, hasta: string, porDefecto: string): string {
  if (!desde && !hasta) return porDefecto;
  if (desde && hasta) return `${desde} a ${hasta}`;
  return desde ? `desde ${desde}` : `hasta ${hasta}`;
}

// Mismo color que ya usan los badges de "Acción" en la tabla de abajo (ver
// el <td> de Acción mas adelante): crear=verde, actualizar=ambar, eliminar=rojo.
const COLOR_ACCION: Record<string, string> = {
  crear: "#2e8b3d",
  actualizar: "#b45309",
  eliminar: "#c0392b",
};

function resumenDetalle(r: RegistroAuditoria): string {
  const d = r.detalles;
  if (!d) return "—";
  switch (r.entidad) {
    case "materiales":
      // La importacion masiva registra un resumen (sin producto/codigo
      // puntual, es la operacion completa) en vez del detalle de un material
      // individual -- necesita su propio formato o cae en "?" sin decir nada.
      if (d.importacion) {
        return `Importación masiva de Excel — ${d.creados ?? 0} creado(s), ${d.actualizados ?? 0} actualizado(s)`;
      }
      return `${d.producto ?? "?"}${d.codigo ? " · " + d.codigo : ""}`;
    case "movimientos":
      return `${d.tipo === "entrada" ? "Entrada" : "Salida"} de ${d.cantidad ?? "?"} (material #${d.material_id ?? "?"})`;
    case "usuarios":
      return `${d.nombre ?? "?"} (${d.email ?? "?"}) · rol: ${d.rol ?? "?"}`;
    case "categorias":
      if (d.importacion) {
        return `Importación masiva de Excel — ${d.creadas ?? 0} creada(s)`;
      }
      return String(d.nombre ?? "?");
    case "proveedores":
      if (d.importacion) {
        return `Importación masiva de Excel — ${d.creados ?? 0} creado(s), ${d.actualizados ?? 0} actualizado(s)`;
      }
      return String(d.nombre ?? "?");
    case "almacenes":
      return String(d.nombre ?? "?");
    case "herramientas":
      if (d.importacion) {
        return `Importación masiva de Excel — ${d.creados ?? 0} creado(s)`;
      }
      return `${d.descripcion ?? "?"}${d.marca ? " · " + d.marca : ""}`;
    case "prestamos_herramienta":
      return `${d.cantidad ?? "?"} unidad(es) — estado: ${d.estado ?? "?"}${d.estado_devolucion ? ` (${d.estado_devolucion})` : ""}`;
    case "solicitudes_salida": {
      // Al crear, "detalles" trae la solicitud completa (con items); al aprobar/
      // rechazar/reenviar/agregar-material, trae solo un resumen chico.
      if (Array.isArray(d.items)) {
        return (
          d.items
            .map((it: { producto?: string; cantidad?: string | number; unidad?: string }) => `${it.producto ?? "?"} (${it.cantidad ?? "?"} ${it.unidad ?? ""})`)
            .join(", ") || "sin materiales"
        );
      }
      const partes = [
        d.estado ? `Estado: ${d.estado}` : null,
        d.motivo ? `Motivo: ${d.motivo}` : null,
        d.nota ? `Nota: ${d.nota}` : null,
        d.material_agregado ? `Material agregado: ${d.material_agregado}` : null,
      ].filter(Boolean);
      return partes.length ? partes.join(" — ") : "—";
    }
    case "solicitud_salida_devoluciones": {
      if (Array.isArray(d.items)) {
        const items = d.items as {
          producto?: string;
          cantidad_sobrante?: string | number;
          disposicion?: string | null;
        }[];
        const conSobrante = items.filter((it) => Number(it.cantidad_sobrante) > 0);
        if (!conSobrante.length) return `${items.length} material(es) reportado(s), sin sobrante`;
        return conSobrante
          .map((it) => `${it.producto ?? "?"} (${it.disposicion ? (it.disposicion === "stock" ? "sumado a stock" : "desecho") : "pendiente"})`)
          .join(", ");
      }
      // Transiciones de fase posterior a "Cerrada" (2026-09-01, en pruebas):
      // detalles = { fase_cierre: "calidad" | "finalizado" | "facturado" | null }.
      if ("fase_cierre" in d) {
        return d.fase_cierre ? `Pasó a fase: ${d.fase_cierre}` : "Regresó a Cerrada";
      }
      return "—";
    }
    default:
      return JSON.stringify(d);
  }
}

export function Auditoria() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  // ---------- Graficos resumen (2026-09-02, en pruebas) ----------
  // Usan el MISMO Desde/Hasta que ya filtra la tabla de abajo -- si el
  // usuario no filtro nada, el backend cae solo a su rango por defecto (14
  // dias, ver rangoFechas en auditoria.js). A proposito NO dependen de
  // entidad/accion -- filtrar el grafico de "por accion" por una sola accion
  // le quitaria el sentido (es justo el desglose POR accion).
  const [resumenDiario, setResumenDiario] = useState<ResumenDiarioAuditoria[]>([]);
  const [resumenAccion, setResumenAccion] = useState<ResumenAccionAuditoria[]>([]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    api.get<ResumenDiarioAuditoria[]>(`/api/auditoria/resumen-diario?${params.toString()}`).then(setResumenDiario);
    api.get<ResumenAccionAuditoria[]>(`/api/auditoria/resumen-accion?${params.toString()}`).then(setResumenAccion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (entidad) params.set("entidad", entidad);
    if (accion) params.set("accion", accion);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    return params;
  }

  const {
    pageItems,
    total,
    totalPaginas,
    paginaActual,
    desde: desdePagina,
    hasta: hastaPagina,
    irAPagina,
  } = usePaginacion(registros, TAMANO_PAGINA);

  // No reinicia a la pagina 1 en la primera carga -- solo cuando el usuario
  // de verdad cambia un filtro.
  const primeraCargaRef = useRef(true);
  useEffect(() => {
    setCargando(true);
    api
      .get<RegistroAuditoria[]>(`/api/auditoria?${construirParamsFiltro().toString()}`)
      .then(setRegistros)
      .finally(() => setCargando(false));
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad, accion, desde, hasta]);

  function limpiarFiltros() {
    setEntidad("");
    setAccion("");
    setDesde("");
    setHasta("");
  }

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/auditoria/exportar?${construirParamsFiltro().toString()}`, "auditoria.xlsx");
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  const datosDiario = resumenDiario.map((r) => ({ ...r, fechaLabel: fechaCorta(r.fecha) }));
  const datosAccion = resumenAccion
    .filter((r) => r.total > 0)
    .map((r) => ({ name: ACCION_LABEL[r.accion], value: r.total, color: COLOR_ACCION[r.accion] }));

  return (
    <section className="view">
      <div className="dashboard-graficas">
        <div className="panel">
          <h2>Actividad diaria ({rangoLabel(desde, hasta, "últimos 14 días")})</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={datosDiario}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e8" vertical={false} />
              <XAxis dataKey="fechaLabel" tick={{ fontSize: 11 }} interval={1} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
              <Tooltip formatter={(value) => [`${value} eventos`, undefined]} />
              <Line type="monotone" dataKey="total" name="Eventos" stroke="#14919b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>Por tipo de acción ({rangoLabel(desde, hasta, "últimos 14 días")})</h2>
          {datosAccion.length === 0 ? (
            <div className="empty-state">Sin actividad en los últimos 14 días.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={datosAccion} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {datosAccion.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} eventos`, undefined]} />
                <Legend verticalAlign="bottom" height={32} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Registro de auditoría</h2>
        <div className="filtros-mov">
          <div>
            <label>Entidad</label>
            <select value={entidad} onChange={(e) => setEntidad(e.target.value)}>
              <option value="">Todas</option>
              <option value="materiales">Materiales</option>
              <option value="movimientos">Movimientos</option>
              <option value="usuarios">Usuarios</option>
              <option value="categorias">Categorías</option>
              <option value="proveedores">Proveedores</option>
              <option value="almacenes">Almacenes</option>
              <option value="solicitudes_salida">Solicitudes de salida</option>
              <option value="solicitud_salida_devoluciones">Devoluciones de material</option>
              <option value="herramientas">Herramientas</option>
              <option value="prestamos_herramienta">Préstamos de herramienta</option>
            </select>
          </div>
          <div>
            <label>Acción</label>
            <select value={accion} onChange={(e) => setAccion(e.target.value)}>
              <option value="">Todas</option>
              <option value="crear">Creación</option>
              <option value="actualizar">Actualización</option>
              <option value="eliminar">Eliminación</option>
            </select>
          </div>
          <div>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
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
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No hay registros de auditoría con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.creado_en).toLocaleString("es-CO")}</td>
                    <td>{r.usuario_nombre || "—"}</td>
                    <td>
                      <span className={`badge ${r.accion === "eliminar" ? "sin_existencias" : r.accion === "actualizar" ? "bajo_minimo" : "ok"}`}>
                        {ACCION_LABEL[r.accion]}
                      </span>
                    </td>
                    <td>{ENTIDAD_LABEL[r.entidad] || r.entidad}</td>
                    <td>{resumenDetalle(r)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Paginacion
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
          desde={desdePagina}
          hasta={hastaPagina}
          total={total}
          etiqueta="registros"
          onCambiarPagina={irAPagina}
        />
      </div>
    </section>
  );
}
