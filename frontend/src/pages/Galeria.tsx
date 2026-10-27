import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Folder, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "../api/supabaseClient";
import { borrarEvidencia, subirEvidencia } from "../api/storage";
import type { GaleriaCarpeta, GaleriaFoto } from "../api/types";
import { esAdmin } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";

// Galeria de registros fotograficos de salidas/envios de material. Carpetas
// con nombre libre, opcionalmente asociadas a una remision (REM-xxxxxx).
// Cualquier usuario activo crea/renombra carpetas y sube fotos; solo admin
// borra (ver RLS en supabase/migrations/0026_galeria.sql).
//
// La carpeta abierta vive en la URL (?carpeta=12) y el filtro por remision
// tambien (?remision=34, viene del detalle de una salida en Historial) para
// que recargar o compartir el enlace mantenga el mismo lugar.

function textoRemision(n: number): string {
  return `REM-${String(n).padStart(6, "0")}`;
}

// Acepta "34", "000034" o "REM-000034".
function parsearRemision(texto: string): number | null {
  const limpio = texto.trim().toUpperCase().replace(/^REM-?/, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

type Mensaje = { texto: string; tipo: "ok" | "error" } | null;

export function Galeria() {
  const { usuario } = useAuth();
  const puedeBorrar = esAdmin(usuario);
  const [searchParams, setSearchParams] = useSearchParams();
  const carpetaId = searchParams.get("carpeta") ? Number(searchParams.get("carpeta")) : null;
  const remisionFiltro = searchParams.get("remision") ? Number(searchParams.get("remision")) : null;

  const [carpetas, setCarpetas] = useState<GaleriaCarpeta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState<Mensaje>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [remision, setRemision] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Buscador para asociar la remision actual (?remision=X, viene de
  // Historial) a una carpeta YA existente, en vez de obligar a crear una
  // nueva cada vez -- ver discusion 2026-10-27.
  const [mostrarAsociar, setMostrarAsociar] = useState(false);
  const [busquedaAsociar, setBusquedaAsociar] = useState("");
  const [asociando, setAsociando] = useState<number | null>(null);

  async function cargarCarpetas() {
    setCargando(true);
    const { data, error } = await supabase
      .from("galeria_carpetas")
      .select("id, nombre, creado_en, galeria_fotos(count), galeria_carpeta_remisiones(remision_numero)")
      .order("creado_en", { ascending: false });
    if (error) setMensaje({ texto: error.message, tipo: "error" });
    type Fila = {
      id: number;
      nombre: string;
      creado_en: string;
      galeria_fotos: { count: number }[];
      galeria_carpeta_remisiones: { remision_numero: number }[];
    };
    setCarpetas(
      ((data as Fila[] | null) ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        creado_en: c.creado_en,
        total_fotos: c.galeria_fotos[0]?.count ?? 0,
        remisiones: c.galeria_carpeta_remisiones.map((r) => r.remision_numero).sort((a, b) => a - b),
      }))
    );
    setCargando(false);
  }

  useEffect(() => {
    cargarCarpetas();
  }, []);

  function abrirCarpeta(id: number | null) {
    const next = new URLSearchParams(searchParams);
    if (id == null) next.delete("carpeta");
    else next.set("carpeta", String(id));
    setSearchParams(next);
    setMensaje(null);
  }

  function quitarFiltroRemision() {
    const next = new URLSearchParams(searchParams);
    next.delete("remision");
    setSearchParams(next, { replace: true });
  }

  function cerrarForm() {
    setMostrarForm(false);
    setNombre("");
    setRemision("");
  }

  // Valida que de verdad exista una salida con ese numero antes de dejar
  // asociarla a una carpeta (entradas tambien guardan un numero de lote en
  // remision_numero, ver Movimientos.tsx, por eso se valida contra salidas
  // solamente).
  async function existeRemisionDeSalida(remisionNumero: number): Promise<boolean> {
    const { count, error } = await supabase
      .from("movimientos")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "salida")
      .eq("remision_numero", remisionNumero);
    if (error) throw error;
    return Boolean(count);
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const remisionNumero = parsearRemision(remision);
    if (Number.isNaN(remisionNumero)) {
      setMensaje({ texto: "El número de remisión no es válido (ej. REM-000034 o 34).", tipo: "error" });
      return;
    }
    setGuardando(true);
    try {
      if (remisionNumero != null && !(await existeRemisionDeSalida(remisionNumero))) {
        setMensaje({ texto: `No existe una salida con la remisión ${textoRemision(remisionNumero)}.`, tipo: "error" });
        return;
      }
      const { data, error } = await supabase.from("galeria_carpetas").insert({ nombre: nombre.trim() }).select("id").single();
      if (error) throw error;
      const nuevaId = (data as { id: number }).id;
      if (remisionNumero != null) {
        const { error: errorLink } = await supabase
          .from("galeria_carpeta_remisiones")
          .insert({ carpeta_id: nuevaId, remision_numero: remisionNumero });
        if (errorLink) throw errorLink;
      }
      cerrarForm();
      await cargarCarpetas();
      abrirCarpeta(nuevaId);
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : "No se pudo crear la carpeta", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  }

  // Deja la carpeta ya existente elegida desde el buscador (ver mas abajo)
  // asociada a la remision con la que se llego filtrando desde Historial.
  async function asociarCarpetaExistente(carpetaId: number) {
    if (remisionFiltro == null) return;
    setAsociando(carpetaId);
    setMensaje(null);
    const { error } = await supabase
      .from("galeria_carpeta_remisiones")
      .insert({ carpeta_id: carpetaId, remision_numero: remisionFiltro });
    setAsociando(null);
    if (error) {
      setMensaje({
        texto: error.code === "23505" ? "Esa carpeta ya está asociada a esta remisión." : error.message,
        tipo: "error",
      });
      return;
    }
    setMostrarAsociar(false);
    setBusquedaAsociar("");
    await cargarCarpetas();
    abrirCarpeta(carpetaId);
  }

  const carpetaAbierta = carpetaId != null ? carpetas.find((c) => c.id === carpetaId) ?? null : null;

  if (carpetaId != null && carpetaAbierta) {
    return (
      <CarpetaDetalle
        carpeta={carpetaAbierta}
        puedeBorrar={puedeBorrar}
        onVolver={() => abrirCarpeta(null)}
        onCambio={cargarCarpetas}
      />
    );
  }

  const termino = busqueda.trim().toLowerCase();
  const visibles = carpetas.filter((c) => {
    if (remisionFiltro != null && !c.remisiones.includes(remisionFiltro)) return false;
    if (!termino) return true;
    return (
      c.nombre.toLowerCase().includes(termino) ||
      c.remisiones.some((r) => textoRemision(r).toLowerCase().includes(termino))
    );
  });

  return (
    <section className="view">
      <div className="galeria-toolbar">
        {!mostrarForm && !mostrarAsociar && (
          <button
            type="button"
            className="btn-nuevo"
            onClick={() => {
              setMostrarForm(true);
              setRemision(remisionFiltro != null ? textoRemision(remisionFiltro) : "");
              setMensaje(null);
            }}
          >
            + Nueva carpeta
          </button>
        )}
        {remisionFiltro != null && !mostrarForm && !mostrarAsociar && (
          <button
            type="button"
            className="btn-secundario"
            onClick={() => {
              setMostrarAsociar(true);
              setBusquedaAsociar("");
              setMensaje(null);
            }}
          >
            Asociar con una carpeta existente
          </button>
        )}
        <input
          type="search"
          className="galeria-buscar"
          placeholder="Buscar por nombre o remisión"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {mostrarAsociar && (
        <div className="panel panel--form">
          <h2>Asociar la remisión {remisionFiltro != null ? textoRemision(remisionFiltro) : ""} con una carpeta existente</h2>
          <input
            type="search"
            autoFocus
            placeholder="Buscar carpeta por nombre..."
            value={busquedaAsociar}
            onChange={(e) => setBusquedaAsociar(e.target.value)}
          />
          <div className="galeria-carpetas" style={{ marginTop: 12 }}>
            {carpetas.length === 0 ? (
              <div className="empty-state">No hay ninguna carpeta creada todavía.</div>
            ) : (
              carpetas
                .filter((c) => c.nombre.toLowerCase().includes(busquedaAsociar.trim().toLowerCase()))
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="galeria-carpeta"
                    disabled={asociando === c.id}
                    onClick={() => asociarCarpetaExistente(c.id)}
                  >
                    <Folder className="galeria-carpeta__icono" size={34} />
                    <span className="galeria-carpeta__nombre">{c.nombre}</span>
                    <span className="galeria-carpeta__meta">
                      {c.total_fotos} foto{c.total_fotos === 1 ? "" : "s"}
                      {c.remisiones.length > 0 ? ` · ${c.remisiones.length} remisión(es)` : ""}
                    </span>
                  </button>
                ))
            )}
          </div>
          <div className="full galeria-form-acciones" style={{ marginTop: 12 }}>
            <button type="button" className="btn-secundario" onClick={() => setMostrarAsociar(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mostrarForm && (
        <div className="panel panel--form">
          <h2>Nueva carpeta</h2>
          <form className="form-grid" onSubmit={handleCrear}>
            <div className="full">
              <label htmlFor="galeria-nombre">Nombre de la carpeta</label>
              <input
                id="galeria-nombre"
                type="text"
                required
                autoFocus
                maxLength={120}
                placeholder="Ej. Envío OTDR a Metricom - octubre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="full">
              <label htmlFor="galeria-remision">Remisión asociada (opcional)</label>
              <input
                id="galeria-remision"
                type="text"
                placeholder="Ej. REM-000034"
                value={remision}
                onChange={(e) => setRemision(e.target.value)}
              />
              <span className="texto-ayuda">Sirve para encontrar las fotos desde el detalle de la salida en Historial.</span>
            </div>
            <div className="full galeria-form-acciones">
              <button type="submit" disabled={guardando || !nombre.trim()}>
                {guardando ? "Guardando..." : "Crear carpeta"}
              </button>
              <button type="button" className="btn-secundario" onClick={cerrarForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {remisionFiltro != null && (
        <div className="galeria-filtro">
          Mostrando carpetas de la remisión <strong>{textoRemision(remisionFiltro)}</strong>
          <button type="button" onClick={quitarFiltroRemision} aria-label="Quitar filtro">
            <X size={14} />
          </button>
        </div>
      )}

      {cargando ? (
        <div className="panel empty-state">Cargando...</div>
      ) : carpetaId != null ? (
        <div className="panel empty-state">
          La carpeta no existe o fue eliminada.{" "}
          <button type="button" className="btn-secundario" onClick={() => abrirCarpeta(null)}>
            Volver a la Galería
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <div className="panel empty-state">
          {carpetas.length === 0
            ? "Todavía no hay carpetas. Crea la primera con “+ Nueva carpeta”."
            : "Ninguna carpeta coincide con la búsqueda."}
        </div>
      ) : (
        <div className="galeria-carpetas">
          {visibles.map((c) => (
            <button key={c.id} type="button" className="galeria-carpeta" onClick={() => abrirCarpeta(c.id)}>
              <Folder className="galeria-carpeta__icono" size={34} />
              <span className="galeria-carpeta__nombre">{c.nombre}</span>
              <span className="galeria-carpeta__meta">
                {c.total_fotos} foto{c.total_fotos === 1 ? "" : "s"} ·{" "}
                {new Date(c.creado_en).toLocaleDateString("es-CO")}
              </span>
              {c.remisiones.length > 0 && (
                <span className="galeria-carpeta__remision">{c.remisiones.map(textoRemision).join(", ")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CarpetaDetalle({
  carpeta,
  puedeBorrar,
  onVolver,
  onCambio,
}: {
  carpeta: GaleriaCarpeta;
  puedeBorrar: boolean;
  onVolver: () => void;
  onCambio: () => Promise<void>;
}) {
  const [fotos, setFotos] = useState<GaleriaFoto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState<{ hechas: number; total: number } | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState(carpeta.nombre);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [confirmarFoto, setConfirmarFoto] = useState<GaleriaFoto | null>(null);
  const [confirmarCarpeta, setConfirmarCarpeta] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Remisiones asociadas a esta carpeta -- copia local editable, se
  // resincroniza si carpeta.remisiones cambia por fuera (ej. onCambio tras
  // subir una foto).
  const [remisiones, setRemisiones] = useState<number[]>(carpeta.remisiones);
  useEffect(() => {
    setRemisiones(carpeta.remisiones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpeta.remisiones.join(",")]);
  const [agregandoRemision, setAgregandoRemision] = useState(false);
  const [textoRemisionNueva, setTextoRemisionNueva] = useState("");
  const [guardandoRemision, setGuardandoRemision] = useState(false);

  async function agregarRemision(e: FormEvent) {
    e.preventDefault();
    const n = parsearRemision(textoRemisionNueva);
    if (n == null || Number.isNaN(n)) {
      setMensaje({ texto: "Número de remisión no válido (ej. REM-000034 o 34).", tipo: "error" });
      return;
    }
    setGuardandoRemision(true);
    const { count, error: errorCheck } = await supabase
      .from("movimientos")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "salida")
      .eq("remision_numero", n);
    if (errorCheck || !count) {
      setGuardandoRemision(false);
      setMensaje({ texto: `No existe una salida con la remisión ${textoRemision(n)}.`, tipo: "error" });
      return;
    }
    const { error } = await supabase
      .from("galeria_carpeta_remisiones")
      .insert({ carpeta_id: carpeta.id, remision_numero: n });
    setGuardandoRemision(false);
    if (error) {
      setMensaje({
        texto: error.code === "23505" ? "Esa remisión ya está asociada a esta carpeta." : error.message,
        tipo: "error",
      });
      return;
    }
    setRemisiones((prev) => [...prev, n].sort((a, b) => a - b));
    setTextoRemisionNueva("");
    setAgregandoRemision(false);
    await onCambio();
  }

  async function quitarRemision(n: number) {
    const { error } = await supabase
      .from("galeria_carpeta_remisiones")
      .delete()
      .eq("carpeta_id", carpeta.id)
      .eq("remision_numero", n);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    setRemisiones((prev) => prev.filter((r) => r !== n));
    await onCambio();
  }

  async function cargarFotos() {
    setCargando(true);
    const { data, error } = await supabase
      .from("galeria_fotos")
      .select("id, carpeta_id, url, nombre_archivo, creado_en")
      .eq("carpeta_id", carpeta.id)
      .order("creado_en", { ascending: true });
    if (error) setMensaje({ texto: error.message, tipo: "error" });
    setFotos((data as GaleriaFoto[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargarFotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpeta.id]);

  async function subirFotos(archivos: File[]) {
    const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
    if (imagenes.length === 0) return;
    setMensaje(null);
    setSubiendo({ hechas: 0, total: imagenes.length });
    const fallidas: string[] = [];
    // Una por una para mostrar avance y que un archivo con problema no
    // tumbe a los demas.
    for (const archivo of imagenes) {
      try {
        const url = await subirEvidencia("galeria", archivo);
        const { error } = await supabase
          .from("galeria_fotos")
          .insert({ carpeta_id: carpeta.id, url, nombre_archivo: archivo.name });
        if (error) throw error;
      } catch {
        fallidas.push(archivo.name);
      }
      setSubiendo((s) => (s ? { ...s, hechas: s.hechas + 1 } : s));
    }
    setSubiendo(null);
    if (inputRef.current) inputRef.current.value = "";
    if (fallidas.length > 0) {
      setMensaje({ texto: `No se pudieron subir: ${fallidas.join(", ")}`, tipo: "error" });
    } else {
      setMensaje({
        texto: `Se ${imagenes.length === 1 ? "subió 1 foto" : `subieron ${imagenes.length} fotos`}.`,
        tipo: "ok",
      });
    }
    await Promise.all([cargarFotos(), onCambio()]);
  }

  async function guardarNombre(e: FormEvent) {
    e.preventDefault();
    const limpio = nuevoNombre.trim();
    if (!limpio || limpio === carpeta.nombre) {
      setRenombrando(false);
      return;
    }
    const { error } = await supabase.from("galeria_carpetas").update({ nombre: limpio }).eq("id", carpeta.id);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    setRenombrando(false);
    await onCambio();
  }

  // Primero se borra la fila (si RLS lo rechaza no se toca el archivo) y
  // despues el archivo del bucket; si eso ultimo falla solo queda un archivo
  // huerfano, no una foto rota en la galeria.
  async function eliminarFoto(foto: GaleriaFoto) {
    setConfirmarFoto(null);
    setAmpliada(null);
    const { error } = await supabase.from("galeria_fotos").delete().eq("id", foto.id);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    await borrarEvidencia(foto.url).catch(() => undefined);
    await Promise.all([cargarFotos(), onCambio()]);
  }

  async function eliminarCarpeta() {
    setConfirmarCarpeta(false);
    const { error } = await supabase.from("galeria_carpetas").delete().eq("id", carpeta.id);
    if (error) {
      setMensaje({ texto: error.message, tipo: "error" });
      return;
    }
    await Promise.allSettled(fotos.map((f) => borrarEvidencia(f.url)));
    onVolver();
    await onCambio();
  }

  const fotoAmpliada = ampliada != null ? fotos[ampliada] : null;

  return (
    <section className="view">
      <div className="galeria-toolbar">
        <button type="button" className="btn-secundario" onClick={onVolver}>
          <ArrowLeft size={14} /> Volver a la Galería
        </button>
      </div>

      <div className="panel">
        <div className="galeria-detalle__cabecera">
          {renombrando ? (
            <form className="galeria-renombrar" onSubmit={guardarNombre}>
              <input
                type="text"
                autoFocus
                required
                maxLength={120}
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
              />
              <button type="submit" className="btn-nuevo">
                Guardar
              </button>
              <button
                type="button"
                className="btn-secundario"
                onClick={() => {
                  setRenombrando(false);
                  setNuevoNombre(carpeta.nombre);
                }}
              >
                Cancelar
              </button>
            </form>
          ) : (
            <div>
              <h2 className="galeria-detalle__titulo">
                {carpeta.nombre}
                <button
                  type="button"
                  className="btn-editar"
                  onClick={() => {
                    setNuevoNombre(carpeta.nombre);
                    setRenombrando(true);
                  }}
                >
                  <Pencil size={12} /> Renombrar
                </button>
              </h2>
              <div className="galeria-carpeta__meta">
                {fotos.length} foto{fotos.length === 1 ? "" : "s"} · creada el{" "}
                {new Date(carpeta.creado_en).toLocaleDateString("es-CO")}
              </div>
            </div>
          )}

          <div className="galeria-detalle__acciones">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => subirFotos(Array.from(e.target.files ?? []))}
            />
            <button
              type="button"
              className="btn-nuevo"
              disabled={subiendo != null}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={15} />
              {subiendo ? `Subiendo ${subiendo.hechas}/${subiendo.total}...` : "Subir fotos"}
            </button>
            {puedeBorrar && (
              <button type="button" className="btn-nuevo danger" onClick={() => setConfirmarCarpeta(true)}>
                <Trash2 size={15} /> Eliminar carpeta
              </button>
            )}
          </div>
        </div>

        <div className="galeria-remisiones">
          {remisiones.map((r) => (
            <span key={r} className="tag-chip">
              {textoRemision(r)}
              <button type="button" onClick={() => quitarRemision(r)} aria-label={`Quitar ${textoRemision(r)}`}>
                ×
              </button>
            </span>
          ))}
          {agregandoRemision ? (
            <form className="tag-chip tag-chip--editando" onSubmit={agregarRemision}>
              <input
                type="text"
                autoFocus
                placeholder="Ej. 34"
                value={textoRemisionNueva}
                onChange={(e) => setTextoRemisionNueva(e.target.value)}
                style={{ width: 80 }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setAgregandoRemision(false);
                    setTextoRemisionNueva("");
                  }
                }}
              />
              <button type="submit" disabled={guardandoRemision} aria-label="Agregar remisión">
                ✓
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgregandoRemision(false);
                  setTextoRemisionNueva("");
                }}
                aria-label="Cancelar"
              >
                ×
              </button>
            </form>
          ) : (
            <button type="button" className="btn-secundario" onClick={() => setAgregandoRemision(true)}>
              + Asociar remisión
            </button>
          )}
        </div>

        {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}

        {cargando ? (
          <div className="empty-state">Cargando...</div>
        ) : fotos.length === 0 ? (
          <div
            className="galeria-vacia"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              subirFotos(Array.from(e.dataTransfer.files));
            }}
          >
            Esta carpeta no tiene fotos todavía. Usa “Subir fotos” o arrástralas aquí.
          </div>
        ) : (
          <div
            className="galeria-fotos"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              subirFotos(Array.from(e.dataTransfer.files));
            }}
          >
            {fotos.map((f, i) => (
              <button key={f.id} type="button" className="galeria-foto" onClick={() => setAmpliada(i)}>
                <img src={f.url} alt={f.nombre_archivo ?? "Foto"} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      {fotoAmpliada && ampliada != null && (
        <Modal
          titulo={`${fotoAmpliada.nombre_archivo ?? "Foto"} (${ampliada + 1} de ${fotos.length})`}
          ancho
          onClose={() => setAmpliada(null)}
        >
          <div className="galeria-visor">
            <button
              type="button"
              className="galeria-visor__nav"
              disabled={ampliada === 0}
              onClick={() => setAmpliada(ampliada - 1)}
              aria-label="Foto anterior"
            >
              <ChevronLeft size={22} />
            </button>
            <img src={fotoAmpliada.url} alt={fotoAmpliada.nombre_archivo ?? "Foto"} />
            <button
              type="button"
              className="galeria-visor__nav"
              disabled={ampliada === fotos.length - 1}
              onClick={() => setAmpliada(ampliada + 1)}
              aria-label="Foto siguiente"
            >
              <ChevronRight size={22} />
            </button>
          </div>
          <div className="galeria-visor__acciones">
            <span className="galeria-carpeta__meta">
              Subida el {new Date(fotoAmpliada.creado_en).toLocaleString("es-CO")}
            </span>
            {/* ?download= hace que Supabase Storage la sirva como descarga en
                vez de abrirla (el atributo download no aplica entre dominios). */}
            <a
              className="btn-secundario"
              href={`${fotoAmpliada.url}?download=${encodeURIComponent(fotoAmpliada.nombre_archivo ?? "foto")}`}
            >
              <Download size={14} /> Descargar
            </a>
            {puedeBorrar && (
              <button type="button" className="btn-rechazar" onClick={() => setConfirmarFoto(fotoAmpliada)}>
                Eliminar foto
              </button>
            )}
          </div>
        </Modal>
      )}

      {confirmarFoto && (
        <ConfirmDialog
          titulo="¿Eliminar esta foto?"
          descripcion="Esta acción no se puede deshacer."
          onConfirmar={() => eliminarFoto(confirmarFoto)}
          onCancelar={() => setConfirmarFoto(null)}
        />
      )}

      {confirmarCarpeta && (
        <ConfirmDialog
          titulo={`¿Eliminar la carpeta "${carpeta.nombre}"?`}
          descripcion={
            fotos.length > 0
              ? `Se eliminarán también sus ${fotos.length} foto${fotos.length === 1 ? "" : "s"}. Esta acción no se puede deshacer.`
              : "Esta acción no se puede deshacer."
          }
          onConfirmar={eliminarCarpeta}
          onCancelar={() => setConfirmarCarpeta(false)}
        />
      )}
    </section>
  );
}
