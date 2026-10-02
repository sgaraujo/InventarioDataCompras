import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { mapMovimientoJoin } from "../api/movimientos";
import type { Movimiento } from "../api/types";
import { money } from "../lib/labels";
import { Paginacion } from "../components/Paginacion";
import { usePaginacion } from "../hooks/usePaginacion";
import { Modal } from "../components/Modal";
import { FileText, Image as ImageIcon } from "lucide-react";

const TAMANO_PAGINA = 25;

export function Historial() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");

  const [evidenciaVista, setEvidenciaVista] = useState<{ url: string; titulo: string } | null>(null);

  async function cargarMovimientos() {
    setCargando(true);
    let query = supabase
      .from("movimientos")
      .select("*, materiales(codigo, descripcion), material_referencias(codigo), solicitantes(nombre)")
      .order("creado_en", { ascending: false })
      .limit(500);
    if (filtroTipo) query = query.eq("tipo", filtroTipo);
    if (filtroDesde) query = query.gte("creado_en", filtroDesde);
    if (filtroHasta) query = query.lte("creado_en", `${filtroHasta}T23:59:59`);
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setMovimientos([]);
    } else {
      setError(null);
      setMovimientos((data ?? []).map(mapMovimientoJoin) as Movimiento[]);
    }
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
      (m.referencia_codigo ?? "").toLowerCase().includes(t) ||
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
                <th>Referencia</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Solicitante</th>
                <th>Observaciones</th>
                <th>Ubicación</th>
                <th>Evidencia</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    Cargando...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    No se pudieron cargar los movimientos ({error}).
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    No hay movimientos con ese filtro.
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.creado_en).toLocaleString("es-CO")}</td>
                    <td>{m.material_codigo}</td>
                    <td>{m.material_descripcion}</td>
                    <td>{m.referencia_codigo || "—"}</td>
                    <td>
                      <span className={`badge ${m.tipo}`}>{m.tipo === "entrada" ? "Entrada" : "Salida"}</span>
                    </td>
                    <td>{money(m.cantidad)}</td>
                    <td>{m.solicitante_nombre || "—"}</td>
                    <td>{m.observaciones || "—"}</td>
                    <td>{m.ubicacion || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {m.foto && (
                          <button
                            type="button"
                            className="link-evidencia"
                            title="Ver foto"
                            onClick={() =>
                              setEvidenciaVista({ url: m.foto!, titulo: `Foto — ${m.material_descripcion}` })
                            }
                          >
                            <ImageIcon size={16} />
                          </button>
                        )}
                        {m.adjunto && (
                          <button
                            type="button"
                            className="link-evidencia"
                            title="Ver soporte"
                            onClick={() =>
                              setEvidenciaVista({ url: m.adjunto!, titulo: `Soporte — ${m.material_descripcion}` })
                            }
                          >
                            <FileText size={16} />
                          </button>
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

      {evidenciaVista && (
        <Modal titulo={evidenciaVista.titulo} onClose={() => setEvidenciaVista(null)}>
          {evidenciaVista.url.toLowerCase().includes(".pdf") ? (
            <iframe
              src={evidenciaVista.url}
              title={evidenciaVista.titulo}
              style={{ width: "100%", height: "70vh", border: "none", borderRadius: 8 }}
            />
          ) : (
            <img
              src={evidenciaVista.url}
              alt={evidenciaVista.titulo}
              style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
            />
          )}
        </Modal>
      )}
    </section>
  );
}
