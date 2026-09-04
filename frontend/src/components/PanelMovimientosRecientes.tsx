import type { MovimientoReciente } from "../api/types";
import { money } from "../lib/labels";

interface Props {
  movimientos: MovimientoReciente[];
  cargando: boolean;
  error?: string | null;
}

export function PanelMovimientosRecientes({ movimientos, cargando, error }: Props) {
  return (
    <div className="panel">
      <h2>Últimos movimientos</h2>
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Material</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Solicitante</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Cargando...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No se pudieron cargar los movimientos ({error}).
                </td>
              </tr>
            ) : movimientos.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Aún no hay movimientos registrados.
                </td>
              </tr>
            ) : (
              movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.creado_en).toLocaleString("es-CO")}</td>
                  <td>{m.material_descripcion}</td>
                  <td>
                    <span className={`badge ${m.tipo}`}>{m.tipo === "entrada" ? "Entrada" : "Salida"}</span>
                  </td>
                  <td>{money(m.cantidad)}</td>
                  <td>{m.solicitante_nombre || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
