import { Link } from "react-router-dom";
import { Images, Printer } from "lucide-react";
import { Modal } from "./Modal";
import { money } from "../lib/labels";
import { abrirRemisionPdf, type DatosRemisionSalida, type TipoMovimientoRemision } from "../lib/remision";
import type { FilaMovimiento, ItemAgrupable } from "../lib/agruparMovimientos";

// Detalle de una fila agrupada de Historial/Ultimos movimientos -- lista
// cada material/referencia/cantidad que se movio junto, y si es una Salida
// deja volver a generar la remision con esos mismos datos (reconstruida
// desde lo guardado, no depende de tenerla abierta en el momento).
export function DetalleMovimientoModal<T extends ItemAgrupable>({
  fila,
  onClose,
}: {
  fila: FilaMovimiento<T>;
  onClose: () => void;
}) {
  function verRemision() {
    const datos: DatosRemisionSalida = {
      numero: fila.remisionNumero != null ? `REM-${String(fila.remisionNumero).padStart(6, "0")}` : "—",
      fechaEntrega: new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(fila.creado_en)),
      areaProyecto: fila.areaProyecto ?? "",
      centroCosto: fila.centroCostoTexto ?? "",
      solicitadoPor: fila.solicitanteNombre ?? "",
      identificacion: "",
      destinoUbicacion: fila.ubicacion ?? "",
      motivoSalida: fila.motivoSalida ?? "",
      tipoMovimiento: (fila.tipoMovimientoRemision ?? "") as TipoMovimientoRemision,
      items: fila.items.map((it) => ({
        codigo: it.material_codigo,
        descripcion: it.material_descripcion,
        cantidad: money(it.cantidad),
        serieLote: it.referencia_codigo ?? "—",
        observaciones: it.observaciones ?? "",
      })),
    };
    void abrirRemisionPdf(datos);
  }

  return (
    <Modal
      titulo={`Detalle de la ${fila.tipo === "salida" ? "salida" : "entrada"} — ${new Date(fila.creado_en).toLocaleString("es-CO")}`}
      onClose={onClose}
      ancho
    >
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Referencia</th>
              <th>Cantidad</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {fila.items.map((it) => (
              <tr key={it.id}>
                <td>{it.material_codigo}</td>
                <td>{it.material_descripcion}</td>
                <td>{it.referencia_codigo || "—"}</td>
                <td>{money(it.cantidad)}</td>
                <td>{it.observaciones || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fila.tipo === "salida" && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn-secundario" onClick={verRemision}>
            <Printer size={14} /> Ver / Imprimir remisión
          </button>
          {fila.remisionNumero != null && (
            <Link className="btn-secundario" to={`/galeria?remision=${fila.remisionNumero}`} style={{ marginLeft: 8 }}>
              <Images size={14} /> Fotos en Galería
            </Link>
          )}
        </div>
      )}
    </Modal>
  );
}
