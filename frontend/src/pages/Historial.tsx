import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import type { Movimiento } from "../api/types";
import { money } from "../lib/labels";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { FileText, Image as ImageIcon } from "lucide-react";

const TAMANO_PAGINA = 25;

export function Historial() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);

  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");

  async function cargarMovimientos() {
    setCargando(true);
    let query = supabase
      .from("movimientos")
      .select("*, materiales(codigo, descripcion), solicitantes(nombre)")
      .order("creado_en", { ascending: false })
      .limit(500);
    if (filtroTipo) query = query.eq("tipo", filtroTipo);
    if (filtroDesde) query = query.gte("creado_en", filtroDesde);
    if (filtroHasta) query = query.lte("creado_en", `${filtroHasta}T23:59:59`);
    const { data } = await query;
    setMovimientos(
      (data ?? []).map((m) => ({
        ...m,
        material_codigo: (m.materiales as { codigo: string } | null)?.codigo ?? "—",
        material_descripcion: (m.materiales as { descripcion: string } | null)?.descripcion ?? "—",
        solicitante_nombre: (m.solicitantes as { nombre: string } | null)?.nombre ?? null,
      })) as Movimiento[]
    );
    setCargando(false);
  }

  useEffect(() => {
    cargarMovimientos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, filtroDesde, filtroHasta]);

  const filtrados = movimientos.filter((m) => {
    if (!filtroTexto) return true;
    const t = filtroTexto.toLowerCase();
    return (
      m.material_descripcion.toLowerCase().includes(t) ||
      m.material_codigo.toLowerCase().includes(t) ||
      (m.solicitante_nombre ?? "").toLowerCase().includes(t)
    );
  });

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } = usePaginacion(
    filtrados,
    TAMANO_PAGINA
  );

  function limpiarFiltros() {
    setFiltroTipo("");
    setFiltroDesde("");
    setFiltroHasta("");
    setFiltroTexto("");
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
            <label>Desde</label>
            <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
          </div>
          <div>
            <label>Buscar</label>
            <input
              type="text"
              placeholder="Material, código o solicitante..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>
          <button type="button" className="btn-editar" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        </div>
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Código</th>
                <th>Material</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Solicitante</th>
                <th>Observaciones</th>
                <th>Evidencia</th>
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
                    No hay movimientos con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.creado_en).toLocaleString("es-CO")}</td>
                    <td>{m.material_codigo}</td>
                    <td>{m.material_descripcion}</td>
                    <td>
                      <span className={`badge ${m.tipo}`}>{m.tipo === "entrada" ? "Entrada" : "Salida"}</span>
                    </td>
                    <td>{money(m.cantidad)}</td>
                    <td>{m.solicitante_nombre || "—"}</td>
                    <td>{m.observaciones || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {m.foto && (
                          <a href={m.foto} target="_blank" rel="noreferrer" title="Ver foto">
                            <ImageIcon size={16} />
                          </a>
                        )}
                        {m.adjunto && (
                          <a href={m.adjunto} target="_blank" rel="noreferrer" title="Ver soporte">
                            <FileText size={16} />
                          </a>
                        )}
                        {!m.foto && !m.adjunto && "—"}
                      </div>
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
          etiqueta="movimientos"
          onCambiarPagina={irAPagina}
        />
      </div>
    </section>
  );
}
