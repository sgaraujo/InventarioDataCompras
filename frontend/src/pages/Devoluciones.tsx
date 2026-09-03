import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { DevolucionResumen, DevolucionDetalle, DevolucionItem, DisposicionDevolucion, EstadoDevolucion, FaseCierre } from "../api/types";
import { money, ESTADO_DEVOLUCION_LABEL, EVENTO_DEVOLUCION_LABEL, FASE_CIERRE_LABEL, esAdmin } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Send, Check, Eye, Download } from "lucide-react";

const TAMANO_PAGINA = 25;

type Modo = "reportar" | "revisar-reporte" | "finalizar" | "ver";
type DecisionRevision = "aprobar" | "rechazar";

// Fase posterior a "Cerrada" (2026-09-01, en pruebas): cada accion es un
// simple POST con confirmacion, no hace falta el modal grande de detalle.
type AccionFase = "pasar-calidad" | "regresar-cerrada" | "pasar-finalizado" | "facturar";
const CONFIG_ACCION_FASE: Record<AccionFase, { titulo: string; descripcion: string; textoConfirmar: string }> = {
  "pasar-calidad": {
    titulo: "¿Enviar esta solicitud a Calidad?",
    descripcion: "Pasa de Cerrada a Calidad. Se puede devolver a Cerrada si hace falta.",
    textoConfirmar: "Enviar a Calidad",
  },
  "regresar-cerrada": {
    titulo: "¿Devolver esta solicitud a Cerrada?",
    descripcion: "Sale de Calidad y vuelve a Cerrada.",
    textoConfirmar: "Devolver a Cerrada",
  },
  "pasar-finalizado": {
    titulo: "¿Marcar esta solicitud como Finalizada?",
    descripcion: "Pasa de Calidad a Finalizado, listo para que coordinador facture.",
    textoConfirmar: "Finalizar",
  },
  facturar: {
    titulo: "¿Facturar esta solicitud?",
    descripcion: "Pasa a Facturado — con esto termina el ciclo completo de la RF.",
    textoConfirmar: "Facturar",
  },
};

export function Devoluciones() {
  const { usuario } = useAuth();

  const [lista, setLista] = useState<DevolucionResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const resaltarId = searchParams.get("resaltar");
  const filaResaltadaRef = useRef<HTMLTableRowElement>(null);

  const [filtroOrden, setFiltroOrden] = useState("");
  const [filtroSolicitadoPor, setFiltroSolicitadoPor] = useState("");
  // El almacenista arranca viendo su cola real (pendiente de su decision),
  // pero puede cambiar el filtro para revisar lo que ya resolvio. El
  // supervisor NO arranca filtrado -- a diferencia del almacenista, el
  // supervisor puede tener doble rol en esta pantalla (aprobar reportes de
  // otros, y tambien reportar el suyo propio si el creo la solicitud), asi
  // que un filtro por defecto le escondia sus propias solicitudes "sin
  // reportar" detras de "Pendiente aprobacion".
  const [filtroEstado, setFiltroEstado] = useState<EstadoDevolucion | FaseCierre | "">(
    usuario?.rol === "almacenista" ? "pendiente_disposicion" : ""
  );
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (filtroOrden) params.set("orden", filtroOrden);
    if (filtroSolicitadoPor) params.set("solicitado_por", filtroSolicitadoPor);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    return params;
  }

  function limpiarFiltros() {
    setFiltroOrden("");
    setFiltroSolicitadoPor("");
    setFiltroEstado("");
    setFiltroDesde("");
    setFiltroHasta("");
  }

  function cargar() {
    setCargando(true);
    return api
      .get<DevolucionResumen[]>(`/api/devoluciones?${construirParamsFiltro().toString()}`)
      .then(setLista)
      .finally(() => setCargando(false));
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/devoluciones/exportar?${construirParamsFiltro().toString()}`, "devoluciones.xlsx");
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

  // No reinicia a la pagina 1 en la primera carga -- solo cuando el usuario
  // de verdad cambia un filtro.
  const primeraCargaRef = useRef(true);
  useEffect(() => {
    cargar();
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroOrden, filtroSolicitadoPor, filtroEstado, filtroDesde, filtroHasta]);

  // Si se llego aca desde una notificacion (?resaltar=id), primero se ubica en
  // que pagina cae esa devolucion (puede no ser la 1) y salta ahi; una vez la
  // fila ya esta en pageItems, hace scroll hasta ella y la deja marcada un
  // momento para ubicarla facil en la tabla.
  useEffect(() => {
    if (!resaltarId || !lista.length) return;
    const indice = lista.findIndex((s) => String(s.id) === resaltarId);
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
  }, [resaltarId, lista, paginaActual]);

  function puedeReportar(s: DevolucionResumen): boolean {
    return (
      esAdmin(usuario) ||
      ((usuario?.rol === "tecnico-ejecutor" || usuario?.rol === "supervisor") && s.solicitado_por === usuario.id)
    );
  }
  const puedeFinalizarRol = esAdmin(usuario) || usuario?.rol === "almacenista";
  const puedeRevisarReporte = esAdmin(usuario) || usuario?.rol === "supervisor";
  // Supervisor/admin/coordinador mueven Cerrada<->Calidad->Finalizado;
  // facturar es de admin y coordinador (supervisor no llega hasta ahi).
  const puedeMoverFaseCierre = esAdmin(usuario) || usuario?.rol === "supervisor";
  const puedeFacturar = esAdmin(usuario);

  const [modal, setModal] = useState<{ solicitudId: number; modo: Modo } | null>(null);
  const [detalle, setDetalle] = useState<DevolucionDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [usados, setUsados] = useState<Record<number, string>>({});
  const [decisiones, setDecisiones] = useState<Record<number, DisposicionDevolucion | "">>({});
  const [revisiones, setRevisiones] = useState<Record<number, DecisionRevision>>({});
  const [motivosRechazo, setMotivosRechazo] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  function abrirModal(solicitudId: number, modo: Modo) {
    setModal({ solicitudId, modo });
    setDetalle(null);
    setUsados({});
    setDecisiones({});
    setRevisiones({});
    setMotivosRechazo({});
    setMensaje(null);
    setCargandoDetalle(true);
    api
      .get<DevolucionDetalle>(`/api/devoluciones/${solicitudId}`)
      .then(setDetalle)
      .finally(() => setCargandoDetalle(false));
  }

  function cerrarModal() {
    setModal(null);
    setDetalle(null);
  }

  const [confirmandoFase, setConfirmandoFase] = useState<{ id: number; accion: AccionFase } | null>(null);
  const [procesandoFase, setProcesandoFase] = useState<number | null>(null);
  const [errorFase, setErrorFase] = useState<{ id: number; texto: string } | null>(null);

  async function ejecutarFase() {
    if (!confirmandoFase) return;
    const { id, accion } = confirmandoFase;
    setConfirmandoFase(null);
    setProcesandoFase(id);
    setErrorFase(null);
    try {
      await api.post(`/api/devoluciones/${id}/${accion}`);
      await cargar();
    } catch (err) {
      setErrorFase({ id, texto: err instanceof ApiClientError ? err.message : "Error al actualizar la solicitud" });
    } finally {
      setProcesandoFase(null);
    }
  }

  function marcarCompleto(item: DevolucionItem) {
    setUsados((prev) => ({ ...prev, [item.item_id]: item.cantidad_solicitada }));
  }

  const itemsPendientes = detalle?.items.filter((it) => it.estado === "pendiente_disposicion") ?? [];

  // Editable en el modal de reportar: o nunca se reporto (primer envio, todos
  // los items caen aca), o el supervisor lo marco puntualmente como mal (solo
  // corrige eso -- los demas quedan de solo lectura, ya sea porque siguen en
  // revision o porque ya fueron aprobados).
  function esEditableEnReporte(it: DevolucionItem): boolean {
    return it.devolucion_id === null || it.estado === "rechazado";
  }
  const itemsEditablesReporte = detalle?.items.filter(esEditableEnReporte) ?? [];

  const puedeEnviarReporte =
    itemsEditablesReporte.length > 0 &&
    itemsEditablesReporte.every((it) => {
      const v = usados[it.item_id];
      if (v === undefined || v === "") return false;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= Number(it.cantidad_solicitada);
    });

  const puedeFinalizar = !!detalle && itemsPendientes.length > 0 && itemsPendientes.every((it) => decisiones[it.item_id]);

  async function enviarReporte() {
    if (!detalle || !modal) return;
    setEnviando(true);
    setMensaje(null);
    try {
      await api.post(`/api/devoluciones/${modal.solicitudId}/reportar`, {
        items: itemsEditablesReporte.map((it) => ({ item_id: it.item_id, cantidad_usada: usados[it.item_id] })),
      });
      cerrarModal();
      await cargar();
    } catch (err) {
      setMensaje({ texto: err instanceof ApiClientError ? err.message : "Error al enviar el reporte", tipo: "error" });
    } finally {
      setEnviando(false);
    }
  }

  async function finalizar() {
    if (!detalle || !modal) return;
    setEnviando(true);
    setMensaje(null);
    try {
      await api.post(`/api/devoluciones/${modal.solicitudId}/finalizar`, {
        items: itemsPendientes.map((it) => ({ item_id: it.item_id, disposicion: decisiones[it.item_id] })),
      });
      cerrarModal();
      await cargar();
    } catch (err) {
      setMensaje({ texto: err instanceof ApiClientError ? err.message : "Error al finalizar la revisión", tipo: "error" });
    } finally {
      setEnviando(false);
    }
  }

  // Por defecto cada material queda "aprobar" -- el supervisor solo tiene que
  // tocar los que esten mal.
  function decisionDe(itemId: number): DecisionRevision {
    return revisiones[itemId] ?? "aprobar";
  }

  const puedeRevisar =
    !!detalle &&
    detalle.items.every((it) => decisionDe(it.item_id) === "aprobar" || !!motivosRechazo[it.item_id]?.trim());

  async function revisarReporte() {
    if (!detalle || !modal) return;
    setEnviando(true);
    setMensaje(null);
    try {
      await api.post(`/api/devoluciones/${modal.solicitudId}/revisar-reporte`, {
        items: detalle.items.map((it) => {
          const decision = decisionDe(it.item_id);
          return {
            item_id: it.item_id,
            decision,
            motivo: decision === "rechazar" ? motivosRechazo[it.item_id]?.trim() : undefined,
          };
        }),
      });
      cerrarModal();
      await cargar();
    } catch (err) {
      setMensaje({ texto: err instanceof ApiClientError ? err.message : "Error al revisar el reporte", tipo: "error" });
    } finally {
      setEnviando(false);
    }
  }

  const tituloModal =
    modal?.modo === "reportar"
      ? `Reportar uso de material — ${detalle?.solicitud.numero_orden ?? "#" + modal.solicitudId}`
      : modal?.modo === "revisar-reporte"
        ? `Revisar reporte de uso — ${detalle?.solicitud.numero_orden ?? "#" + modal.solicitudId}`
        : modal?.modo === "finalizar"
          ? `Revisar devolución — ${detalle?.solicitud.numero_orden ?? "#" + modal.solicitudId}`
          : `Detalle de devolución — ${detalle?.solicitud.numero_orden ?? "#" + modal?.solicitudId}`;

  return (
    <section className="view">
      <div className="panel">
        <h2>Devoluciones</h2>
        <div className="filtros-mov">
          <div>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoDevolucion | FaseCierre | "")}>
              <option value="">Todos</option>
              {usuario?.rol !== "almacenista" && <option value="sin_reportar">Pendiente de reportar</option>}
              {usuario?.rol !== "almacenista" && (
                <option value="pendiente_correccion">Pendiente corrección del solicitante</option>
              )}
              {usuario?.rol !== "almacenista" && (
                <option value="pendiente_aprobacion">Pendiente aprobación supervisor</option>
              )}
              <option value="pendiente_disposicion">Pendiente disposición</option>
              <option value="cerrada">Cerrada</option>
              {usuario?.rol !== "almacenista" && <option value="calidad">Calidad</option>}
              {usuario?.rol !== "almacenista" && <option value="finalizado">Finalizado</option>}
              {usuario?.rol !== "almacenista" && <option value="facturado">Facturado</option>}
            </select>
          </div>
          <div>
            <label>N° Orden</label>
            <input
              type="text"
              placeholder="OS-001..."
              value={filtroOrden}
              onChange={(e) => setFiltroOrden(e.target.value)}
            />
          </div>
          {usuario?.rol !== "tecnico-ejecutor" && (
            <div>
              <label>Solicitado por</label>
              <input
                type="text"
                placeholder="Buscar solicitante..."
                value={filtroSolicitadoPor}
                onChange={(e) => setFiltroSolicitadoPor(e.target.value)}
              />
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
                <th>Solicitado por</th>
                <th>Entregado a</th>
                <th>Materiales</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No hay solicitudes para mostrar.
                  </td>
                </tr>
              ) : (
                pageItems.map((s) => {
                  const mostrarReportar =
                    puedeReportar(s) && (s.estado_devolucion === "sin_reportar" || s.estado_devolucion === "pendiente_correccion");
                  const esCorreccion = s.estado_devolucion === "pendiente_correccion";
                  const mostrarRevisarReporte = puedeRevisarReporte && s.estado_devolucion === "pendiente_aprobacion";
                  const mostrarFinalizar = puedeFinalizarRol && s.estado_devolucion === "pendiente_disposicion";
                  const mostrarPasarCalidad =
                    puedeMoverFaseCierre && s.estado_devolucion === "cerrada" && !s.fase_cierre;
                  const mostrarRegresarCerrada = puedeMoverFaseCierre && s.fase_cierre === "calidad";
                  const mostrarPasarFinalizado = puedeMoverFaseCierre && s.fase_cierre === "calidad";
                  const mostrarFacturar = puedeFacturar && s.fase_cierre === "finalizado";
                  const sinAcciones =
                    !mostrarReportar &&
                    !mostrarRevisarReporte &&
                    !mostrarFinalizar &&
                    !mostrarPasarCalidad &&
                    !mostrarRegresarCerrada &&
                    !mostrarPasarFinalizado &&
                    !mostrarFacturar;
                  return (
                    <tr
                      key={s.id}
                      ref={String(s.id) === resaltarId ? filaResaltadaRef : undefined}
                      className={String(s.id) === resaltarId ? "fila-resaltada" : undefined}
                    >
                      <td>{new Date(s.creado_en).toLocaleString("es-CO")}</td>
                      <td>{s.numero_orden || "—"}</td>
                      <td>{s.rf_relacionada}</td>
                      <td>{s.solicitado_por_nombre || "—"}</td>
                      <td>{s.destinatario_nombre || "N/A"}</td>
                      <td>
                        {s.items_cerrados}/{s.total_items} resueltos
                      </td>
                      <td>
                        {s.fase_cierre ? (
                          <span className={`badge ${s.fase_cierre}`}>{FASE_CIERRE_LABEL[s.fase_cierre]}</span>
                        ) : (
                          <span className={`badge ${s.estado_devolucion}`}>{ESTADO_DEVOLUCION_LABEL[s.estado_devolucion]}</span>
                        )}
                      </td>
                      <td>
                        <div className="acciones-solicitud">
                          {mostrarReportar && (
                            <button type="button" className="btn-editar" onClick={() => abrirModal(s.id, "reportar")}>
                              {esCorreccion ? "Corregir material rechazado" : "Reportar uso"}
                            </button>
                          )}
                          {mostrarRevisarReporte && (
                            <button type="button" className="btn-editar" onClick={() => abrirModal(s.id, "revisar-reporte")}>
                              Revisar reporte
                            </button>
                          )}
                          {mostrarFinalizar && (
                            <button type="button" className="btn-editar" onClick={() => abrirModal(s.id, "finalizar")}>
                              Revisar
                            </button>
                          )}
                          {mostrarPasarCalidad && (
                            <button
                              type="button"
                              className="btn-aprobar"
                              disabled={procesandoFase === s.id}
                              onClick={() => setConfirmandoFase({ id: s.id, accion: "pasar-calidad" })}
                            >
                              Enviar a Calidad
                            </button>
                          )}
                          {mostrarRegresarCerrada && (
                            <button
                              type="button"
                              className="btn-rechazar"
                              disabled={procesandoFase === s.id}
                              onClick={() => setConfirmandoFase({ id: s.id, accion: "regresar-cerrada" })}
                            >
                              Devolver a Cerrada
                            </button>
                          )}
                          {mostrarPasarFinalizado && (
                            <button
                              type="button"
                              className="btn-aprobar"
                              disabled={procesandoFase === s.id}
                              onClick={() => setConfirmandoFase({ id: s.id, accion: "pasar-finalizado" })}
                            >
                              Finalizar
                            </button>
                          )}
                          {mostrarFacturar && (
                            <button
                              type="button"
                              className="btn-aprobar"
                              disabled={procesandoFase === s.id}
                              onClick={() => setConfirmandoFase({ id: s.id, accion: "facturar" })}
                            >
                              Facturar
                            </button>
                          )}
                          {sinAcciones && (
                            <button type="button" className="btn-reenviar" onClick={() => abrirModal(s.id, "ver")}>
                              <Eye size={14} /> Ver detalle
                            </button>
                          )}
                        </div>
                        {errorFase?.id === s.id && <div className="mensaje-form error">{errorFase.texto}</div>}
                      </td>
                    </tr>
                  );
                })
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
          etiqueta="devoluciones"
          onCambiarPagina={irAPagina}
        />
      </div>

      {modal && (
        <Modal
          titulo={tituloModal}
          onClose={cerrarModal}
          confirmarCierre={
            modal.modo !== "ver" &&
            (Object.values(usados).some((v) => v !== "") ||
              Object.values(decisiones).some(Boolean) ||
              Object.values(revisiones).some(Boolean) ||
              Object.values(motivosRechazo).some((v) => v.trim() !== ""))
          }
        >
          {cargandoDetalle || !detalle ? (
            <div className="empty-state">Cargando...</div>
          ) : (
            <>
              <div className="detalle-datos">
                <div>
                  <strong>RF:</strong> {detalle.solicitud.rf_relacionada}
                </div>
                <div>
                  <strong>Solicitado por:</strong> {detalle.solicitud.solicitado_por_nombre || "—"}
                </div>
                <div>
                  <strong>Entregado a:</strong> {detalle.solicitud.destinatario_nombre || "N/A"}
                </div>
                {detalle.solicitud.fase_cierre && (
                  <div>
                    <strong>Fase:</strong> {FASE_CIERRE_LABEL[detalle.solicitud.fase_cierre]}
                  </div>
                )}
              </div>

              <div className="detalle-items">
                {detalle.items.map((it) => (
                  <div key={it.item_id} className="devolucion-item-fila">
                    <div className="devolucion-item-fila__nombre">
                      {it.producto}{" "}
                      <span className="devolucion-item-fila__solicitado">
                        — solicitado: {money(it.cantidad_solicitada)} {it.unidad}
                      </span>
                    </div>

                    {modal.modo === "reportar" &&
                      (esEditableEnReporte(it) ? (
                        <>
                          {it.estado === "rechazado" && (
                            <div className="devolucion-item-fila__pendiente">
                              Rechazado por {it.rechazado_por_nombre}: "{it.motivo_rechazo}"
                            </div>
                          )}
                          <div className="devolucion-item-fila__accion">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={it.cantidad_solicitada}
                              placeholder="Cantidad usada"
                              value={usados[it.item_id] ?? ""}
                              onChange={(e) => setUsados((prev) => ({ ...prev, [it.item_id]: e.target.value }))}
                            />
                            <button type="button" className="btn-reenviar" onClick={() => marcarCompleto(it)}>
                              Material completo
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="devolucion-item-fila__ok">
                          ✓ Usado: {money(it.cantidad_usada!)} {it.unidad} — ya revisado, sin edición
                        </span>
                      ))}

                    {modal.modo === "revisar-reporte" && (
                      <>
                        <div className="devolucion-item-fila__accion">
                          <div className="devolucion-item-fila__trazabilidad">
                            <div>
                              Usado: {money(it.cantidad_usada!)} {it.unidad}
                              {Number(it.cantidad_sobrante) > 0
                                ? ` — Sobrante: ${money(it.cantidad_sobrante!)} ${it.unidad}`
                                : " — sin sobrante"}
                            </div>
                            <div className="devolucion-item-fila__meta">
                              Reportado por {it.reportado_por_nombre} el{" "}
                              {new Date(it.reportado_en!).toLocaleString("es-CO")}
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`btn-disposicion${decisionDe(it.item_id) === "aprobar" ? " activo" : ""}`}
                            onClick={() => setRevisiones((prev) => ({ ...prev, [it.item_id]: "aprobar" }))}
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            className={`btn-disposicion btn-disposicion--desecho${decisionDe(it.item_id) === "rechazar" ? " activo" : ""}`}
                            onClick={() => setRevisiones((prev) => ({ ...prev, [it.item_id]: "rechazar" }))}
                          >
                            Rechazar
                          </button>
                        </div>
                        {decisionDe(it.item_id) === "rechazar" && (
                          <div className="devolucion-item-fila__motivo">
                            <input
                              type="text"
                              placeholder="Motivo del rechazo de este material..."
                              value={motivosRechazo[it.item_id] ?? ""}
                              onChange={(e) => setMotivosRechazo((prev) => ({ ...prev, [it.item_id]: e.target.value }))}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {modal.modo === "finalizar" &&
                      (it.estado === "pendiente_disposicion" ? (
                        <div className="devolucion-item-fila__accion">
                          <span className="devolucion-item-fila__sobrante">
                            Sobrante: {money(it.cantidad_sobrante!)} {it.unidad}
                          </span>
                          <button
                            type="button"
                            className={`btn-disposicion${decisiones[it.item_id] === "stock" ? " activo" : ""}`}
                            onClick={() => setDecisiones((prev) => ({ ...prev, [it.item_id]: "stock" }))}
                          >
                            Sumar a stock
                          </button>
                          <button
                            type="button"
                            className={`btn-disposicion btn-disposicion--desecho${decisiones[it.item_id] === "desecho" ? " activo" : ""}`}
                            onClick={() => setDecisiones((prev) => ({ ...prev, [it.item_id]: "desecho" }))}
                          >
                            Baja de material
                          </button>
                        </div>
                      ) : (
                        <span className="devolucion-item-fila__ok">✓ Sin sobrante (reportado por {it.reportado_por_nombre})</span>
                      ))}

                    {modal.modo === "ver" && (
                      <div className="devolucion-item-fila__trazabilidad">
                        {it.devolucion_id === null ? (
                          <span className="devolucion-item-fila__pendiente">Aún sin reportar</span>
                        ) : (
                          <>
                            <div>
                              Usado: {money(it.cantidad_usada!)} {it.unidad}
                              {Number(it.cantidad_sobrante) > 0
                                ? ` — Sobrante: ${money(it.cantidad_sobrante!)} ${it.unidad}`
                                : " — sin sobrante"}
                            </div>
                            {it.disposicion && (
                              <div className="devolucion-item-fila__meta">
                                {it.disposicion === "stock" ? "Sumado a stock" : "Baja de material"} — decidido por{" "}
                                {it.decidido_por_nombre} el {new Date(it.decidido_en!).toLocaleString("es-CO")}
                              </div>
                            )}
                            {it.estado === "rechazado" && (
                              <div className="devolucion-item-fila__pendiente">Pendiente de que el solicitante corrija este material</div>
                            )}
                            {it.estado === "pendiente_aprobacion_supervisor" && (
                              <div className="devolucion-item-fila__pendiente">Pendiente de aprobación del supervisor</div>
                            )}
                            {it.estado === "pendiente_disposicion" && (
                              <div className="devolucion-item-fila__pendiente">Pendiente de decisión del almacenista</div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {detalle.eventos.length > 0 && (
                <>
                  <h3 className="detalle-subtitulo">Historial</h3>
                  <div className="timeline-solicitud">
                    {detalle.eventos.map((ev) => (
                      <div key={ev.id} className={`timeline-item timeline-${ev.tipo}`}>
                        <strong>{EVENTO_DEVOLUCION_LABEL[ev.tipo]}</strong>
                        {ev.usuario_nombre ? ` — ${ev.usuario_nombre}` : ""}
                        {ev.nota ? `: "${ev.nota}"` : ""}
                        <div className="timeline-item__fecha">{new Date(ev.creado_en).toLocaleString("es-CO")}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {modal.modo === "reportar" && (
                <button type="button" className="btn-nuevo" disabled={!puedeEnviarReporte || enviando} onClick={enviarReporte}>
                  <Send size={14} /> {enviando ? "Enviando..." : "Enviar reporte"}
                </button>
              )}
              {modal.modo === "finalizar" && (
                <button type="button" className="btn-nuevo" disabled={!puedeFinalizar || enviando} onClick={finalizar}>
                  <Check size={14} /> {enviando ? "Finalizando..." : "Finalizar"}
                </button>
              )}
              {modal.modo === "revisar-reporte" && (
                <button type="button" className="btn-nuevo" disabled={!puedeRevisar || enviando} onClick={revisarReporte}>
                  <Check size={14} /> {enviando ? "Enviando..." : "Enviar revisión"}
                </button>
              )}
              {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
            </>
          )}
        </Modal>
      )}

      {confirmandoFase && (
        <ConfirmDialog
          titulo={CONFIG_ACCION_FASE[confirmandoFase.accion].titulo}
          descripcion={CONFIG_ACCION_FASE[confirmandoFase.accion].descripcion}
          textoConfirmar={CONFIG_ACCION_FASE[confirmandoFase.accion].textoConfirmar}
          onConfirmar={ejecutarFase}
          onCancelar={() => setConfirmandoFase(null)}
        />
      )}
    </section>
  );
}
