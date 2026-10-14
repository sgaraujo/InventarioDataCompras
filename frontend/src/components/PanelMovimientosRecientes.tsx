import { useState } from "react";
import { Layers } from "lucide-react";
import type { MovimientoReciente } from "../api/types";
import { money, textoUbicacionMovimiento } from "../lib/labels";
import { agruparMovimientos, type FilaMovimiento } from "../lib/agruparMovimientos";
import { DetalleMovimientoModal } from "./DetalleMovimientoModal";

interface Props {
  movimientos: MovimientoReciente[];
  cargando: boolean;
  error?: string | null;
}

export function PanelMovimientosRecientes({ movimientos, cargando, error }: Props) {
  const [filaVista, setFilaVista] = useState<FilaMovimiento<MovimientoReciente> | null>(null);
  const filas = agruparMovimientos(movimientos);

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
              <th>Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Cargando...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  No se pudieron cargar los movimientos ({error}).
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Aún no hay movimientos registrados.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id}>
                  <td>{new Date(f.creado_en).toLocaleString("es-CO")}</td>
                  <td>
                    {f.esGrupo ? (
                      <a
                        href="#"
                        className="link-detalle"
                        onClick={(e) => {
                          e.preventDefault();
                          setFilaVista(f);
                        }}
                        title="Ver detalle"
                      >
                        {f.materialDescripcion || `Varios (${f.materialesDistintos})`}
                        <Layers size={14} />
                      </a>
                    ) : (
                      f.materialDescripcion
                    )}
                  </td>
                  <td>
                    <span className={`badge ${f.tipo}`}>{f.tipo === "entrada" ? "Entrada" : "Salida"}</span>
                  </td>
                  <td>{f.cantidad != null ? money(f.cantidad) : "—"}</td>
                  <td>{f.solicitanteNombre || "—"}</td>
                  <td>{textoUbicacionMovimiento({ ubicacion: f.ubicacion, ubicacion_origen: f.ubicacionOrigen })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filaVista && <DetalleMovimientoModal fila={filaVista} onClose={() => setFilaVista(null)} />}
    </div>
  );
}
