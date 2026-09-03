import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { subirEvidencia } from "../api/storage";
import type { CentroCosto, Empresa, Material } from "../api/types";
import { money, puedeEditar } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Pencil, ImageOff } from "lucide-react";

const TAMANO_PAGINA = 25;

const FORM_VACIO = {
  id: null as number | null,
  empresa_id: "",
  centro_costo_id: "",
  descripcion: "",
  activo: true,
};

export function Materiales() {
  const { usuario } = useAuth();
  const editable = puedeEditar(usuario);

  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").toLowerCase();
  const empresaFiltro = searchParams.get("empresa_id") ?? "";

  const [materiales, setMateriales] = useState<Material[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [cargando, setCargando] = useState(true);

  const [form, setForm] = useState(FORM_VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const editando = form.id !== null;
  const formInicialRef = useRef(FORM_VACIO);

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

  useEffect(() => {
    cargarMateriales();
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
    setMensaje(null);
    setMostrarForm(true);
  }

  function editar(m: Material) {
    const datos = {
      id: m.id,
      empresa_id: String(m.empresa_id),
      centro_costo_id: m.centro_costo_id ? String(m.centro_costo_id) : "",
      descripcion: m.descripcion,
      activo: m.activo,
    };
    setForm(datos);
    formInicialRef.current = datos;
    setFoto(null);
    setMensaje(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setForm(FORM_VACIO);
    setFoto(null);
    setMensaje(null);
  }

  const centrosDeLaEmpresa = centrosCosto.filter((c) => String(c.empresa_id) === form.empresa_id);

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
        ...(fotoUrl ? { foto: fotoUrl } : {}),
        ...(editando ? { activo: form.activo } : {}),
      };

      const { error } = editando
        ? await supabase.from("materiales").update(cuerpo).eq("id", form.id!)
        : await supabase.from("materiales").insert(cuerpo);

      if (error) throw error;
      setMostrarForm(false);
      setForm(FORM_VACIO);
      await cargarMateriales();
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : "Error al guardar el material", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  }

  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState<Material | null>(null);

  async function desactivarMaterial(m: Material) {
    setConfirmandoDesactivar(null);
    await supabase.from("materiales").update({ activo: !m.activo }).eq("id", m.id);
    await cargarMateriales();
  }

  return (
    <section className="view">
      <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {editable && (
          <button type="button" className="btn-nuevo" onClick={abrirNuevo}>
            + Nuevo material
          </button>
        )}
        <select value={empresaFiltro} onChange={(e) => cambiarEmpresaFiltro(e.target.value)}>
          <option value="">Todas las empresas</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nombre}
            </option>
          ))}
        </select>
        <input
          type="text"
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

      {editable && mostrarForm && (
        <Modal
          titulo={editando ? `Editar material: ${form.descripcion}` : "Nuevo material"}
          onClose={cerrarForm}
          confirmarCierre={JSON.stringify(form) !== JSON.stringify(formInicialRef.current) || Boolean(foto)}
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
                <th>Stock actual</th>
                <th>Estado</th>
                {editable && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={editable ? 8 : 7} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 8 : 7} className="empty-state">
                    No se encontraron materiales con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.foto ? (
                        <img src={m.foto} alt={m.descripcion} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        <ImageOff size={18} color="var(--text-muted)" />
                      )}
                    </td>
                    <td>{m.codigo}</td>
                    <td>
                      {m.descripcion} {!m.activo && <span className="badge sin_existencias">Inactivo</span>}
                    </td>
                    <td>{m.empresa_nombre}</td>
                    <td>{m.centro_costo_nombre || "—"}</td>
                    <td>{money(m.stock_actual)}</td>
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
    </section>
  );
}
