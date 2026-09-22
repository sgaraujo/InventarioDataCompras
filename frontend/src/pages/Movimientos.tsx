import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../api/supabaseClient";
import { subirEvidencia } from "../api/storage";
import type { Material, MaterialReferenciaEstado, Solicitante, TipoMovimiento } from "../api/types";
import { Modal } from "../components/Modal";
import { ComboMaterial } from "../components/ComboMaterial";
import { PanelMovimientosRecientes } from "../components/PanelMovimientosRecientes";
import { useMovimientosRecientes } from "../hooks/useMovimientosRecientes";

const FORM_VACIO = {
  material_id: "",
  tipo: "entrada" as TipoMovimiento,
  cantidad: "",
  referencia_id: "",
  solicitante_id: "",
  observaciones: "",
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
    setMensaje(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setFoto(null);
    setAdjunto(null);
    setActaEntrega(null);
    setReferenciasDelMaterial([]);
    setMensaje(null);
  }

  const materialSeleccionado = materiales.find((m) => String(m.id) === form.material_id);
  const referenciaSeleccionada = referenciasDelMaterial.find((r) => String(r.id) === form.referencia_id);

  // Si el material elegido maneja referencias, hay que traer cuales tiene y
  // cuanto stock disponible tiene cada una para el selector de abajo. En
  // Entrada se puede elegir cualquiera (para sumarle mas stock); en Salida
  // solo las que ya tengan stock_disponible > 0 (filtrado en el render).
  async function seleccionarMaterial(id: string) {
    const mat = materiales.find((m) => String(m.id) === id);
    setForm((f) => ({ ...f, material_id: id, referencia_id: "" }));
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.material_id) {
      setMensaje({ texto: "Selecciona un material de la lista.", tipo: "error" });
      return;
    }
    if (materialSeleccionado?.maneja_referencias && !form.referencia_id) {
      setMensaje({ texto: "Selecciona cuál referencia se está moviendo.", tipo: "error" });
      return;
    }
    if (materialSeleccionado?.maneja_referencias && referenciaSeleccionada) {
      if (form.tipo === "salida" && Number(form.cantidad) > referenciaSeleccionada.stock_disponible) {
        setMensaje({
          texto: `No hay suficiente stock en "${referenciaSeleccionada.codigo}" (disponible: ${referenciaSeleccionada.stock_disponible}).`,
          tipo: "error",
        });
        return;
      }
    } else if (form.tipo === "salida" && materialSeleccionado && Number(form.cantidad) > materialSeleccionado.stock_actual) {
      setMensaje({ texto: `No hay suficiente stock (disponible: ${materialSeleccionado.stock_actual}).`, tipo: "error" });
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
      cerrarForm();
      await Promise.all([cargarMateriales(), cargarRecientes()]);
      setMensaje({ texto: "Movimiento registrado correctamente.", tipo: "ok" });
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

      {mostrarForm && (
        <Modal
          titulo={form.tipo === "entrada" ? "Registrar entrada de material" : "Registrar salida de material"}
          onClose={cerrarForm}
          confirmarCierre={Boolean(form.material_id || form.cantidad || foto || adjunto || actaEntrega)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <ComboMaterial materiales={materiales} materialId={form.material_id} onSeleccionar={seleccionarMaterial} />
            {materialSeleccionado?.maneja_referencias && (
              <div>
                <label>Referencia</label>
                <select
                  required
                  value={form.referencia_id}
                  onChange={(e) => setForm({ ...form, referencia_id: e.target.value })}
                >
                  <option value="">{cargandoReferencias ? "Cargando..." : "Selecciona una referencia"}</option>
                  {referenciasCandidatas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo}
                      {r.ubicacion ? ` — ${r.ubicacion}` : ""}
                      {form.tipo === "salida" ? ` (disponible: ${r.stock_disponible})` : ""}
                    </option>
                  ))}
                </select>
                {!cargandoReferencias && referenciasDelMaterial.length === 0 && (
                  <div className="stock-aviso" style={{ marginTop: 8 }}>
                    Este material no tiene ninguna referencia registrada todavía -- agrégalas editando el material.
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
                required
                value={form.cantidad}
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
            <div>
              <label>Foto de evidencia (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label>Soporte documental (opcional)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setAdjunto(e.target.files?.[0] ?? null)}
              />
            </div>
            {form.tipo === "salida" && (
              <div>
                <label>ACTA DE ENTREGA (opcional)</label>
                <input type="file" accept="image/*" onChange={(e) => setActaEntrega(e.target.files?.[0] ?? null)} />
              </div>
            )}
            <button type="submit" disabled={enviando}>
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
