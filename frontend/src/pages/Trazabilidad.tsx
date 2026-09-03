import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { Lpu, TrazabilidadRf, ResumenEstadoTrazabilidad, ResumenFacturacion } from "../api/types";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Modal } from "../components/Modal";
import { ComboLpu } from "../components/ComboLpu";
import { GraficaFacturacionMensual } from "../components/GraficaFacturacionMensual";
import { useAuth } from "../context/AuthContext";
import { ESTADO_SOLICITUD_LABEL, ESTADO_DEVOLUCION_LABEL, FASE_CIERRE_LABEL, esAdmin, money, moneda } from "../lib/labels";
import { List, Download, Check, Circle } from "lucide-react";

// Opciones del filtro "Estado actual": junta las 3 fuentes que puede mostrar
// codigoEstado() -- "lista" queda afuera a proposito, nunca es el estado
// actual de nadie (en cuanto llega a Material OK, el que manda es el de
// devolucion o el de fase_cierre).
const OPCIONES_ESTADO: { value: string; label: string }[] = [
  ...Object.entries(ESTADO_SOLICITUD_LABEL)
    .filter(([codigo]) => codigo !== "lista")
    .map(([value, label]) => ({ value, label })),
  ...Object.entries(ESTADO_DEVOLUCION_LABEL).map(([value, label]) => ({ value, label })),
  ...Object.entries(FASE_CIERRE_LABEL).map(([value, label]) => ({ value, label })),
];

// Mismo mapa que OPCIONES_ESTADO pero como Record, para el label del
// grafico resumen (busqueda O(1) en vez de recorrer el arreglo).
const ESTADO_ACTUAL_LABEL: Record<string, string> = Object.fromEntries(
  OPCIONES_ESTADO.map((op) => [op.value, op.label])
);

// Mismo color que ya usa .badge.<codigo> en index.css para cada estado --
// para que el grafico resumen hable el mismo lenguaje visual que las
// etiquetas de la tabla, no colores nuevos inventados aparte.
const COLOR_ESTADO_ACTUAL: Record<string, string> = {
  pendiente: "#b45309",
  aprobada: "#2e8b3d",
  rechazada: "#c0392b",
  cancelada: "#64748b",
  sin_reportar: "#b45309",
  pendiente_correccion: "#c0392b",
  pendiente_aprobacion: "#93ab1f",
  pendiente_disposicion: "#c0392b",
  cerrada: "#0d6e76",
  calidad: "#93ab1f",
  finalizado: "#0d6e76",
  facturado: "#2e8b3d",
};

const TAMANO_PAGINA = 25;

// Estado actual (calculado en el backend) se traduce aca a la MISMA clase de
// badge que ya usan Salidas/Devoluciones -- no se duplica el mapa de labels,
// solo se decide que codigo de color le corresponde. fase_cierre manda sobre
// estado_devolucion cuando ya avanzo de Cerrada (Calidad/Finalizado/Facturado,
// 2026-09-01 en pruebas).
function codigoEstado(r: TrazabilidadRf): string {
  if (r.estado_salida === "lista") return r.fase_cierre ?? r.estado_devolucion ?? "cerrada";
  return r.estado_salida;
}

const PASOS: { key: keyof TrazabilidadRf; por: keyof TrazabilidadRf; label: string }[] = [
  { key: "creada_en", por: "creada_por", label: "Creada" },
  { key: "aprobada_en", por: "aprobada_por", label: "Aprobada" },
  { key: "lista_en", por: "lista_por", label: "Material OK" },
  { key: "reportado_en", por: "reportado_por", label: "Reportó uso" },
  { key: "cerrada_en", por: "cerrada_por", label: "Cerrada" },
  { key: "calidad_en", por: "calidad_por", label: "Calidad" },
  { key: "finalizado_en", por: "finalizado_por", label: "Finalizado" },
  { key: "facturado_en", por: "facturado_por", label: "Facturado" },
];

function fechaHito(fecha: string | null, por: string | null): string {
  if (!fecha) return "Todavía no";
  return `${new Date(fecha).toLocaleString("es-CO")}${por ? ` — ${por}` : ""}`;
}

// Texto del rango activo para el titulo de los graficos resumen -- si el
// usuario no filtro Desde/Hasta, muestra el rango por defecto que ya aplica
// el backend (ver rangoFechas/rangoMeses en trazabilidad.js); si filtro,
// muestra el rango real en vez de dejar el texto fijo desactualizado.
function rangoLabel(desde: string, hasta: string, porDefecto: string): string {
  if (!desde && !hasta) return porDefecto;
  if (desde && hasta) return `${desde} a ${hasta}`;
  return desde ? `desde ${desde}` : `hasta ${hasta}`;
}

// Para que admin/coordinador no tengan que abrir RF por RF a revisar cual ya
// tiene los precios puestos (2026-09-01, en pruebas).
const FACTURACION_ESTADO_LABEL: Record<string, string> = {
  completo: "Completo",
  pendiente: "Pendiente",
};
const FACTURACION_ESTADO_BADGE: Record<string, string> = {
  completo: "ok",
  pendiente: "sin_existencias",
};

type LineaFacturacionEdit = { lpu_id: number | null; cantidad: string };

export function Trazabilidad() {
  const { usuario } = useAuth();
  const puedeFacturar = esAdmin(usuario);

  const [lista, setLista] = useState<TrazabilidadRf[]>([]);
  const [cargando, setCargando] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const resaltarId = searchParams.get("resaltar");
  const filaResaltadaRef = useRef<HTMLTableRowElement>(null);

  const [filtroOrden, setFiltroOrden] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroFacturacion, setFiltroFacturacion] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (filtroOrden) params.set("orden", filtroOrden);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroFacturacion) params.set("facturacion", filtroFacturacion);
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    return params;
  }

  function limpiarFiltros() {
    setFiltroOrden("");
    setFiltroEstado("");
    setFiltroFacturacion("");
    setFiltroDesde("");
    setFiltroHasta("");
  }

  function cargar() {
    setCargando(true);
    return api
      .get<TrazabilidadRf[]>(`/api/trazabilidad?${construirParamsFiltro().toString()}`)
      .then(setLista)
      .finally(() => setCargando(false));
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/trazabilidad/exportar?${construirParamsFiltro().toString()}`, "trazabilidad.xlsx");
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    lista,
    TAMANO_PAGINA
  );

  const primeraCargaRef = useRef(true);
  useEffect(() => {
    cargar();
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroOrden, filtroEstado, filtroFacturacion, filtroDesde, filtroHasta]);

  // ---------- Graficos resumen (2026-09-02, en pruebas) ----------
  // Usan el MISMO Desde/Hasta que ya filtra la tabla de abajo (no un rango
  // fijo aparte) -- si el usuario no filtro nada, el backend cae solo a su
  // rango por defecto (30 dias / 6 meses, ver rangoFechas/rangoMeses en
  // trazabilidad.js). A proposito NO dependen de filtroOrden/filtroEstado/
  // filtroFacturacion -- filtrar el grafico por un solo estado le quitaria
  // el sentido (es justo el desglose POR estado).
  const [resumenEstado, setResumenEstado] = useState<ResumenEstadoTrazabilidad[]>([]);
  const [resumenFacturacion, setResumenFacturacion] = useState<ResumenFacturacion>({ granularidad: "mes", datos: [] });
  useEffect(() => {
    const params = new URLSearchParams();
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    api.get<ResumenEstadoTrazabilidad[]>(`/api/trazabilidad/resumen-estado?${params.toString()}`).then(setResumenEstado);
    if (puedeFacturar) {
      api
        .get<ResumenFacturacion>(`/api/trazabilidad/resumen-facturacion-mensual?${params.toString()}`)
        .then(setResumenFacturacion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDesde, filtroHasta, puedeFacturar]);

  useEffect(() => {
    if (!resaltarId || cargando) return;
    const idx = lista.findIndex((r) => String(r.id) === resaltarId);
    if (idx === -1) return;
    irAPagina(Math.floor(idx / TAMANO_PAGINA) + 1);
    setTimeout(() => {
      filaResaltadaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("resaltar");
        return next;
      });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltarId, cargando, lista]);

  const [viendoDetalle, setViendoDetalle] = useState<TrazabilidadRf | null>(null);

  // ---------- Facturación (2026-09-01, en pruebas) ----------
  // Solo admin/coordinador -- el backend ni siquiera manda facturacion_items
  // para el resto de roles, esto es una segunda capa (UX), no la seguridad
  // real. Las lineas son sueltas (item de la LPU + cantidad), SIN relacion
  // con los materiales de la RF -- por eso van en su propio arreglo, no
  // "colgadas" de cada material.
  const [lpuLista, setLpuLista] = useState<Lpu[]>([]);
  const [lineasEdit, setLineasEdit] = useState<LineaFacturacionEdit[]>([]);
  // Foto de como llegaron las lineas al abrir el modal (o al ultimo guardado
  // exitoso) -- para saber si hay cambios sin guardar y pedir confirmacion al
  // cerrar, mismo patron que formInicialRef en Usuarios.tsx/Herramientas.tsx.
  const lineasInicialRef = useRef<LineaFacturacionEdit[]>([]);
  const [guardandoPrecios, setGuardandoPrecios] = useState(false);
  const [mensajePrecios, setMensajePrecios] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  useEffect(() => {
    if (puedeFacturar) api.get<Lpu[]>("/api/lpu").then(setLpuLista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeFacturar]);

  function abrirDetalle(r: TrazabilidadRf) {
    setViendoDetalle(r);
    setMensajePrecios(null);
    if (puedeFacturar) {
      const lineas = (r.facturacion_items || []).map((l) => ({ lpu_id: l.lpu_id, cantidad: l.cantidad }));
      setLineasEdit(lineas);
      lineasInicialRef.current = lineas;
    }
  }

  function agregarLinea() {
    setLineasEdit((prev) => [...prev, { lpu_id: null, cantidad: "" }]);
  }
  function actualizarLinea(idx: number, cambios: Partial<LineaFacturacionEdit>) {
    setLineasEdit((prev) => prev.map((l, i) => (i === idx ? { ...l, ...cambios } : l)));
  }
  function quitarLinea(idx: number) {
    setLineasEdit((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalEdit = lineasEdit.reduce((acc, l) => {
    const lpu = lpuLista.find((x) => x.id === l.lpu_id);
    const cantidad = Number(l.cantidad);
    return acc + (lpu && cantidad > 0 ? cantidad * Number(lpu.precio_unitario) : 0);
  }, 0);

  async function guardarPrecios() {
    if (!viendoDetalle) return;
    setGuardandoPrecios(true);
    setMensajePrecios(null);
    try {
      const actualizado = await api.put<TrazabilidadRf>(`/api/trazabilidad/${viendoDetalle.id}/facturacion`, {
        lineas: lineasEdit
          .filter((l) => l.lpu_id && Number(l.cantidad) > 0)
          .map((l) => ({ lpu_id: l.lpu_id, cantidad: Number(l.cantidad) })),
      });
      setViendoDetalle(actualizado);
      setLista((prev) => prev.map((r) => (r.id === actualizado.id ? actualizado : r)));
      const lineas = (actualizado.facturacion_items || []).map((l) => ({ lpu_id: l.lpu_id, cantidad: l.cantidad }));
      setLineasEdit(lineas);
      lineasInicialRef.current = lineas;
      setMensajePrecios({ texto: "Facturación guardada", tipo: "ok" });
    } catch (err) {
      setMensajePrecios({
        texto: err instanceof ApiClientError ? err.message : "Error al guardar la facturación",
        tipo: "error",
      });
    } finally {
      setGuardandoPrecios(false);
    }
  }

  const datosEstadoTraz = resumenEstado
    .filter((r) => r.total > 0)
    .map((r) => ({
      estado: r.estado,
      nombre: ESTADO_ACTUAL_LABEL[r.estado] || r.estado,
      total: r.total,
      color: COLOR_ESTADO_ACTUAL[r.estado] || "#94a3b8",
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <section className="view">
      <div className="dashboard-graficas">
        <div className="panel">
          <h2>RF por estado actual ({rangoLabel(filtroDesde, filtroHasta, "últimos 30 días")})</h2>
          {datosEstadoTraz.length === 0 ? (
            <div className="empty-state">Sin RF en los últimos 30 días.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, datosEstadoTraz.length * 34)}>
              <BarChart data={datosEstadoTraz} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e8" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${value} RF`, undefined]} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {datosEstadoTraz.map((d) => (
                    <Cell key={d.estado} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {puedeFacturar && (
          <div className="panel">
            <h2>
              Facturación {resumenFacturacion.granularidad === "dia" ? "diaria" : "mensual"} (
              {rangoLabel(filtroDesde, filtroHasta, "últimos 6 meses")})
            </h2>
            <GraficaFacturacionMensual resumen={resumenFacturacion} />
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Trazabilidad de RF</h2>
        <div className="filtros-mov">
          <div>
            <label>N° Orden / RF</label>
            <input
              type="text"
              placeholder="OS-001 o RF..."
              value={filtroOrden}
              onChange={(e) => setFiltroOrden(e.target.value)}
            />
          </div>
          <div>
            <label>Estado actual</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              {OPCIONES_ESTADO.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>
          {puedeFacturar && (
            <div>
              <label>Facturación</label>
              <select value={filtroFacturacion} onChange={(e) => setFiltroFacturacion(e.target.value)}>
                <option value="">Todas</option>
                <option value="completo">Completo</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
          )}
          <div>
            <label>Desde</label>
            <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
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
                <th>Materiales</th>
                <th>Solicitado por</th>
                <th>Destinatario</th>
                <th>Estado actual</th>
                <th>Progreso</th>
                {puedeFacturar && <th>Facturación</th>}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={puedeFacturar ? 9 : 8} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={puedeFacturar ? 9 : 8} className="empty-state">
                    No hay solicitudes que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((r) => (
                  <tr
                    key={r.id}
                    ref={String(r.id) === resaltarId ? filaResaltadaRef : undefined}
                    className={String(r.id) === resaltarId ? "fila-resaltada" : undefined}
                  >
                    <td>{new Date(r.creado_en).toLocaleString("es-CO")}</td>
                    <td>{r.numero_orden || "—"}</td>
                    <td>{r.rf_relacionada}</td>
                    <td>
                      <button type="button" className="btn-reenviar" onClick={() => abrirDetalle(r)}>
                        <List size={14} /> {r.items.length} {r.items.length === 1 ? "material" : "materiales"}
                      </button>
                    </td>
                    <td>{r.solicitado_por_nombre || "—"}</td>
                    <td>{r.destinatario_nombre || "N/A"}</td>
                    <td>
                      <span className={`badge ${codigoEstado(r)}`}>{r.estado_actual}</span>
                    </td>
                    <td>
                      <div className="progreso-rf">
                        {PASOS.map((paso) => {
                          const hecho = Boolean(r[paso.key]);
                          return (
                            <span
                              key={paso.key}
                              className={`progreso-paso ${hecho ? "hecho" : ""}`}
                              title={`${paso.label}: ${hecho ? "listo" : "todavía no"}`}
                            >
                              {hecho ? <Check size={11} /> : <Circle size={11} />}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    {puedeFacturar && (
                      <td>
                        {r.facturacion_estado && (
                          <span className={`badge ${FACTURACION_ESTADO_BADGE[r.facturacion_estado]}`}>
                            {FACTURACION_ESTADO_LABEL[r.facturacion_estado]}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Paginacion
          total={total}
          totalPaginas={totalPaginas}
          paginaActual={paginaActual}
          desde={desde}
          hasta={hasta}
          etiqueta="RF"
          onCambiarPagina={irAPagina}
        />
      </div>

      {viendoDetalle && (
        <Modal
          titulo={`Trazabilidad — ${viendoDetalle.numero_orden ?? "#" + viendoDetalle.id}`}
          onClose={() => setViendoDetalle(null)}
          confirmarCierre={puedeFacturar && JSON.stringify(lineasEdit) !== JSON.stringify(lineasInicialRef.current)}
        >
          <div className="detalle-datos">
            <div>
              <strong>RF:</strong> {viendoDetalle.rf_relacionada}
            </div>
            <div>
              <strong>Solicitado por:</strong> {viendoDetalle.solicitado_por_nombre || "—"}
            </div>
            <div>
              <strong>Destinatario:</strong> {viendoDetalle.destinatario_nombre || "N/A"}
            </div>
          </div>

          <h3 className="detalle-subtitulo">Materiales ({viendoDetalle.items.length})</h3>
          <div className="detalle-items">
            {viendoDetalle.items.map((it) => (
              <div key={it.item_id} className="detalle-item-fila">
                <span>{it.producto}</span>
                <span>
                  {money(it.cantidad)} {it.unidad}
                </span>
              </div>
            ))}
          </div>

          {puedeFacturar && (
            <>
              <h3 className="detalle-subtitulo">Facturación</h3>
              <div className="detalle-items detalle-items--facturacion">
                {lineasEdit.length === 0 && <div className="empty-state">Sin ítems agregados todavía.</div>}
                {lineasEdit.map((linea, idx) => {
                  const lpu = lpuLista.find((l) => l.id === linea.lpu_id);
                  const cantidad = Number(linea.cantidad);
                  const subtotal = lpu && cantidad > 0 ? cantidad * Number(lpu.precio_unitario) : null;
                  return (
                    <div key={idx} className="detalle-item-fila detalle-item-fila--facturacion">
                      <ComboLpu
                        items={lpuLista}
                        lpuId={linea.lpu_id}
                        onSeleccionar={(id) => actualizarLinea(idx, { lpu_id: id })}
                      />
                      {lpu && (
                        <div className="detalle-item-fila__lpu-elegido">
                          {lpu.nombre}
                          {lpu.nombre_alternativo && lpu.nombre_alternativo !== lpu.nombre ? ` (${lpu.nombre_alternativo})` : ""}
                          {lpu.unidad_medida ? ` — ${lpu.unidad_medida}` : ""}
                        </div>
                      )}
                      <div className="detalle-item-fila__pie">
                        <div className="detalle-item-fila__campo">
                          <label>Cantidad</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={linea.cantidad}
                            onChange={(e) => actualizarLinea(idx, { cantidad: e.target.value })}
                          />
                        </div>
                        <div className="detalle-item-fila__campo detalle-item-fila__campo--subtotal">
                          <label>Subtotal</label>
                          <strong>{subtotal !== null ? moneda(subtotal) : "—"}</strong>
                        </div>
                        <button
                          type="button"
                          className="btn-quitar-item"
                          onClick={() => quitarLinea(idx)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn-agregar-item" onClick={agregarLinea}>
                + Agregar ítem
              </button>
              <div className="detalle-total">
                <strong>Total</strong>
                <span>{moneda(totalEdit)}</span>
              </div>
              {mensajePrecios && <div className={`mensaje-form ${mensajePrecios.tipo}`}>{mensajePrecios.texto}</div>}
              <button type="button" className="btn-nuevo" disabled={guardandoPrecios} onClick={guardarPrecios}>
                {guardandoPrecios ? "Guardando..." : "Guardar facturación"}
              </button>
            </>
          )}

          <h3 className="detalle-subtitulo">Recorrido</h3>
          <div className="recorrido-timeline">
            {PASOS.map((paso) => {
              const fecha = viendoDetalle[paso.key] as string | null;
              const por = viendoDetalle[paso.por] as string | null;
              const hecho = Boolean(fecha);
              return (
                <div key={paso.key} className={`recorrido-paso ${hecho ? "hecho" : "pendiente"}`}>
                  <span className="recorrido-paso__icono">{hecho ? <Check size={12} /> : <Circle size={10} />}</span>
                  <div className="recorrido-paso__texto">
                    <strong>{paso.label}</strong>
                    <div className="recorrido-paso__fecha">{fechaHito(fecha, por)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </section>
  );
}
