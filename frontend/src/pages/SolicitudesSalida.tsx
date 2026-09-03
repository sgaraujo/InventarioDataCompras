import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { api, ApiClientError, descargarArchivo } from "../api/client";
import type { Destinatario, Material, SolicitudSalida } from "../api/types";
import { money, ESTADO_SOLICITUD_LABEL, EVENTO_SOLICITUD_LABEL, esAdmin } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ComboMaterial } from "../components/ComboMaterial";
import { Check, X, RotateCcw, Eye, Camera, ImageIcon, Download, List, Ban, Paperclip, Plus } from "lucide-react";

const TAMANO_PAGINA = 25;

interface ItemForm {
  key: string;
  materialId: string;
  cantidad: string;
}

function itemVacio(): ItemForm {
  return { key: crypto.randomUUID(), materialId: "", cantidad: "" };
}

function stockDisponible(materialId: string, materiales: Material[]): number | null {
  const m = materiales.find((mat) => String(mat.id) === materialId);
  return m ? Number(m.stock_actual) : null;
}

// Formulario reutilizable de items (material + cantidad), con aviso de stock en vivo.
// Se usa tanto para crear una solicitud como para corregirla al reenviarla.
function ItemsEditor({
  items,
  materiales,
  onCambiar,
  onAgregar,
  onQuitar,
}: {
  items: ItemForm[];
  materiales: Material[];
  onCambiar: (key: string, cambios: Partial<ItemForm>) => void;
  onAgregar: () => void;
  onQuitar: (key: string) => void;
}) {
  return (
    <div className="full">
      <label>Materiales a despachar</label>
      <div className="items-solicitud">
        {items.map((it) => {
          const disponible = it.materialId ? stockDisponible(it.materialId, materiales) : null;
          const insuficiente = disponible !== null && it.cantidad !== "" && Number(it.cantidad) > disponible;
          const excluirIds = items
            .filter((otro) => otro.key !== it.key && otro.materialId)
            .map((otro) => Number(otro.materialId));
          return (
            <div key={it.key}>
              <div className="item-fila">
                <ComboMaterial
                  materiales={materiales}
                  materialId={it.materialId}
                  onSeleccionar={(id) => onCambiar(it.key, { materialId: id })}
                  excluirIds={excluirIds}
                />
                <div>
                  <label>Cantidad</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={it.cantidad}
                    onChange={(e) => onCambiar(it.key, { cantidad: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn-quitar-item"
                  onClick={() => onQuitar(it.key)}
                  disabled={items.length === 1}
                >
                  Quitar
                </button>
              </div>
              {disponible !== null && (
                <div className={`stock-aviso ${insuficiente ? "insuficiente" : ""}`}>
                  {insuficiente
                    ? `Stock insuficiente: solo hay ${money(disponible)} disponibles`
                    : `Disponible: ${money(disponible)}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="btn-agregar-item" onClick={onAgregar}>
        + Agregar otro material
      </button>
    </div>
  );
}

export function SolicitudesSalida() {
  const { usuario } = useAuth();
  const puedeCrear = esAdmin(usuario) || usuario?.rol === "tecnico-ejecutor" || usuario?.rol === "supervisor";
  const puedeAprobar = esAdmin(usuario) || usuario?.rol === "supervisor";
  const puedeAlistar = esAdmin(usuario) || usuario?.rol === "almacenista";
  // El tecnico no elige destinatario -- el material es para el mismo. Solo
  // admin/supervisor/coordinador indican para quien va realmente.
  const puedeElegirDestinatario = esAdmin(usuario) || usuario?.rol === "supervisor";

  const [searchParams, setSearchParams] = useSearchParams();
  const resaltarId = searchParams.get("resaltar");
  const filaResaltadaRef = useRef<HTMLTableRowElement>(null);

  const [materialesTodos, setMaterialesTodos] = useState<Material[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudSalida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroOrden, setFiltroOrden] = useState("");
  const [filtroRef, setFiltroRef] = useState("");
  const [filtroSolicitadoPor, setFiltroSolicitadoPor] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const [ref, setRef] = useState("");
  const [responsable, setResponsable] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<ItemForm[]>([itemVacio()]);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [destinatarioId, setDestinatarioId] = useState("");
  const [nuevoDestinatario, setNuevoDestinatario] = useState("");
  const [mostrarNuevoDestinatario, setMostrarNuevoDestinatario] = useState(false);
  const [guardandoDestinatario, setGuardandoDestinatario] = useState(false);

  const [adjunto, setAdjunto] = useState<File | null>(null);

  const [rechazando, setRechazando] = useState<SolicitudSalida | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");

  const [cancelando, setCancelando] = useState<SolicitudSalida | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");

  const [reenviando, setReenviando] = useState<SolicitudSalida | null>(null);
  const [notaReenvio, setNotaReenvio] = useState("");
  const [itemsReenvio, setItemsReenvio] = useState<ItemForm[]>([]);
  const [mensajeReenvio, setMensajeReenvio] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  const [agregandoMaterial, setAgregandoMaterial] = useState<SolicitudSalida | null>(null);
  const [itemsAgregar, setItemsAgregar] = useState<ItemForm[]>([]);
  const [mensajeAgregar, setMensajeAgregar] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [errorFila, setErrorFila] = useState<{ id: number; texto: string } | null>(null);

  const [alistando, setAlistando] = useState<SolicitudSalida | null>(null);
  const [fotoEvidencia, setFotoEvidencia] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [mensajeAlistar, setMensajeAlistar] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  const [viendoEvidencia, setViendoEvidencia] = useState<SolicitudSalida | null>(null);
  const [viendoAdjunto, setViendoAdjunto] = useState<SolicitudSalida | null>(null);
  const [viendoDetalle, setViendoDetalle] = useState<SolicitudSalida | null>(null);

  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroOrden) params.set("orden", filtroOrden);
    if (filtroRef) params.set("ref", filtroRef);
    if (filtroSolicitadoPor) params.set("solicitado_por", filtroSolicitadoPor);
    if (filtroDesde) params.set("desde", filtroDesde);
    if (filtroHasta) params.set("hasta", filtroHasta);
    return params;
  }

  function limpiarFiltros() {
    setFiltroEstado("");
    setFiltroOrden("");
    setFiltroRef("");
    setFiltroSolicitadoPor("");
    setFiltroDesde("");
    setFiltroHasta("");
  }

  function cargarSolicitudes() {
    setCargando(true);
    return api
      .get<SolicitudSalida[]>(`/api/solicitudes-salida?${construirParamsFiltro().toString()}`)
      .then(setSolicitudes)
      .finally(() => setCargando(false));
  }

  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErrorExportar(null);
    try {
      await descargarArchivo(`/api/solicitudes-salida/exportar?${construirParamsFiltro().toString()}`, "salidas.xlsx");
    } catch (err) {
      setErrorExportar(err instanceof ApiClientError ? err.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  function cargarMateriales() {
    return api.get<Material[]>("/api/materiales?activo=true").then(setMaterialesTodos);
  }

  useEffect(() => {
    cargarMateriales();
    if (puedeElegirDestinatario) {
      api.get<Destinatario[]>("/api/solicitudes-salida/destinatarios").then(setDestinatarios);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregarDestinatario() {
    const nombre = nuevoDestinatario.trim();
    if (!nombre) return;
    setGuardandoDestinatario(true);
    try {
      const creado = await api.post<Destinatario>("/api/solicitudes-salida/destinatarios", { nombre });
      setDestinatarios((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setDestinatarioId(String(creado.id));
      setNuevoDestinatario("");
      setMostrarNuevoDestinatario(false);
    } catch (err) {
      setMensaje({
        texto: err instanceof ApiClientError ? err.message : "Error al agregar el destinatario",
        tipo: "error",
      });
    } finally {
      setGuardandoDestinatario(false);
    }
  }

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    solicitudes,
    TAMANO_PAGINA
  );

  // No reinicia a la pagina 1 en la primera carga -- solo cuando el usuario
  // de verdad cambia un filtro.
  const primeraCargaRef = useRef(true);
  useEffect(() => {
    cargarSolicitudes();
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
    } else {
      irAPagina(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroOrden, filtroRef, filtroSolicitadoPor, filtroDesde, filtroHasta]);

  // Si se llego aca desde una notificacion (?resaltar=id), primero se ubica en
  // que pagina cae esa solicitud (puede no ser la 1) y salta ahi; una vez la
  // fila ya esta en pageItems, hace scroll hasta ella y la deja marcada un
  // momento para ubicarla facil en la tabla.
  useEffect(() => {
    if (!resaltarId || !solicitudes.length) return;
    const indice = solicitudes.findIndex((s) => String(s.id) === resaltarId);
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
  }, [resaltarId, solicitudes, paginaActual]);

  function resetFormulario() {
    setRef("");
    setResponsable("");
    setObservaciones("");
    setItems([itemVacio()]);
    setDestinatarioId("");
    setNuevoDestinatario("");
    setMostrarNuevoDestinatario(false);
    setAdjunto(null);
  }

  function abrirNuevo() {
    resetFormulario();
    setResponsable(usuario?.nombre ?? ""); // el tecnico logueado es quien esta solicitando
    setMensaje(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    resetFormulario();
    setMensaje(null);
  }

  function hayStockInsuficiente(lista: ItemForm[]): boolean {
    return lista.some((it) => {
      if (!it.materialId || it.cantidad === "") return false;
      const disponible = stockDisponible(it.materialId, materialesTodos);
      return disponible !== null && Number(it.cantidad) > disponible;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.some((it) => !it.materialId)) {
      setMensaje({ texto: "Selecciona el material de cada línea antes de registrar.", tipo: "error" });
      return;
    }
    if (hayStockInsuficiente(items)) {
      setMensaje({ texto: "Hay materiales sin stock suficiente. Ajusta las cantidades antes de enviar.", tipo: "error" });
      return;
    }
    if (puedeElegirDestinatario && !destinatarioId) {
      setMensaje({ texto: "Debes indicar a quién va el material.", tipo: "error" });
      return;
    }
    if (!adjunto) {
      setMensaje({ texto: "Debes adjuntar una imagen o PDF junto con el RF.", tipo: "error" });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append("rf_relacionada", ref);
      formData.append("responsable", responsable);
      formData.append("observaciones", observaciones);
      formData.append("items", JSON.stringify(items.map((it) => ({ material_id: it.materialId, cantidad: it.cantidad }))));
      if (puedeElegirDestinatario) formData.append("destinatario_id", destinatarioId);
      formData.append("adjunto", adjunto);
      await api.upload("/api/solicitudes-salida", formData);
      setMostrarForm(false);
      resetFormulario();
      await cargarSolicitudes();
    } catch (err) {
      setMensaje({
        texto: err instanceof ApiClientError ? err.message : "Error al crear la solicitud",
        tipo: "error",
      });
    } finally {
      setEnviando(false);
    }
  }

  async function aprobar(s: SolicitudSalida) {
    setProcesandoId(s.id);
    setErrorFila(null);
    try {
      await api.post(`/api/solicitudes-salida/${s.id}/aprobar`);
      await cargarSolicitudes();
    } catch (err) {
      setErrorFila({ id: s.id, texto: err instanceof ApiClientError ? err.message : "Error al aprobar" });
    } finally {
      setProcesandoId(null);
    }
  }

  function abrirAlistar(s: SolicitudSalida) {
    setAlistando(s);
    setFotoEvidencia(null);
    setFotoPreview(null);
    setMensajeAlistar(null);
  }

  function cerrarAlistar() {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setAlistando(null);
    setFotoEvidencia(null);
    setFotoPreview(null);
    setMensajeAlistar(null);
  }

  function elegirFoto(archivo: File | null) {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoEvidencia(archivo);
    setFotoPreview(archivo ? URL.createObjectURL(archivo) : null);
  }

  async function confirmarAlistar(e: FormEvent) {
    e.preventDefault();
    if (!alistando) return;
    if (!fotoEvidencia) {
      setMensajeAlistar({ texto: "La foto de evidencia es obligatoria para marcar Material OK.", tipo: "error" });
      return;
    }
    setProcesandoId(alistando.id);
    setMensajeAlistar(null);
    try {
      const formData = new FormData();
      formData.append("evidencia", fotoEvidencia);
      await api.upload(`/api/solicitudes-salida/${alistando.id}/alistar`, formData);
      cerrarAlistar();
      await cargarSolicitudes();
      await cargarMateriales(); // alistar descuenta stock real: refresca para que el "Disponible" no quede desactualizado
    } catch (err) {
      setMensajeAlistar({
        texto: err instanceof ApiClientError ? err.message : "Error al marcar Material OK",
        tipo: "error",
      });
    } finally {
      setProcesandoId(null);
    }
  }

  function abrirRechazo(s: SolicitudSalida) {
    setRechazando(s);
    setMotivoRechazo("");
  }

  async function confirmarRechazo(e: FormEvent) {
    e.preventDefault();
    if (!rechazando) return;
    if (!motivoRechazo.trim()) return;
    setProcesandoId(rechazando.id);
    try {
      await api.post(`/api/solicitudes-salida/${rechazando.id}/rechazar`, { motivo: motivoRechazo });
      setRechazando(null);
      await cargarSolicitudes();
    } catch (err) {
      setErrorFila({
        id: rechazando.id,
        texto: err instanceof ApiClientError ? err.message : "Error al rechazar",
      });
    } finally {
      setProcesandoId(null);
    }
  }

  function abrirCancelar(s: SolicitudSalida) {
    setCancelando(s);
    setMotivoCancelar("");
  }

  async function confirmarCancelar(e: FormEvent) {
    e.preventDefault();
    if (!cancelando) return;
    if (!motivoCancelar.trim()) return;
    setProcesandoId(cancelando.id);
    try {
      await api.post(`/api/solicitudes-salida/${cancelando.id}/cancelar`, { motivo: motivoCancelar });
      setCancelando(null);
      await cargarSolicitudes();
    } catch (err) {
      setErrorFila({
        id: cancelando.id,
        texto: err instanceof ApiClientError ? err.message : "Error al cancelar",
      });
    } finally {
      setProcesandoId(null);
    }
  }

  function abrirReenvio(s: SolicitudSalida) {
    setReenviando(s);
    setNotaReenvio("");
    setMensajeReenvio(null);
    setItemsReenvio(
      s.items.map((it) => ({ key: crypto.randomUUID(), materialId: String(it.material_id), cantidad: it.cantidad }))
    );
  }

  // Misma comparacion que hace el backend -- se adelanta el aviso aca para no
  // hacerle esperar un viaje al servidor solo para enterarse de que no cambio nada.
  function itemsReenvioSinCambios(): boolean {
    if (!reenviando) return false;
    if (itemsReenvio.length !== reenviando.items.length) return false;
    const normalizar = (items: { materialId: string; cantidad: string }[]) =>
      items.map((it) => `${it.materialId}:${Number(it.cantidad)}`).sort();
    const actual = normalizar(itemsReenvio);
    const original = reenviando.items.map((it) => `${it.material_id}:${Number(it.cantidad)}`).sort();
    return actual.every((v, i) => v === original[i]);
  }

  async function confirmarReenvio(e: FormEvent) {
    e.preventDefault();
    if (!reenviando) return;
    if (itemsReenvio.some((it) => !it.materialId)) {
      setMensajeReenvio({ texto: "Selecciona el material de cada línea antes de reenviar.", tipo: "error" });
      return;
    }
    if (hayStockInsuficiente(itemsReenvio)) {
      setMensajeReenvio({ texto: "Hay materiales sin stock suficiente. Ajusta las cantidades antes de reenviar.", tipo: "error" });
      return;
    }
    if (itemsReenvioSinCambios()) {
      setMensajeReenvio({ texto: "Debes modificar al menos un material o su cantidad antes de reenviar.", tipo: "error" });
      return;
    }
    setProcesandoId(reenviando.id);
    setMensajeReenvio(null);
    try {
      await api.post(`/api/solicitudes-salida/${reenviando.id}/reenviar`, {
        nota: notaReenvio,
        items: itemsReenvio.map((it) => ({ material_id: it.materialId, cantidad: it.cantidad })),
      });
      setReenviando(null);
      await cargarSolicitudes();
    } catch (err) {
      setMensajeReenvio({
        texto: err instanceof ApiClientError ? err.message : "Error al reenviar la solicitud",
        tipo: "error",
      });
    } finally {
      setProcesandoId(null);
    }
  }

  function abrirAgregarMaterial(s: SolicitudSalida) {
    setAgregandoMaterial(s);
    setItemsAgregar([itemVacio()]);
    setMensajeAgregar(null);
  }

  async function confirmarAgregarMaterial(e: FormEvent) {
    e.preventDefault();
    if (!agregandoMaterial) return;
    if (itemsAgregar.some((it) => !it.materialId)) {
      setMensajeAgregar({ texto: "Selecciona el material de cada línea antes de agregar.", tipo: "error" });
      return;
    }
    if (hayStockInsuficiente(itemsAgregar)) {
      setMensajeAgregar({ texto: "Hay materiales sin stock suficiente. Ajusta las cantidades antes de agregar.", tipo: "error" });
      return;
    }
    setProcesandoId(agregandoMaterial.id);
    setMensajeAgregar(null);
    try {
      await api.post(`/api/solicitudes-salida/${agregandoMaterial.id}/agregar-material`, {
        items: itemsAgregar.map((it) => ({ material_id: it.materialId, cantidad: it.cantidad })),
      });
      setAgregandoMaterial(null);
      await cargarSolicitudes();
    } catch (err) {
      setMensajeAgregar({
        texto: err instanceof ApiClientError ? err.message : "Error al agregar material",
        tipo: "error",
      });
    } finally {
      setProcesandoId(null);
    }
  }

  // Abre el detalle completo (todos los materiales, no solo lo que cabe en la
  // fila) y de paso marca la solicitud como "vista" por el usuario actual --
  // asi no hay que exigirle ademas que le haga clic a la notificacion de la
  // campanita para que aparezca el ojito de su rol.
  function abrirDetalle(s: SolicitudSalida) {
    setViendoDetalle(s);
    api
      .post(`/api/solicitudes-salida/${s.id}/marcar-visto`)
      .then(cargarSolicitudes)
      .catch(() => {});
  }

  return (
    <section className="view">
      {puedeCrear && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
            + Nueva solicitud de salida
          </button>
        </div>
      )}

      {puedeCrear && mostrarForm && (
        <Modal
          titulo="Nueva solicitud de salida"
          onClose={cerrarForm}
          confirmarCierre={Boolean(
            ref || observaciones || destinatarioId || adjunto || items.some((it) => it.materialId || it.cantidad)
          )}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <div>
              <label>RF</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Obligatorio, único"
                required
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
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

            {puedeElegirDestinatario && (
              <div className="full">
                <label>¿Para quién va el material?</label>
                <div className="tags-input">
                  <select value={destinatarioId} onChange={(e) => setDestinatarioId(e.target.value)}>
                    <option value="">Selecciona un destinatario...</option>
                    {destinatarios.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-secundario" onClick={() => setMostrarNuevoDestinatario((v) => !v)}>
                    {mostrarNuevoDestinatario ? "Cancelar" : "+ Nuevo"}
                  </button>
                </div>
                {mostrarNuevoDestinatario && (
                  <div className="tags-input" style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Nombre de la persona"
                      value={nuevoDestinatario}
                      onChange={(e) => setNuevoDestinatario(e.target.value)}
                    />
                    <button type="button" className="btn-secundario" onClick={agregarDestinatario} disabled={guardandoDestinatario}>
                      {guardandoDestinatario ? "Agregando..." : "Agregar"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="full">
              <label>Adjunto (imagen o PDF, obligatorio)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                required
                onChange={(e) => setAdjunto(e.target.files?.[0] ?? null)}
              />
            </div>

            <ItemsEditor
              items={items}
              materiales={materialesTodos}
              onCambiar={(key, cambios) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...cambios } : it)))}
              onAgregar={() => setItems((prev) => [...prev, itemVacio()])}
              onQuitar={(key) => setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))}
            />

            <button type="submit" disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar solicitud"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarForm}>
              Cancelar
            </button>
          </form>
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </Modal>
      )}

      {rechazando && (
        <Modal
          titulo={`Rechazar solicitud ${rechazando.numero_orden ?? "#" + rechazando.id}`}
          onClose={() => setRechazando(null)}
          confirmarCierre={motivoRechazo.trim() !== ""}
        >
          <form className="form-grid" onSubmit={confirmarRechazo}>
            <div className="full">
              <label>Motivo del rechazo</label>
              <input
                type="text"
                placeholder="Ej: material equivocado, esto no corresponde a esa OT..."
                required
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
              />
            </div>
            <button type="submit" disabled={procesandoId === rechazando.id}>
              {procesandoId === rechazando.id ? "Rechazando..." : "Confirmar rechazo"}
            </button>
            <button type="button" className="btn-secundario" onClick={() => setRechazando(null)}>
              Cancelar
            </button>
          </form>
        </Modal>
      )}

      {cancelando && (
        <Modal
          titulo={`Cancelar solicitud ${cancelando.numero_orden ?? "#" + cancelando.id}`}
          onClose={() => setCancelando(null)}
          confirmarCierre={motivoCancelar.trim() !== ""}
        >
          <form className="form-grid" onSubmit={confirmarCancelar}>
            <div className="full">
              <label>Motivo de la cancelación</label>
              <input
                type="text"
                placeholder="Ej: ya no se necesita el material, se canceló la OT..."
                required
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
              />
            </div>
            <button type="submit" disabled={procesandoId === cancelando.id}>
              {procesandoId === cancelando.id ? "Cancelando..." : "Confirmar cancelación"}
            </button>
            <button type="button" className="btn-secundario" onClick={() => setCancelando(null)}>
              Volver
            </button>
          </form>
        </Modal>
      )}

      {reenviando && (
        <Modal
          titulo={`Reenviar solicitud ${reenviando.numero_orden ?? "#" + reenviando.id}`}
          onClose={() => setReenviando(null)}
          confirmarCierre={notaReenvio.trim() !== "" || !itemsReenvioSinCambios()}
        >
          <form className="form-grid" onSubmit={confirmarReenvio}>
            <div className="full">
              <label>¿Qué corregiste? (para el supervisor)</label>
              <input
                type="text"
                placeholder="Ej: ya se repuso material, se agregó el conector faltante..."
                required
                value={notaReenvio}
                onChange={(e) => setNotaReenvio(e.target.value)}
              />
            </div>

            <ItemsEditor
              items={itemsReenvio}
              materiales={materialesTodos}
              onCambiar={(key, cambios) => setItemsReenvio((prev) => prev.map((it) => (it.key === key ? { ...it, ...cambios } : it)))}
              onAgregar={() => setItemsReenvio((prev) => [...prev, itemVacio()])}
              onQuitar={(key) => setItemsReenvio((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))}
            />

            <button type="submit" disabled={procesandoId === reenviando.id}>
              {procesandoId === reenviando.id ? "Reenviando..." : "Reenviar a revisión"}
            </button>
            <button type="button" className="btn-secundario" onClick={() => setReenviando(null)}>
              Cancelar
            </button>
          </form>
          {mensajeReenvio && <div className={`mensaje-form ${mensajeReenvio.tipo}`}>{mensajeReenvio.texto}</div>}
        </Modal>
      )}

      {agregandoMaterial && (
        <Modal
          titulo={`Agregar material a ${agregandoMaterial.numero_orden ?? "#" + agregandoMaterial.id}`}
          onClose={() => setAgregandoMaterial(null)}
          confirmarCierre={itemsAgregar.some((it) => it.materialId || it.cantidad)}
        >
          <form className="form-grid" onSubmit={confirmarAgregarMaterial}>
            {agregandoMaterial.estado === "aprobada" && (
              <p className="full" style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
                Esta solicitud ya estaba aprobada — al agregar material volverá a "Pendiente" para que el
                supervisor la revise de nuevo completa.
              </p>
            )}

            <ItemsEditor
              items={itemsAgregar}
              materiales={materialesTodos}
              onCambiar={(key, cambios) => setItemsAgregar((prev) => prev.map((it) => (it.key === key ? { ...it, ...cambios } : it)))}
              onAgregar={() => setItemsAgregar((prev) => [...prev, itemVacio()])}
              onQuitar={(key) => setItemsAgregar((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))}
            />

            <button type="submit" disabled={procesandoId === agregandoMaterial.id}>
              {procesandoId === agregandoMaterial.id ? "Agregando..." : "Agregar material"}
            </button>
            <button type="button" className="btn-secundario" onClick={() => setAgregandoMaterial(null)}>
              Cancelar
            </button>
          </form>
          {mensajeAgregar && <div className={`mensaje-form ${mensajeAgregar.tipo}`}>{mensajeAgregar.texto}</div>}
        </Modal>
      )}

      {alistando && (
        <Modal
          titulo={`Marcar Material OK — ${alistando.numero_orden ?? "#" + alistando.id}`}
          onClose={cerrarAlistar}
          confirmarCierre={fotoEvidencia !== null}
        >
          <form className="form-grid" onSubmit={confirmarAlistar}>
            <div className="full">
              <label>Foto de evidencia (obligatoria)</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                required
                onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
              />
            </div>
            {fotoPreview && (
              <div className="full">
                <img
                  src={fotoPreview}
                  alt="Vista previa de la evidencia"
                  style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }}
                />
              </div>
            )}
            <button type="submit" disabled={procesandoId === alistando.id}>
              {procesandoId === alistando.id ? "Guardando..." : "Confirmar Material OK"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarAlistar}>
              Cancelar
            </button>
          </form>
          {mensajeAlistar && <div className={`mensaje-form ${mensajeAlistar.tipo}`}>{mensajeAlistar.texto}</div>}
        </Modal>
      )}

      {viendoEvidencia && (
        <Modal
          titulo={`Evidencia — ${viendoEvidencia.numero_orden ?? "#" + viendoEvidencia.id}`}
          onClose={() => setViendoEvidencia(null)}
        >
          <img
            src={`/api/solicitudes-salida/${viendoEvidencia.id}/foto`}
            alt="Evidencia fotográfica de la entrega"
            style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
          />
        </Modal>
      )}

      {viendoAdjunto && (
        <Modal
          titulo={`Adjunto — ${viendoAdjunto.numero_orden ?? "#" + viendoAdjunto.id}`}
          onClose={() => setViendoAdjunto(null)}
        >
          {viendoAdjunto.adjunto?.toLowerCase().endsWith(".pdf") ? (
            <iframe
              src={`/api/solicitudes-salida/${viendoAdjunto.id}/adjunto`}
              title="Adjunto de la solicitud"
              style={{ width: "100%", height: "70vh", border: "none", borderRadius: 8 }}
            />
          ) : (
            <img
              src={`/api/solicitudes-salida/${viendoAdjunto.id}/adjunto`}
              alt="Adjunto de la solicitud"
              style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
            />
          )}
        </Modal>
      )}

      {viendoDetalle && (
        <Modal
          titulo={`Detalle — ${viendoDetalle.numero_orden ?? "#" + viendoDetalle.id}`}
          onClose={() => setViendoDetalle(null)}
        >
          <div className="detalle-datos">
            <div>
              <strong>RF:</strong> {viendoDetalle.rf_relacionada}
            </div>
            {viendoDetalle.responsable && (
              <div>
                <strong>Responsable:</strong> {viendoDetalle.responsable}
              </div>
            )}
            {viendoDetalle.observaciones && (
              <div>
                <strong>Observaciones:</strong> {viendoDetalle.observaciones}
              </div>
            )}
            <div>
              <strong>Solicitado por:</strong> {viendoDetalle.solicitado_por_nombre || "—"}
            </div>
            <div>
              <strong>Destinatario:</strong> {viendoDetalle.destinatario_nombre || "N/A"}
            </div>
            <div>
              <strong>Estado:</strong>{" "}
              <span className={`badge ${viendoDetalle.estado}`}>{ESTADO_SOLICITUD_LABEL[viendoDetalle.estado]}</span>
            </div>
          </div>

          <h3 className="detalle-subtitulo">Materiales ({viendoDetalle.items.length})</h3>
          <div className="detalle-items">
            {viendoDetalle.items.map((it) => (
              <div key={it.id} className="detalle-item-fila">
                <span>{it.producto}</span>
                <span>
                  {money(it.cantidad)} {it.unidad}
                </span>
              </div>
            ))}
          </div>

          <h3 className="detalle-subtitulo">Historial</h3>
          <div className="timeline-solicitud">
            {viendoDetalle.eventos.map((ev) => (
              <div key={ev.id} className={`timeline-item timeline-${ev.tipo}`}>
                <strong>{EVENTO_SOLICITUD_LABEL[ev.tipo]}</strong>
                {ev.usuario_nombre ? ` — ${ev.usuario_nombre}` : ""}
                {ev.nota ? `: "${ev.nota}"` : ""}
                <div className="timeline-item__fecha">{new Date(ev.creado_en).toLocaleString("es-CO")}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <div className="panel">
        <h2>Solicitudes de salida</h2>
        <div className="filtros-mov">
          <div>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="aprobada">Aprobada</option>
              <option value="lista">Material OK</option>
              <option value="rechazada">Rechazada</option>
              <option value="cancelada">Cancelada</option>
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
          {usuario?.rol !== "tecnico-ejecutor" && (
            <div>
              <label>Solicitado por</label>
              <input
                type="text"
                placeholder="Buscar técnico..."
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
                <th>Materiales</th>
                <th>Solicitado por</th>
                <th>Destinatario</th>
                <th>Estado</th>
                <th>Historial</th>
                <th>Adjuntos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    No hay solicitudes con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((s) => (
                  <tr
                    key={s.id}
                    ref={String(s.id) === resaltarId ? filaResaltadaRef : undefined}
                    className={String(s.id) === resaltarId ? "fila-resaltada" : undefined}
                  >
                    <td>{new Date(s.creado_en).toLocaleString("es-CO")}</td>
                    <td>{s.numero_orden || "—"}</td>
                    <td>{s.rf_relacionada}</td>
                    <td>
                      <button type="button" className="btn-reenviar" onClick={() => abrirDetalle(s)}>
                        <List size={14} /> {s.items.length} {s.items.length === 1 ? "material" : "materiales"}
                      </button>
                    </td>
                    <td>{s.solicitado_por_nombre || "—"}</td>
                    <td>{s.destinatario_nombre || "N/A"}</td>
                    <td>
                      <span className={`badge ${s.estado}`}>{ESTADO_SOLICITUD_LABEL[s.estado]}</span>
                      <div className="vistos">
                        {s.visto_tecnico && (
                          <span className="visto-chip">
                            <Eye size={11} /> Técnico
                          </span>
                        )}
                        {s.visto_supervisor && (
                          <span className="visto-chip">
                            <Eye size={11} /> Supervisor
                          </span>
                        )}
                        {s.visto_almacenista && (
                          <span className="visto-chip">
                            <Eye size={11} /> Almacenista
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="timeline-solicitud">
                        {s.eventos.map((ev) => (
                          <div key={ev.id} className={`timeline-item timeline-${ev.tipo}`}>
                            <strong>{EVENTO_SOLICITUD_LABEL[ev.tipo]}</strong>
                            {ev.usuario_nombre ? ` — ${ev.usuario_nombre}` : ""}
                            {ev.nota ? `: "${ev.nota}"` : ""}
                            <div className="timeline-item__fecha">{new Date(ev.creado_en).toLocaleString("es-CO")}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="acciones-solicitud">
                        {s.estado === "lista" && s.foto_evidencia && (
                          <button type="button" className="btn-reenviar btn-icono" title="Ver evidencia" onClick={() => setViendoEvidencia(s)}>
                            <ImageIcon size={14} />
                          </button>
                        )}
                        {s.adjunto &&
                          (esAdmin(usuario) || usuario?.rol === "almacenista" || s.solicitado_por === usuario?.id) && (
                            <button type="button" className="btn-reenviar btn-icono" title="Ver adjunto" onClick={() => setViendoAdjunto(s)}>
                              <Paperclip size={14} />
                            </button>
                          )}
                      </div>
                    </td>
                    <td>
                      <div className="acciones-solicitud">
                        {puedeAprobar && s.estado === "pendiente" && (
                          <>
                            <button
                              type="button"
                              className="btn-aprobar btn-compacto"
                              disabled={procesandoId === s.id}
                              onClick={() => aprobar(s)}
                            >
                              <Check size={13} /> Aprobar
                            </button>
                            <button
                              type="button"
                              className="btn-rechazar btn-compacto"
                              disabled={procesandoId === s.id}
                              onClick={() => abrirRechazo(s)}
                            >
                              <X size={13} /> Rechazar
                            </button>
                          </>
                        )}
                        {puedeAlistar && s.estado === "aprobada" && (
                          <button
                            type="button"
                            className="btn-aprobar btn-compacto"
                            disabled={procesandoId === s.id}
                            onClick={() => abrirAlistar(s)}
                          >
                            <Camera size={13} /> Material OK
                          </button>
                        )}
                        {puedeAprobar && s.estado === "aprobada" && (
                          <button
                            type="button"
                            className="btn-rechazar btn-compacto"
                            disabled={procesandoId === s.id}
                            onClick={() => abrirCancelar(s)}
                          >
                            <Ban size={13} /> Cancelar
                          </button>
                        )}
                        {puedeCrear &&
                          s.estado === "rechazada" &&
                          (esAdmin(usuario) || s.solicitado_por === usuario?.id) && (
                            <button
                              type="button"
                              className="btn-reenviar btn-compacto"
                              disabled={procesandoId === s.id}
                              onClick={() => abrirReenvio(s)}
                            >
                              <RotateCcw size={13} /> Reenviar
                            </button>
                          )}
                        {puedeCrear &&
                          (s.estado === "pendiente" || s.estado === "aprobada") &&
                          (esAdmin(usuario) || s.solicitado_por === usuario?.id) && (
                            <button
                              type="button"
                              className="btn-reenviar btn-compacto"
                              title="Agregar material"
                              disabled={procesandoId === s.id}
                              onClick={() => abrirAgregarMaterial(s)}
                            >
                              <Plus size={13} /> Agregar
                            </button>
                          )}
                      </div>
                      {errorFila?.id === s.id && <div className="mensaje-form error">{errorFila.texto}</div>}
                    </td>
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
          etiqueta="solicitudes"
          onCambiarPagina={irAPagina}
        />
      </div>
    </section>
  );
}
