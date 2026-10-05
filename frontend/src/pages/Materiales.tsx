import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { borrarEvidencia, subirEvidencia } from "../api/storage";
import type {
  CentroCosto,
  Empresa,
  Material,
  MaterialReferenciaDocumento,
  MaterialReferenciaEstado,
} from "../api/types";
import { esAdmin, money, puedeEditar } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, ImageOff, Layers, Camera, FileText, Paperclip } from "lucide-react";

const TAMANO_PAGINA = 25;

const FORM_VACIO = {
  id: null as number | null,
  empresa_id: "",
  centro_costo_id: "",
  descripcion: "",
  ubicacion: "",
  precio_unitario: "",
  maneja_referencias: false,
  activo: true,
};

interface ReferenciaForm {
  id?: number;
  codigo: string;
  ubicacion: string;
  // Ubicacion tal como vino de la base (solo referencias ya guardadas) --
  // para saber al guardar cuales cambiaron y actualizar solo esas.
  ubicacionOriginal?: string;
  foto?: string | null;
  // Foto elegida para una referencia nueva, se sube recien al guardar.
  archivo?: File | null;
}

export function Materiales() {
  const { usuario } = useAuth();
  const editable = puedeEditar(usuario);
  // El precio de adquisicion lo ve cualquiera, pero solo admin lo puede
  // cambiar (el trigger restringir_precio_a_admin() lo blinda igual del
  // lado de la base, esto es solo para la UI).
  const puedeEditarPrecio = esAdmin(usuario);

  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").toLowerCase();
  const empresaFiltro = searchParams.get("empresa_id") ?? "";
  const stockFiltro = searchParams.get("stock") ?? ""; // "" | "con" | "sin"

  const [materiales, setMateriales] = useState<Material[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [cargando, setCargando] = useState(true);

  const [form, setForm] = useState(FORM_VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const [nuevoCentroCosto, setNuevoCentroCosto] = useState("");
  const [creandoCentroCosto, setCreandoCentroCosto] = useState(false);
  const [referencias, setReferencias] = useState<ReferenciaForm[]>([]);
  const [nuevaRefCodigo, setNuevaRefCodigo] = useState("");
  const [nuevaRefUbicacion, setNuevaRefUbicacion] = useState("");
  const [nuevaRefFoto, setNuevaRefFoto] = useState<File | null>(null);
  const [editandoRefIndex, setEditandoRefIndex] = useState<number | null>(null);
  const [ubicacionEditada, setUbicacionEditada] = useState("");
  const nuevaRefFotoInputRef = useRef<HTMLInputElement>(null);
  const [subiendoFotoRefId, setSubiendoFotoRefId] = useState<number | null>(null);
  const [errorRef, setErrorRef] = useState<string | null>(null);
  const [documentosPorRef, setDocumentosPorRef] = useState<Record<number, MaterialReferenciaDocumento[]>>({});
  const [subiendoDocRefId, setSubiendoDocRefId] = useState<number | null>(null);
  const [confirmandoBorrarDoc, setConfirmandoBorrarDoc] = useState<MaterialReferenciaDocumento | null>(null);
  const [verReferenciasDe, setVerReferenciasDe] = useState<Material | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; nombre: string } | null>(null);
  const [referenciasEstado, setReferenciasEstado] = useState<MaterialReferenciaEstado[]>([]);
  const [cargandoReferenciasEstado, setCargandoReferenciasEstado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const editando = form.id !== null;
  const formInicialRef = useRef(FORM_VACIO);
  // Para materiales con referencias, materiales.precio_unitario no aplica
  // (cada referencia tiene el suyo) -- esto guarda la suma de los valores de
  // todas las referencias de cada material, para la columna "Valor total"
  // del listado. null = ninguna de sus referencias tiene precio todavia.
  const [valorReferenciasPorMaterial, setValorReferenciasPorMaterial] = useState<Record<number, number | null>>({});

  async function cargarMateriales() {
    setCargando(true);
    const { data, error } = await supabase
      .from("materiales")
      .select("*, empresas(nombre), centros_costo(nombre)")
      .order("id", { ascending: false });
    if (!error && data) {
      setMateriales(
        data.map((m) => ({
          ...m,
          empresa_nombre: (m.empresas as { nombre: string } | null)?.nombre ?? "—",
          centro_costo_nombre: (m.centros_costo as { nombre: string } | null)?.nombre ?? null,
        })) as Material[]
      );
    }
    setCargando(false);
  }

  async function cargarValorReferencias() {
    const { data } = await supabase.from("material_referencias_estado").select("material_id, valor_total");
    const acc: Record<number, number | null> = {};
    for (const r of (data ?? []) as { material_id: number; valor_total: number | null }[]) {
      if (r.valor_total == null) {
        if (!(r.material_id in acc)) acc[r.material_id] = null;
        continue;
      }
      acc[r.material_id] = (acc[r.material_id] ?? 0) + r.valor_total;
    }
    setValorReferenciasPorMaterial(acc);
  }

  useEffect(() => {
    cargarMateriales();
    cargarValorReferencias();
    supabase
      .from("empresas")
      .select("*")
      .order("nombre")
      .then(({ data }) => setEmpresas((data as Empresa[]) ?? []));
    supabase
      .from("centros_costo")
      .select("*")
      .order("nombre")
      .then(({ data }) => setCentrosCosto((data as CentroCosto[]) ?? []));
  }, []);

  const materialesFiltrados = materiales.filter((m) => {
    if (empresaFiltro && String(m.empresa_id) !== empresaFiltro) return false;
    if (q && !m.descripcion.toLowerCase().includes(q) && !m.codigo.toLowerCase().includes(q)) return false;
    if (stockFiltro === "con" && Number(m.stock_actual) <= 0) return false;
    if (stockFiltro === "sin" && Number(m.stock_actual) > 0) return false;
    return true;
  });

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    materialesFiltrados,
    TAMANO_PAGINA
  );

  function cambiarEmpresaFiltro(valor: string) {
    const next = new URLSearchParams(searchParams);
    if (valor) next.set("empresa_id", valor);
    else next.delete("empresa_id");
    setSearchParams(next, { replace: true });
  }

  function abrirNuevo() {
    setForm(FORM_VACIO);
    formInicialRef.current = FORM_VACIO;
    setFoto(null);
    setNuevoCentroCosto("");
    setReferencias([]);
    setNuevaRefCodigo("");
    setNuevaRefUbicacion("");
    limpiarNuevaRefFoto();
    setEditandoRefIndex(null);
    setMensaje(null);
    setMostrarForm(true);
  }

  async function editar(m: Material) {
    const datos = {
      id: m.id,
      empresa_id: String(m.empresa_id),
      centro_costo_id: m.centro_costo_id ? String(m.centro_costo_id) : "",
      descripcion: m.descripcion,
      ubicacion: m.ubicacion ?? "",
      precio_unitario: m.precio_unitario != null ? String(m.precio_unitario) : "",
      maneja_referencias: m.maneja_referencias,
      activo: m.activo,
    };
    setForm(datos);
    formInicialRef.current = datos;
    setFoto(null);
    setNuevoCentroCosto("");
    setNuevaRefCodigo("");
    setNuevaRefUbicacion("");
    limpiarNuevaRefFoto();
    setEditandoRefIndex(null);
    setMensaje(null);
    setMostrarForm(true);

    if (m.maneja_referencias) {
      const { data } = await supabase
        .from("material_referencias")
        .select("id, codigo, ubicacion, foto")
        .eq("material_id", m.id)
        .order("codigo");
      setReferencias(
        ((data as { id: number; codigo: string; ubicacion: string | null; foto: string | null }[]) ?? []).map((r) => ({
          ...r,
          ubicacion: r.ubicacion ?? "",
          ubicacionOriginal: r.ubicacion ?? "",
        }))
      );
    } else {
      setReferencias([]);
    }
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setFoto(null);
    setNuevoCentroCosto("");
    setReferencias([]);
    setNuevaRefCodigo("");
    setNuevaRefUbicacion("");
    limpiarNuevaRefFoto();
    setEditandoRefIndex(null);
    setMensaje(null);
  }

  function limpiarNuevaRefFoto() {
    setNuevaRefFoto(null);
    if (nuevaRefFotoInputRef.current) nuevaRefFotoInputRef.current.value = "";
  }

  function agregarReferencia() {
    const codigo = nuevaRefCodigo.trim();
    if (!codigo) return;
    if (referencias.some((r) => r.codigo.toLowerCase() === codigo.toLowerCase())) {
      setMensaje({ texto: `La referencia "${codigo}" ya está en la lista.`, tipo: "error" });
      return;
    }
    setReferencias((prev) => [...prev, { codigo, ubicacion: nuevaRefUbicacion.trim(), archivo: nuevaRefFoto }]);
    setNuevaRefCodigo("");
    setNuevaRefUbicacion("");
    limpiarNuevaRefFoto();
  }

  function empezarEditarUbicacion(index: number) {
    setEditandoRefIndex(index);
    setUbicacionEditada(referencias[index].ubicacion);
  }

  // Solo cambia la lista en memoria -- se guarda en la base con el resto del
  // formulario ("Guardar cambios").
  function aplicarUbicacionEditada() {
    if (editandoRefIndex === null) return;
    const ubicacion = ubicacionEditada.trim();
    setReferencias((prev) => prev.map((r, i) => (i === editandoRefIndex ? { ...r, ubicacion } : r)));
    setEditandoRefIndex(null);
  }

  // Solo se pueden quitar de la lista las referencias que todavia no se han
  // guardado (sin id) -- una vez guardada, borrarla es otra decision (podria
  // tener movimientos encima) y no la maneja este formulario.
  function quitarReferencia(index: number) {
    setReferencias((prev) => prev.filter((_, i) => i !== index));
    setEditandoRefIndex(null);
  }

  const centrosDeLaEmpresa = centrosCosto.filter((c) => String(c.empresa_id) === form.empresa_id);

  // Los centros de costo no vienen pre-cargados -- se van creando uno a uno
  // a medida que hacen falta, directo desde el formulario de material.
  async function agregarCentroCosto() {
    const nombre = nuevoCentroCosto.trim();
    if (!nombre || !form.empresa_id) return;
    setCreandoCentroCosto(true);
    const { data, error } = await supabase
      .from("centros_costo")
      .insert({ empresa_id: Number(form.empresa_id), nombre })
      .select()
      .single();
    setCreandoCentroCosto(false);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    setCentrosCosto((prev) => [...prev, data as CentroCosto]);
    setForm((f) => ({ ...f, centro_costo_id: String(data.id) }));
    setNuevoCentroCosto("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      let fotoUrl: string | undefined;
      if (foto) fotoUrl = await subirEvidencia("materiales", foto);

      const cuerpo = {
        empresa_id: Number(form.empresa_id),
        centro_costo_id: form.centro_costo_id ? Number(form.centro_costo_id) : null,
        descripcion: form.descripcion,
        ubicacion: form.ubicacion.trim() || null,
        // Si maneja referencias, el precio del material no aplica -- se
        // limpia aqui para que no quede un valor viejo sin usar (el total se
        // calcula sumando las referencias, ver cargarValorReferencias()).
        precio_unitario:
          form.maneja_referencias || form.precio_unitario.trim() === "" ? null : Number(form.precio_unitario),
        maneja_referencias: form.maneja_referencias,
        ...(fotoUrl ? { foto: fotoUrl } : {}),
        ...(editando ? { activo: form.activo } : {}),
      };

      let materialId = form.id;
      if (editando) {
        const { error } = await supabase.from("materiales").update(cuerpo).eq("id", form.id!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("materiales").insert(cuerpo).select("id").single();
        if (error) throw error;
        materialId = data.id;
      }

      // Solo las referencias nuevas (sin id todavia) hay que guardarlas --
      // las que ya venian de la base (editar) no se tocan aca.
      const nuevas = referencias.filter((r) => !r.id);
      if (form.maneja_referencias && nuevas.length > 0) {
        const fotosRefs = await Promise.all(
          nuevas.map((r) => (r.archivo ? subirEvidencia("referencias", r.archivo) : Promise.resolve(null)))
        );
        const { error: errorRefs } = await supabase.from("material_referencias").insert(
          nuevas.map((r, i) => ({
            material_id: materialId,
            codigo: r.codigo,
            ubicacion: r.ubicacion || null,
            foto: fotosRefs[i],
          }))
        );
        if (errorRefs) throw errorRefs;
      }

      const ubicacionesCambiadas = referencias.filter((r) => r.id && r.ubicacion !== r.ubicacionOriginal);
      if (form.maneja_referencias && ubicacionesCambiadas.length > 0) {
        const resultados = await Promise.all(
          ubicacionesCambiadas.map((r) =>
            supabase.from("material_referencias").update({ ubicacion: r.ubicacion || null }).eq("id", r.id!)
          )
        );
        const errorUbicacion = resultados.find((res) => res.error)?.error;
        if (errorUbicacion) throw errorUbicacion;
      }

      setMostrarForm(false);
      setForm(FORM_VACIO);
      setReferencias([]);
      await cargarMateriales();
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : "Error al guardar el material", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  }

  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState<Material | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Material | null>(null);

  async function desactivarMaterial(m: Material) {
    setConfirmandoDesactivar(null);
    await supabase.from("materiales").update({ activo: !m.activo }).eq("id", m.id);
    await cargarMateriales();
  }

  // Borra el material sin importar stock ni historial -- movimientos.
  // material_id queda en NULL solo (ON DELETE SET NULL, ver supabase/
  // migrations/0007_eliminar_material_conserva_historial.sql), asi que el
  // historial de entradas/salidas nunca se pierde, aunque el material ya no
  // exista (Historial/Dashboard usan la "foto" guardada en cada movimiento
  // para seguir mostrando que material era).
  async function eliminarMaterial(m: Material) {
    setConfirmandoEliminar(null);
    const { error } = await supabase.from("materiales").delete().eq("id", m.id);
    if (error) {
      setMensaje({ texto: error.message || "No se pudo eliminar el material", tipo: "error" });
      return;
    }
    setMensaje({ texto: `Se eliminó "${m.descripcion}" correctamente.`, tipo: "ok" });
    await cargarMateriales();
  }

  async function verReferencias(m: Material) {
    setVerReferenciasDe(m);
    setCargandoReferenciasEstado(true);
    const { data } = await supabase
      .from("material_referencias_estado")
      .select("*")
      .eq("material_id", m.id)
      .order("codigo");
    const refs = (data as MaterialReferenciaEstado[]) ?? [];
    setReferenciasEstado(refs);

    const porRef: Record<number, MaterialReferenciaDocumento[]> = {};
    if (refs.length > 0) {
      const { data: docs } = await supabase
        .from("material_referencia_documentos")
        .select("*")
        .in("referencia_id", refs.map((r) => r.id))
        .order("creado_en");
      for (const d of (docs as MaterialReferenciaDocumento[]) ?? []) {
        (porRef[d.referencia_id] ??= []).push(d);
      }
    }
    setDocumentosPorRef(porRef);
    setCargandoReferenciasEstado(false);
  }

  async function adjuntarDocumentoReferencia(ref: MaterialReferenciaEstado, archivo: File) {
    setSubiendoDocRefId(ref.id);
    setErrorRef(null);
    try {
      const url = await subirEvidencia("referencias", archivo);
      const { data, error } = await supabase
        .from("material_referencia_documentos")
        .insert({ referencia_id: ref.id, nombre: archivo.name, url })
        .select()
        .single();
      if (error) throw error;
      const doc = data as MaterialReferenciaDocumento;
      setDocumentosPorRef((prev) => ({ ...prev, [ref.id]: [...(prev[ref.id] ?? []), doc] }));
    } catch (err) {
      setErrorRef(err instanceof Error ? err.message : "No se pudo subir el documento");
    } finally {
      setSubiendoDocRefId(null);
    }
  }

  // Borra la fila y despues el archivo del bucket -- si falla lo segundo el
  // documento igual deja de verse, solo queda el archivo huerfano.
  async function borrarDocumentoReferencia(doc: MaterialReferenciaDocumento) {
    setConfirmandoBorrarDoc(null);
    setErrorRef(null);
    const { error } = await supabase.from("material_referencia_documentos").delete().eq("id", doc.id);
    if (error) {
      setErrorRef(error.message || "No se pudo eliminar el documento");
      return;
    }
    setDocumentosPorRef((prev) => ({
      ...prev,
      [doc.referencia_id]: (prev[doc.referencia_id] ?? []).filter((d) => d.id !== doc.id),
    }));
    borrarEvidencia(doc.url).catch(() => {});
  }

  // Adjunta (o reemplaza) la foto de una referencia ya guardada, directo
  // desde el listado de referencias -- no hace falta abrir "Editar".
  async function adjuntarFotoReferencia(ref: MaterialReferenciaEstado, archivo: File) {
    setSubiendoFotoRefId(ref.id);
    setErrorRef(null);
    try {
      const url = await subirEvidencia("referencias", archivo);
      const { error } = await supabase.from("material_referencias").update({ foto: url }).eq("id", ref.id);
      if (error) throw error;
      setReferenciasEstado((prev) => prev.map((r) => (r.id === ref.id ? { ...r, foto: url } : r)));
    } catch (err) {
      setErrorRef(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendoFotoRefId(null);
    }
  }

  // Solo llega a pintarse si puedeEditarPrecio es true, pero el trigger
  // restringir_precio_a_admin() igual blinda esto del lado de la base.
  async function actualizarPrecioReferencia(ref: MaterialReferenciaEstado, valorTexto: string) {
    const precio = valorTexto.trim() === "" ? null : Number(valorTexto);
    if (precio !== null && (Number.isNaN(precio) || precio < 0)) return;
    if (precio === ref.precio_unitario) return;
    const { error } = await supabase.from("material_referencias").update({ precio_unitario: precio }).eq("id", ref.id);
    if (error) {
      setErrorRef(error.message);
      return;
    }
    setReferenciasEstado((prev) =>
      prev.map((r) =>
        r.id === ref.id
          ? { ...r, precio_unitario: precio, valor_total: precio != null ? precio * r.stock_disponible : null }
          : r
      )
    );
    cargarValorReferencias();
  }

  return (
    <section className="view">
      {editable && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
            + Nuevo material
          </button>
        </div>
      )}

      <div className="filtros-mov">
        <div>
          <label>Empresa</label>
          <select value={empresaFiltro} onChange={(e) => cambiarEmpresaFiltro(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Existencias</label>
          <select
            value={stockFiltro}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("stock", e.target.value);
              else next.delete("stock");
              setSearchParams(next, { replace: true });
            }}
          >
            <option value="">Todas</option>
            <option value="con">Con existencias</option>
            <option value="sin">Sin existencias</option>
          </select>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <label>Buscar</label>
          <input
            type="text"
            style={{ width: "100%" }}
            placeholder="Buscar por descripción o código..."
            value={searchParams.get("q") ?? ""}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("q", e.target.value);
              else next.delete("q");
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
      </div>

      {editable && mostrarForm && (
        <Modal
          titulo={editando ? `Editar material: ${form.descripcion}` : "Nuevo material"}
          onClose={cerrarForm}
          confirmarCierre={
            JSON.stringify(form) !== JSON.stringify(formInicialRef.current) ||
            Boolean(foto) ||
            nuevoCentroCosto.trim() !== "" ||
            referencias.some((r) => !r.id || r.ubicacion !== r.ubicacionOriginal) ||
            editandoRefIndex !== null ||
            nuevaRefCodigo.trim() !== "" ||
            nuevaRefUbicacion.trim() !== "" ||
            Boolean(nuevaRefFoto)
          }
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <div>
              <label>Empresa</label>
              <select
                required
                value={form.empresa_id}
                onChange={(e) => setForm({ ...form, empresa_id: e.target.value, centro_costo_id: "" })}
              >
                <option value="">Selecciona una empresa</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Centro de costo</label>
              <select
                value={form.centro_costo_id}
                disabled={!form.empresa_id}
                onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })}
              >
                <option value="">Sin asignar</option>
                {centrosDeLaEmpresa.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.nombre}
                  </option>
                ))}
              </select>
              {form.empresa_id && (
                <div className="tags-input" style={{ marginTop: 6 }}>
                  <input
                    type="text"
                    placeholder="¿No está en la lista? Escribe el nombre y agrégalo"
                    value={nuevoCentroCosto}
                    onChange={(e) => setNuevoCentroCosto(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secundario"
                    disabled={!nuevoCentroCosto.trim() || creandoCentroCosto}
                    onClick={agregarCentroCosto}
                  >
                    {creandoCentroCosto ? "Agregando..." : "+ Agregar"}
                  </button>
                </div>
              )}
            </div>
            <div className="full">
              <label>Descripción</label>
              <input
                type="text"
                required
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div className="full">
              <label>Ubicación</label>
              <input
                type="text"
                placeholder="Ej. Bodega 2, estante B3"
                value={form.ubicacion}
                onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              />
            </div>
            {!form.maneja_referencias && (
              <div>
                <label>Precio unitario (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Precio de adquisición por unidad"
                  value={form.precio_unitario}
                  disabled={!puedeEditarPrecio}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })}
                />
                {!puedeEditarPrecio && (
                  <div className="stock-aviso" style={{ marginTop: 6 }}>
                    Solo un administrador puede cambiar el precio.
                  </div>
                )}
              </div>
            )}
            <div className="full">
              <div className="checkbox-campo">
                <input
                  type="checkbox"
                  id="maneja-referencias"
                  checked={form.maneja_referencias}
                  onChange={(e) => setForm({ ...form, maneja_referencias: e.target.checked })}
                />
                <label htmlFor="maneja-referencias" style={{ marginBottom: 0 }}>
                  Este material contiene número de serial
                </label>
              </div>
              {form.maneja_referencias && (
                <div style={{ marginTop: 10 }}>
                  <div className="stock-aviso" style={{ marginBottom: 8 }}>
                    El precio se pone por cada referencia (en "Ver detalle"), no aquí -- cada unidad puede haber
                    costado distinto.
                  </div>
                  <div className="tags-input">
                    <input
                      type="text"
                      placeholder="Código de referencia"
                      value={nuevaRefCodigo}
                      onChange={(e) => setNuevaRefCodigo(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Ubicación de esta referencia (opcional)"
                      value={nuevaRefUbicacion}
                      onChange={(e) => setNuevaRefUbicacion(e.target.value)}
                    />
                    <input
                      ref={nuevaRefFotoInputRef}
                      type="file"
                      accept="image/*"
                      title="Foto de esta referencia (opcional)"
                      onChange={(e) => setNuevaRefFoto(e.target.files?.[0] ?? null)}
                    />
                    <button type="button" className="btn-secundario" disabled={!nuevaRefCodigo.trim()} onClick={agregarReferencia}>
                      + Agregar
                    </button>
                  </div>
                  {referencias.length > 0 ? (
                    <div className="tags-lista" style={{ marginTop: 8 }}>
                      {referencias.map((r, i) =>
                        editandoRefIndex === i ? (
                          <span key={r.id ?? `${r.codigo}-${i}`} className="tag-chip tag-chip--editando">
                            {r.codigo} —
                            <input
                              type="text"
                              autoFocus
                              spellCheck={false}
                              placeholder="Ubicación"
                              value={ubicacionEditada}
                              onChange={(e) => setUbicacionEditada(e.target.value)}
                              onKeyDown={(e) => {
                                // Enter no debe enviar el formulario entero, solo aplicar este cambio.
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  aplicarUbicacionEditada();
                                } else if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setEditandoRefIndex(null);
                                }
                              }}
                            />
                            <button type="button" onClick={aplicarUbicacionEditada} aria-label="Aplicar ubicación">
                              ✓
                            </button>
                            <button type="button" onClick={() => setEditandoRefIndex(null)} aria-label="Cancelar">
                              ×
                            </button>
                          </span>
                        ) : (
                          <span key={r.id ?? `${r.codigo}-${i}`} className="tag-chip">
                            <button
                              type="button"
                              className="tag-chip__editar"
                              onClick={() => empezarEditarUbicacion(i)}
                              title="Editar ubicación"
                            >
                              {r.codigo}
                              {r.ubicacion ? ` — ${r.ubicacion}` : ""}
                              <Pencil size={11} />
                            </button>
                            {(r.archivo || r.foto) && <Camera size={12} aria-label="Con foto" />}
                            {!r.id && (
                              <button type="button" onClick={() => quitarReferencia(i)} aria-label={`Quitar ${r.codigo}`}>
                                ×
                              </button>
                            )}
                          </span>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="stock-aviso">Todavía no has agregado ninguna referencia.</div>
                  )}
                </div>
              )}
            </div>
            <div className="full">
              <label>Foto del material (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
            {editando && (
              <div>
                <label>Estado</label>
                <select value={String(form.activo)} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            )}
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear material"}
            </button>
            <button type="button" className="btn-secundario" onClick={cerrarForm}>
              Cancelar
            </button>
          </form>
          {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
        </Modal>
      )}

      <div className="panel">
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Empresa</th>
                <th>Centro de costo</th>
                <th>Ubicación</th>
                <th>Stock actual</th>
                <th>Precio unit.</th>
                <th>Valor total</th>
                <th>Estado</th>
                {editable && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={editable ? 11 : 10} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 11 : 10} className="empty-state">
                    No se encontraron materiales con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.foto ? (
                        <button
                          type="button"
                          onClick={() => setFotoAmpliada({ url: m.foto!, nombre: m.descripcion })}
                          title="Ver foto"
                          style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                        >
                          <img
                            src={m.foto}
                            alt={m.descripcion}
                            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                          />
                        </button>
                      ) : (
                        <ImageOff size={18} color="var(--text-muted)" />
                      )}
                    </td>
                    <td>{m.codigo}</td>
                    <td>
                      {m.maneja_referencias ? (
                        <a href="#" className="link-detalle" onClick={(e) => { e.preventDefault(); verReferencias(m); }} title="Ver referencias">
                          {m.descripcion}
                          <Layers size={14} />
                        </a>
                      ) : (
                        m.descripcion
                      )}{" "}
                      {!m.activo && <span className="badge sin_existencias">Inactivo</span>}
                    </td>
                    <td>{m.empresa_nombre}</td>
                    <td>{m.centro_costo_nombre || "—"}</td>
                    <td>{m.ubicacion || "—"}</td>
                    <td>{money(m.stock_actual)}</td>
                    {m.maneja_referencias ? (
                      <>
                        <td>Varios</td>
                        <td>
                          {valorReferenciasPorMaterial[m.id] != null
                            ? `$${money(valorReferenciasPorMaterial[m.id]!)}`
                            : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{m.precio_unitario != null ? `$${money(m.precio_unitario)}` : "—"}</td>
                        <td>{m.precio_unitario != null ? `$${money(m.precio_unitario * m.stock_actual)}` : "—"}</td>
                      </>
                    )}
                    <td>
                      <span className={`badge ${m.stock_actual > 0 ? "ok" : "sin_existencias"}`}>
                        {m.stock_actual > 0 ? "Con stock" : "Sin existencias"}
                      </span>
                    </td>
                    {editable && (
                      <td>
                        <div className="acciones-solicitud">
                          <button type="button" className="btn-editar" onClick={() => editar(m)}>
                            <Pencil size={14} /> Editar
                          </button>
                          <button type="button" className="btn-rechazar" onClick={() => setConfirmandoDesactivar(m)}>
                            {m.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            className="btn-rechazar"
                            onClick={() => setConfirmandoEliminar(m)}
                            title="Eliminar material"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    )}
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
          etiqueta="materiales"
          onCambiarPagina={irAPagina}
        />
      </div>

      {confirmandoDesactivar && (
        <ConfirmDialog
          titulo={`¿${confirmandoDesactivar.activo ? "Desactivar" : "Activar"} "${confirmandoDesactivar.descripcion}"?`}
          descripcion="Los materiales inactivos no se pueden usar en nuevos movimientos."
          onConfirmar={() => desactivarMaterial(confirmandoDesactivar)}
          onCancelar={() => setConfirmandoDesactivar(null)}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={`¿Eliminar "${confirmandoEliminar.descripcion}"?`}
          descripcion="Esta acción no se puede deshacer. Su historial de movimientos (entradas, salidas, fotos, soportes) no se borra -- sigue disponible en Historial."
          onConfirmar={() => eliminarMaterial(confirmandoEliminar)}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}

      {/* Mientras se ve una foto ampliada o se confirma borrar un documento,
          el listado se oculta (no se apilan dos modales) y vuelve a aparecer
          al cerrar. */}
      {verReferenciasDe && !fotoAmpliada && !confirmandoBorrarDoc && (
        <Modal
          titulo={`Referencias de "${verReferenciasDe.descripcion}"`}
          ancho
          onClose={() => {
            setVerReferenciasDe(null);
            setErrorRef(null);
          }}
        >
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Código</th>
                  <th>Ubicación</th>
                  <th>Disponible</th>
                  <th>Precio</th>
                  <th>Total</th>
                  <th>Documentos</th>
                  {editable && <th></th>}
                </tr>
              </thead>
              <tbody>
                {cargandoReferenciasEstado ? (
                  <tr>
                    <td colSpan={editable ? 8 : 7} className="empty-state">
                      Cargando...
                    </td>
                  </tr>
                ) : referenciasEstado.length === 0 ? (
                  <tr>
                    <td colSpan={editable ? 8 : 7} className="empty-state">
                      Este material todavía no tiene referencias cargadas.
                    </td>
                  </tr>
                ) : (
                  referenciasEstado.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.foto ? (
                          <button
                            type="button"
                            onClick={() => setFotoAmpliada({ url: r.foto!, nombre: `${verReferenciasDe.descripcion} — ${r.codigo}` })}
                            title="Ver foto"
                            style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                          >
                            <img
                              src={r.foto}
                              alt={r.codigo}
                              style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                            />
                          </button>
                        ) : (
                          <ImageOff size={18} color="var(--text-muted)" />
                        )}
                      </td>
                      <td>{r.codigo}</td>
                      <td>{r.ubicacion || "—"}</td>
                      <td>
                        <span className={`badge ${r.stock_disponible > 0 ? "ok" : "sin_existencias"}`}>
                          {money(r.stock_disponible)}
                        </span>
                      </td>
                      <td>
                        {puedeEditarPrecio ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            key={r.id}
                            defaultValue={r.precio_unitario ?? ""}
                            placeholder="—"
                            style={{ width: 78 }}
                            onWheel={(e) => e.currentTarget.blur()}
                            onBlur={(e) => actualizarPrecioReferencia(r, e.target.value)}
                          />
                        ) : r.precio_unitario != null ? (
                          `$${money(r.precio_unitario)}`
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{r.valor_total != null ? `$${money(r.valor_total)}` : "—"}</td>
                      <td>
                        {(documentosPorRef[r.id] ?? []).length === 0 ? (
                          "—"
                        ) : (
                          <div className="documentos-referencia">
                            {documentosPorRef[r.id].map((d) => (
                              <span key={d.id} className="documento-referencia">
                                <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.nombre}>
                                  <FileText size={14} />
                                  <span>{d.nombre}</span>
                                </a>
                                {editable && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmandoBorrarDoc(d)}
                                    aria-label={`Eliminar ${d.nombre}`}
                                    title="Eliminar documento"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {editable && (
                        <td>
                          <div className="acciones-solicitud">
                            <label className="btn-editar" style={{ marginBottom: 0 }}>
                              <Camera size={14} />
                              {subiendoFotoRefId === r.id ? "Subiendo..." : r.foto ? "Cambiar foto" : "Adjuntar foto"}
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                disabled={subiendoFotoRefId !== null}
                                onChange={(e) => {
                                  const archivo = e.target.files?.[0];
                                  e.target.value = "";
                                  if (archivo) adjuntarFotoReferencia(r, archivo);
                                }}
                              />
                            </label>
                            <label className="btn-editar" style={{ marginBottom: 0 }}>
                              <Paperclip size={14} />
                              {subiendoDocRefId === r.id ? "Subiendo..." : "Adjuntar documento"}
                              <input
                                type="file"
                                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                                hidden
                                disabled={subiendoDocRefId !== null}
                                onChange={(e) => {
                                  const archivo = e.target.files?.[0];
                                  e.target.value = "";
                                  if (archivo) adjuntarDocumentoReferencia(r, archivo);
                                }}
                              />
                            </label>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {errorRef && <div className="mensaje-form error">{errorRef}</div>}
        </Modal>
      )}

      {confirmandoBorrarDoc && (
        <ConfirmDialog
          titulo={`¿Eliminar "${confirmandoBorrarDoc.nombre}"?`}
          descripcion="El documento se borra de esta referencia y no se puede recuperar."
          onConfirmar={() => borrarDocumentoReferencia(confirmandoBorrarDoc)}
          onCancelar={() => setConfirmandoBorrarDoc(null)}
        />
      )}

      {fotoAmpliada && (
        <Modal titulo={fotoAmpliada.nombre} onClose={() => setFotoAmpliada(null)}>
          <img
            src={fotoAmpliada.url}
            alt={fotoAmpliada.nombre}
            style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
          />
        </Modal>
      )}
    </section>
  );
}
