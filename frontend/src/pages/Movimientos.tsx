import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../api/supabaseClient";
import { subirEvidencia } from "../api/storage";
import type { Material, MaterialReferenciaEstado, Solicitante, TipoMovimiento } from "../api/types";
import { Modal } from "../components/Modal";
import { ComboMaterial } from "../components/ComboMaterial";
import { PanelMovimientosRecientes } from "../components/PanelMovimientosRecientes";
import { useMovimientosRecientes } from "../hooks/useMovimientosRecientes";
import { money } from "../lib/labels";
import { abrirRemisionPdf, type DatosRemisionSalida, type TipoMovimientoRemision } from "../lib/remision";
import { Printer } from "lucide-react";

const OPCIONES_TIPO_MOVIMIENTO: Exclude<TipoMovimientoRemision, "">[] = [
  "Consumo",
  "Traslado",
  "Préstamo",
  "Alquiler",
  "Otro",
];

const FORM_VACIO = {
  material_id: "",
  tipo: "entrada" as TipoMovimiento,
  cantidad: "",
  referencia_id: "",
  solicitante_id: "",
  observaciones: "",
  ubicacion: "",
  // Solo se usan en Salida, para la remision (ver supabase/migrations/
  // 0025_remision_campos_salida.sql) -- texto libre, no vienen del catalogo
  // del material.
  area_proyecto: "",
  centro_costo_texto: "",
  motivo_salida: "",
  tipo_movimiento: "" as TipoMovimientoRemision,
};

// Registro directo de entradas/salidas (sin flujo de aprobacion -- el cliente
// no lo pidio para este alcance). El historial completo de solo lectura vive
// en Historial.tsx.
export function Movimientos() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [solicitantes, setSolicitantes] = useState<Solicitante[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const [adjunto, setAdjunto] = useState<File | null>(null);
  const [actaEntrega, setActaEntrega] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const { movimientos: recientes, cargando: cargandoRecientes, error: errorRecientes, recargar: cargarRecientes } =
    useMovimientosRecientes(10);
  const [referenciasDelMaterial, setReferenciasDelMaterial] = useState<MaterialReferenciaEstado[]>([]);
  const [cargandoReferencias, setCargandoReferencias] = useState(false);
  const [nuevoSolicitante, setNuevoSolicitante] = useState("");
  const [creandoSolicitante, setCreandoSolicitante] = useState(false);
  const [ultimaRemision, setUltimaRemision] = useState<DatosRemisionSalida | null>(null);
  // Fuerza que el buscador de material se reinicie de verdad (texto
  // visible incluido) cada vez que se agrega una linea a la salida -- ver
  // ComboMaterial.tsx, su texto interno no se resincroniza solo cuando el
  // padre limpia materialId por fuera de una interaccion del usuario.
  const [comboResetKey, setComboResetKey] = useState(0);
  // Solo para Entrada de un material con referencias: en vez de obligar a
  // repetir el formulario completo por cada referencia, se arma esta lista
  // (referencia + cantidad) y se registran todas de una vez al enviar.
  const [lineasReferencia, setLineasReferencia] = useState<{ referencia_id: number; codigo: string; cantidad: string }[]>(
    []
  );
  // Para Salida: carrito de materiales distintos (cada uno con su propia
  // referencia si aplica) -- se registran todos como movimientos separados
  // al enviar, y la remision del PDF sale con todos juntos en la tabla.
  const [lineasSalida, setLineasSalida] = useState<
    { material_id: number; codigo: string; descripcion: string; referencia_id: number | null; referenciaCodigo: string | null; cantidad: string }[]
  >([]);

  async function cargarMateriales() {
    const { data } = await supabase
      .from("materiales")
      .select("*, empresas(nombre), centros_costo(nombre)")
      .eq("activo", true)
      .order("descripcion");
    setMateriales(
      (data ?? []).map((m) => ({
        ...m,
        empresa_nombre: (m.empresas as { nombre: string } | null)?.nombre ?? "—",
        centro_costo_nombre: (m.centros_costo as { nombre: string } | null)?.nombre ?? null,
      })) as Material[]
    );
  }

  useEffect(() => {
    cargarMateriales();
    supabase
      .from("solicitantes")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setSolicitantes((data as Solicitante[]) ?? []));
  }, []);

  function abrirNuevo(tipo: TipoMovimiento) {
    setForm({ ...FORM_VACIO, tipo });
    setFoto(null);
    setAdjunto(null);
    setActaEntrega(null);
    setNuevoSolicitante("");
    setMensaje(null);
    setUltimaRemision(null);
    setLineasReferencia([]);
    setLineasSalida([]);
    setMostrarForm(true);
  }

  // Mismo patron que agregar un centro de costo desde Materiales -- se puede
  // dar de alta un solicitante nuevo sin salir del formulario. La lista es
  // compartida entre Entrada y Salida (una sola tabla), asi que agregarlo
  // aca ya lo deja disponible en las dos.
  async function agregarSolicitante() {
    const nombre = nuevoSolicitante.trim();
    if (!nombre) return;
    setCreandoSolicitante(true);
    const { data, error } = await supabase.from("solicitantes").insert({ nombre }).select().single();
    setCreandoSolicitante(false);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    setSolicitantes((prev) => [...prev, data as Solicitante].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setForm((f) => ({ ...f, solicitante_id: String(data.id) }));
    setNuevoSolicitante("");
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setFoto(null);
    setAdjunto(null);
    setActaEntrega(null);
    setReferenciasDelMaterial([]);
    setNuevoSolicitante("");
    setMensaje(null);
    setLineasReferencia([]);
    setLineasSalida([]);
  }

  const materialSeleccionado = materiales.find((m) => String(m.id) === form.material_id);
  const referenciaSeleccionada = referenciasDelMaterial.find((r) => String(r.id) === form.referencia_id);

  // Si el material elegido maneja referencias, hay que traer cuales tiene y
  // cuanto stock disponible tiene cada una para el selector de abajo. En
  // Entrada se puede elegir cualquiera (para sumarle mas stock); en Salida
  // solo las que ya tengan stock_disponible > 0 (filtrado en el render).
  async function seleccionarMaterial(id: string) {
    const mat = materiales.find((m) => String(m.id) === id);
    setForm((f) => ({ ...f, material_id: id, referencia_id: "", ubicacion: "" }));
    setLineasReferencia([]);
    if (!mat?.maneja_referencias) {
      setReferenciasDelMaterial([]);
      return;
    }
    setCargandoReferencias(true);
    const { data } = await supabase
      .from("material_referencias_estado")
      .select("*")
      .eq("material_id", mat.id)
      .order("codigo");
    setReferenciasDelMaterial((data as MaterialReferenciaEstado[]) ?? []);
    setCargandoReferencias(false);
  }

  const referenciasCandidatas = referenciasDelMaterial.filter((r) =>
    form.tipo === "salida" ? r.stock_disponible > 0 : true
  );
  const entradaMultiReferencia = form.tipo === "entrada" && Boolean(materialSeleccionado?.maneja_referencias);

  // Agrega (o actualiza si ya estaba) la referencia+cantidad elegida en la
  // lista de la entrada, y limpia los campos para elegir la siguiente.
  function agregarLineaReferencia() {
    if (!form.referencia_id || !form.cantidad) return;
    const cantidadNum = Number(form.cantidad);
    if (!(cantidadNum > 0)) return;
    const refId = Number(form.referencia_id);
    const ref = referenciasDelMaterial.find((r) => r.id === refId);
    if (!ref) return;
    setLineasReferencia((prev) => {
      const existe = prev.some((l) => l.referencia_id === refId);
      if (existe) {
        return prev.map((l) => (l.referencia_id === refId ? { ...l, cantidad: form.cantidad } : l));
      }
      return [...prev, { referencia_id: refId, codigo: ref.codigo, cantidad: form.cantidad }];
    });
    setForm((f) => ({ ...f, referencia_id: "", cantidad: "" }));
  }

  function quitarLineaReferencia(refId: number) {
    setLineasReferencia((prev) => prev.filter((l) => l.referencia_id !== refId));
  }

  const salidaMultiMaterial = form.tipo === "salida";

  // Agrega (o actualiza si el mismo material/referencia ya estaba) la linea
  // armada en el carrito de la salida, validando stock contra lo que de
  // verdad hay disponible, y limpia los campos para elegir el siguiente
  // material.
  function agregarLineaSalida() {
    if (!materialSeleccionado) return;
    const cantidadNum = Number(form.cantidad);
    if (!(cantidadNum > 0)) return;

    if (materialSeleccionado.maneja_referencias) {
      if (!form.referencia_id) return;
      const ref = referenciasDelMaterial.find((r) => String(r.id) === form.referencia_id);
      if (!ref) return;
      if (cantidadNum > ref.stock_disponible) {
        setMensaje({
          texto: `No hay suficiente stock en "${ref.codigo}" (disponible: ${ref.stock_disponible}).`,
          tipo: "error",
        });
        return;
      }
      setLineasSalida((prev) => {
        const nuevaLinea = {
          material_id: materialSeleccionado.id,
          codigo: materialSeleccionado.codigo,
          descripcion: materialSeleccionado.descripcion,
          referencia_id: ref.id,
          referenciaCodigo: ref.codigo,
          cantidad: form.cantidad,
        };
        const existe = prev.some((l) => l.material_id === nuevaLinea.material_id && l.referencia_id === ref.id);
        if (existe) {
          return prev.map((l) =>
            l.material_id === nuevaLinea.material_id && l.referencia_id === ref.id ? nuevaLinea : l
          );
        }
        return [...prev, nuevaLinea];
      });
    } else {
      if (cantidadNum > materialSeleccionado.stock_actual) {
        setMensaje({
          texto: `No hay suficiente stock (disponible: ${materialSeleccionado.stock_actual}).`,
          tipo: "error",
        });
        return;
      }
      setLineasSalida((prev) => {
        const nuevaLinea = {
          material_id: materialSeleccionado.id,
          codigo: materialSeleccionado.codigo,
          descripcion: materialSeleccionado.descripcion,
          referencia_id: null,
          referenciaCodigo: null,
          cantidad: form.cantidad,
        };
        const existe = prev.some((l) => l.material_id === nuevaLinea.material_id && l.referencia_id === null);
        if (existe) {
          return prev.map((l) => (l.material_id === nuevaLinea.material_id && l.referencia_id === null ? nuevaLinea : l));
        }
        return [...prev, nuevaLinea];
      });
    }

    setMensaje(null);
    setForm((f) => ({ ...f, material_id: "", referencia_id: "", cantidad: "" }));
    setReferenciasDelMaterial([]);
    setComboResetKey((k) => k + 1);
  }

  function quitarLineaSalida(materialId: number, referenciaId: number | null) {
    setLineasSalida((prev) => prev.filter((l) => !(l.material_id === materialId && l.referencia_id === referenciaId)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (salidaMultiMaterial) {
      if (lineasSalida.length === 0) {
        setMensaje({ texto: "Agrega al menos un material con su cantidad.", tipo: "error" });
        return;
      }
    } else if (entradaMultiReferencia) {
      if (!form.material_id) {
        setMensaje({ texto: "Selecciona un material de la lista.", tipo: "error" });
        return;
      }
      if (lineasReferencia.length === 0) {
        setMensaje({ texto: "Agrega al menos una referencia con su cantidad.", tipo: "error" });
        return;
      }
    } else if (!form.material_id) {
      setMensaje({ texto: "Selecciona un material de la lista.", tipo: "error" });
      return;
    }

    setEnviando(true);
    setMensaje(null);
    try {
      const [fotoUrl, adjuntoUrl] = await Promise.all([
        foto ? subirEvidencia("movimientos", foto) : Promise.resolve(undefined),
        adjunto ? subirEvidencia("movimientos", adjunto) : Promise.resolve(undefined),
      ]);
      const actaUrl = actaEntrega ? await subirEvidencia("movimientos", actaEntrega) : undefined;

      if (salidaMultiMaterial) {
        const { data: numeroData, error: numeroError } = await supabase.rpc("siguiente_remision_numero");
        if (numeroError) throw numeroError;
        const remisionNumero = numeroData as number;
        const areaProyecto = form.area_proyecto.trim() || null;
        const centroCostoTexto = form.centro_costo_texto.trim() || null;
        const motivoSalida = form.motivo_salida.trim() || null;
        const tipoMovimiento = form.tipo_movimiento || null;
        const ubicacion = form.ubicacion.trim() || null;

        const { error } = await supabase.from("movimientos").insert(
          lineasSalida.map((l) => ({
            material_id: l.material_id,
            tipo: "salida" as const,
            cantidad: Number(l.cantidad),
            referencia_id: l.referencia_id,
            solicitante_id: form.solicitante_id ? Number(form.solicitante_id) : null,
            observaciones: form.observaciones || null,
            ubicacion,
            remision_numero: remisionNumero,
            area_proyecto: areaProyecto,
            centro_costo_texto: centroCostoTexto,
            motivo_salida: motivoSalida,
            tipo_movimiento: tipoMovimiento,
            ...(fotoUrl ? { foto: fotoUrl } : {}),
            ...(adjuntoUrl ? { adjunto: adjuntoUrl } : {}),
            ...(actaUrl ? { acta_entrega: actaUrl } : {}),
          }))
        );
        if (error) throw error;

        const solicitanteNombre = solicitantes.find((s) => String(s.id) === form.solicitante_id)?.nombre || "";
        const fechaEntrega = new Intl.DateTimeFormat("es-CO", {
          timeZone: "America/Bogota",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date());
        setUltimaRemision({
          numero: `REM-${String(remisionNumero).padStart(6, "0")}`,
          fechaEntrega,
          areaProyecto: areaProyecto ?? "",
          centroCosto: centroCostoTexto ?? "",
          solicitadoPor: solicitanteNombre,
          identificacion: "",
          destinoUbicacion: ubicacion ?? "",
          motivoSalida: motivoSalida ?? "",
          tipoMovimiento: form.tipo_movimiento,
          items: lineasSalida.map((l) => ({
            codigo: l.codigo,
            descripcion: l.descripcion,
            cantidad: money(Number(l.cantidad)),
            serieLote: l.referenciaCodigo ?? "—",
          })),
        });
      } else if (entradaMultiReferencia) {
        const { error } = await supabase.from("movimientos").insert(
          lineasReferencia.map((l) => ({
            material_id: Number(form.material_id),
            tipo: "entrada" as const,
            cantidad: Number(l.cantidad),
            referencia_id: l.referencia_id,
            solicitante_id: form.solicitante_id ? Number(form.solicitante_id) : null,
            observaciones: form.observaciones || null,
            ...(fotoUrl ? { foto: fotoUrl } : {}),
            ...(adjuntoUrl ? { adjunto: adjuntoUrl } : {}),
            ...(actaUrl ? { acta_entrega: actaUrl } : {}),
          }))
        );
        if (error) throw error;
        setUltimaRemision(null);
      } else {
        const { error } = await supabase.from("movimientos").insert({
          material_id: Number(form.material_id),
          tipo: form.tipo,
          cantidad: Number(form.cantidad),
          referencia_id: form.referencia_id ? Number(form.referencia_id) : null,
          solicitante_id: form.solicitante_id ? Number(form.solicitante_id) : null,
          observaciones: form.observaciones || null,
          ...(fotoUrl ? { foto: fotoUrl } : {}),
          ...(adjuntoUrl ? { adjunto: adjuntoUrl } : {}),
          ...(actaUrl ? { acta_entrega: actaUrl } : {}),
        });
        if (error) throw error;
        setUltimaRemision(null);
      }

      const totalLineasRef = lineasReferencia.length;
      const totalLineasSalida = lineasSalida.length;
      cerrarForm();
      await Promise.all([cargarMateriales(), cargarRecientes()]);
      setMensaje({
        texto: salidaMultiMaterial
          ? `Se registraron ${totalLineasSalida} salidas correctamente.`
          : entradaMultiReferencia
            ? `Se registraron ${totalLineasRef} entradas correctamente.`
            : "Movimiento registrado correctamente.",
        tipo: "ok",
      });
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : "Error al registrar el movimiento", tipo: "error" });
      setEnviando(false);
      return;
    }
    setEnviando(false);
  }

  return (
    <section className="view">
      <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
        <button type="button" className="btn-nuevo" onClick={() => abrirNuevo("entrada")}>
          + Registrar entrada
        </button>
        <button type="button" className="btn-nuevo danger" onClick={() => abrirNuevo("salida")}>
          + Registrar salida
        </button>
      </div>

      {!mostrarForm && mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {!mostrarForm && ultimaRemision && (
        <div className="aviso-remision">
          <span>
            Remisión <strong>{ultimaRemision.numero}</strong> lista ({ultimaRemision.items.length} material
            {ultimaRemision.items.length === 1 ? "" : "es"}).
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-secundario" onClick={() => abrirRemisionPdf(ultimaRemision)}>
              <Printer size={14} /> Ver / Imprimir
            </button>
          </div>
        </div>
      )}

      {mostrarForm && (
        <Modal
          titulo={form.tipo === "entrada" ? "Registrar entrada de material" : "Registrar salida de material"}
          onClose={cerrarForm}
          confirmarCierre={Boolean(
            form.material_id ||
              form.cantidad ||
              form.ubicacion.trim() ||
              foto ||
              adjunto ||
              actaEntrega ||
              nuevoSolicitante.trim() ||
              lineasReferencia.length > 0 ||
              lineasSalida.length > 0 ||
              form.area_proyecto.trim() ||
              form.centro_costo_texto.trim() ||
              form.motivo_salida.trim() ||
              form.tipo_movimiento
          )}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <ComboMaterial
              key={comboResetKey}
              materiales={materiales}
              materialId={form.material_id}
              onSeleccionar={seleccionarMaterial}
            />
            {salidaMultiMaterial ? (
              <>
                {materialSeleccionado?.maneja_referencias && (
                  <div>
                    <label>Referencia</label>
                    <select
                      value={form.referencia_id}
                      onChange={(e) => setForm({ ...form, referencia_id: e.target.value })}
                    >
                      <option value="">{cargandoReferencias ? "Cargando..." : "Selecciona una referencia"}</option>
                      {referenciasCandidatas.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigo}
                          {r.ubicacion ? ` — ${r.ubicacion}` : ""} (disponible: {r.stock_disponible})
                        </option>
                      ))}
                    </select>
                    {!cargandoReferencias && referenciasDelMaterial.length === 0 && (
                      <div className="stock-aviso" style={{ marginTop: 8 }}>
                        Este material no tiene ninguna referencia registrada todavía -- agrégalas editando el
                        material.
                      </div>
                    )}
                    {!cargandoReferencias && referenciasDelMaterial.length > 0 && referenciasCandidatas.length === 0 && (
                      <div className="stock-aviso" style={{ marginTop: 8 }}>
                        Tiene {referenciasDelMaterial.length} referencia(s) registrada(s), pero ninguna con stock
                        disponible para sacar -- registra primero una Entrada.
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label>Cantidad</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.cantidad}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                  />
                  {referenciaSeleccionada ? (
                    <div className="stock-aviso" style={{ marginTop: 6 }}>
                      Disponible en esta referencia: {referenciaSeleccionada.stock_disponible}
                    </div>
                  ) : (
                    materialSeleccionado && (
                      <div className="stock-aviso" style={{ marginTop: 6 }}>
                        Stock actual: {materialSeleccionado.stock_actual}
                      </div>
                    )
                  )}
                </div>
                <div className="full">
                  <button
                    type="button"
                    className="btn-secundario"
                    disabled={
                      !materialSeleccionado ||
                      !form.cantidad ||
                      (materialSeleccionado.maneja_referencias && !form.referencia_id)
                    }
                    onClick={agregarLineaSalida}
                  >
                    + Agregar a la salida
                  </button>
                </div>
                <div className="full">
                  {lineasSalida.length > 0 ? (
                    <div className="tags-lista">
                      {lineasSalida.map((l) => (
                        <span key={`${l.material_id}-${l.referencia_id ?? "x"}`} className="tag-chip">
                          {l.codigo}
                          {l.referenciaCodigo ? ` (${l.referenciaCodigo})` : ""} — {l.cantidad}
                          <button
                            type="button"
                            onClick={() => quitarLineaSalida(l.material_id, l.referencia_id)}
                            aria-label={`Quitar ${l.codigo}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="stock-aviso">Agrega al menos un material con su cantidad antes de registrar.</div>
                  )}
                </div>
              </>
            ) : entradaMultiReferencia ? (
              <div className="full">
                <label>Referencias</label>
                <div className="tags-input">
                  <select
                    value={form.referencia_id}
                    onChange={(e) => setForm({ ...form, referencia_id: e.target.value })}
                  >
                    <option value="">{cargandoReferencias ? "Cargando..." : "Selecciona una referencia"}</option>
                    {referenciasDelMaterial.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.codigo}
                        {r.ubicacion ? ` — ${r.ubicacion}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Cantidad"
                    value={form.cantidad}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-secundario"
                    disabled={!form.referencia_id || !form.cantidad}
                    onClick={agregarLineaReferencia}
                  >
                    + Agregar
                  </button>
                </div>
                {!cargandoReferencias && referenciasDelMaterial.length === 0 && (
                  <div className="stock-aviso" style={{ marginTop: 8 }}>
                    Este material no tiene ninguna referencia registrada todavía -- agrégalas editando el material.
                  </div>
                )}
                {lineasReferencia.length > 0 ? (
                  <div className="tags-lista" style={{ marginTop: 8 }}>
                    {lineasReferencia.map((l) => (
                      <span key={l.referencia_id} className="tag-chip">
                        {l.codigo} — {l.cantidad}
                        <button
                          type="button"
                          onClick={() => quitarLineaReferencia(l.referencia_id)}
                          aria-label={`Quitar ${l.codigo}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  !cargandoReferencias &&
                  referenciasDelMaterial.length > 0 && (
                    <div className="stock-aviso" style={{ marginTop: 8 }}>
                      Agrega al menos una referencia con su cantidad antes de registrar.
                    </div>
                  )
                )}
              </div>
            ) : (
              // Unico caso que llega aca: Entrada de un material SIN
              // referencias -- un solo campo de cantidad, sin carrito.
              <div>
                <label>Cantidad</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.cantidad}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                />
                {materialSeleccionado && (
                  <div className="stock-aviso" style={{ marginTop: 6 }}>
                    Stock actual: {materialSeleccionado.stock_actual}
                  </div>
                )}
              </div>
            )}
            {form.tipo === "salida" && (
              <div>
                <label>Nueva ubicación (opcional)</label>
                <input
                  type="text"
                  placeholder="Deja vacío si no cambia de sitio"
                  value={form.ubicacion}
                  onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                />
                <div className="stock-aviso" style={{ marginTop: 6 }}>
                  Se aplica a todos los materiales de esta salida. Déjalo vacío si ninguno cambia de sitio.
                </div>
              </div>
            )}
            {form.tipo === "salida" && (
              <div>
                <label>Área / Proyecto (opcional)</label>
                <input
                  type="text"
                  value={form.area_proyecto}
                  onChange={(e) => setForm({ ...form, area_proyecto: e.target.value })}
                />
              </div>
            )}
            {form.tipo === "salida" && (
              <div>
                <label>Centro de costo (opcional)</label>
                <input
                  type="text"
                  value={form.centro_costo_texto}
                  onChange={(e) => setForm({ ...form, centro_costo_texto: e.target.value })}
                />
              </div>
            )}
            <div>
              <label>Solicitante</label>
              <select value={form.solicitante_id} onChange={(e) => setForm({ ...form, solicitante_id: e.target.value })}>
                <option value="">Sin especificar</option>
                {solicitantes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <div className="tags-input" style={{ marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="¿No está en la lista? Escribe el nombre y agrégalo"
                  value={nuevoSolicitante}
                  onChange={(e) => setNuevoSolicitante(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secundario"
                  disabled={!nuevoSolicitante.trim() || creandoSolicitante}
                  onClick={agregarSolicitante}
                >
                  {creandoSolicitante ? "Agregando..." : "+ Agregar"}
                </button>
              </div>
            </div>
            <div className="full">
              <label>Observaciones</label>
              <input
                type="text"
                placeholder="Opcional"
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </div>
            {form.tipo === "salida" && (
              <div>
                <label>Motivo de salida (opcional)</label>
                <input
                  type="text"
                  value={form.motivo_salida}
                  onChange={(e) => setForm({ ...form, motivo_salida: e.target.value })}
                />
              </div>
            )}
            {form.tipo === "salida" && (
              <div>
                <label>Tipo de movimiento (opcional)</label>
                <select
                  value={form.tipo_movimiento}
                  onChange={(e) => setForm({ ...form, tipo_movimiento: e.target.value as TipoMovimientoRemision })}
                >
                  <option value="">Sin especificar</option>
                  {OPCIONES_TIPO_MOVIMIENTO.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label>Foto de evidencia (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label>{form.tipo === "salida" ? "Requisición" : "Soporte documental (opcional)"}</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                required={form.tipo === "salida"}
                onChange={(e) => setAdjunto(e.target.files?.[0] ?? null)}
              />
            </div>
            {form.tipo === "salida" && (
              <div>
                <label>ACTA DE ENTREGA (opcional)</label>
                <input type="file" accept="image/*" onChange={(e) => setActaEntrega(e.target.files?.[0] ?? null)} />
              </div>
            )}
            <button
              type="submit"
              disabled={
                enviando ||
                (entradaMultiReferencia && lineasReferencia.length === 0) ||
                (salidaMultiMaterial && lineasSalida.length === 0)
              }
            >
              {enviando ? "Registrando..." : form.tipo === "entrada" ? "Registrar entrada" : "Registrar salida"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarForm}>
              Cancelar
            </button>
          </form>
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </Modal>
      )}

      <PanelMovimientosRecientes movimientos={recientes} cargando={cargandoRecientes} error={errorRecientes} />
    </section>
  );
}
