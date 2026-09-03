import { useRef, useState } from "react";
import { api, descargarArchivo, ApiClientError } from "../api/client";
import { Modal } from "./Modal";
import { Download, Upload, CheckCircle2 } from "lucide-react";

interface FilaImportada {
  fila: number;
  nombre: string;
  [key: string]: unknown;
}

interface FilaError {
  fila: number;
  motivo: string;
}

interface ResultadoImportacion {
  nuevos: FilaImportada[];
  errores: FilaError[];
  aplicado: boolean;
  [key: string]: unknown;
}

interface Props {
  titulo: string;
  endpointPlantilla: string;
  nombreArchivoPlantilla: string;
  endpointImportar: string;
  claveSegundaLista: string; // "existentes" (categorias) o "actualizados" (proveedores)
  etiquetaSegundaLista: string;
  onClose: () => void;
  onConfirmado: () => void;
}

export function ImportarExcelModal({
  titulo,
  endpointPlantilla,
  nombreArchivoPlantilla,
  endpointImportar,
  claveSegundaLista,
  etiquetaSegundaLista,
  onClose,
  onConfirmado,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  const segundaLista = (resultado?.[claveSegundaLista] as FilaImportada[]) ?? [];

  async function bajarPlantilla() {
    try {
      await descargarArchivo(endpointPlantilla, nombreArchivoPlantilla);
    } catch (err) {
      setMensaje({ texto: err instanceof ApiClientError ? err.message : "Error al descargar la plantilla", tipo: "error" });
    }
  }

  async function analizarArchivo(f: File) {
    setArchivo(f);
    setResultado(null);
    setMensaje(null);
    setCargando(true);
    try {
      const formData = new FormData();
      formData.append("archivo", f);
      const r = await api.upload<ResultadoImportacion>(endpointImportar, formData);
      setResultado(r);
    } catch (err) {
      setMensaje({ texto: err instanceof ApiClientError ? err.message : "Error al leer el archivo", tipo: "error" });
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
    if (!archivo) return;
    setConfirmando(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      formData.append("confirmar", "true");
      const r = await api.upload<ResultadoImportacion>(endpointImportar, formData);
      setResultado(r);
      setMensaje({ texto: "Importación aplicada correctamente.", tipo: "ok" });
      onConfirmado();
    } catch (err) {
      setMensaje({ texto: err instanceof ApiClientError ? err.message : "Error al importar", tipo: "error" });
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Modal titulo={titulo} onClose={onClose} confirmarCierre={Boolean(archivo) && !resultado?.aplicado}>
      <div className="importar-excel">
        <button type="button" className="btn-secundario" onClick={bajarPlantilla}>
          <Download size={14} /> Descargar plantilla
        </button>

        <div className="importar-excel__subida">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analizarArchivo(f);
            }}
          />
        </div>

        {cargando && <div className="importar-excel__estado">Leyendo archivo...</div>}

        {resultado && !cargando && (
          <div className="importar-excel__resumen">
            <div className="importar-excel__conteos">
              <span className="tag-chip">Nuevos: {resultado.nuevos.length}</span>
              <span className="tag-chip">
                {etiquetaSegundaLista}: {segundaLista.length}
              </span>
              {resultado.errores.length > 0 && (
                <span className="tag-chip tag-chip--error">Con error: {resultado.errores.length}</span>
              )}
            </div>

            {resultado.errores.length > 0 && (
              <div className="importar-excel__detalle">
                <strong>Filas con error (no se van a importar):</strong>
                <ul>
                  {resultado.errores.map((e, i) => (
                    <li key={i}>
                      Fila {e.fila}: {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {resultado.nuevos.length > 0 && (
              <div className="importar-excel__detalle">
                <strong>Se van a crear:</strong>
                <ul>
                  {resultado.nuevos.map((n, i) => (
                    <li key={i}>
                      Fila {n.fila}: {n.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {segundaLista.length > 0 && (
              <div className="importar-excel__detalle">
                <strong>{etiquetaSegundaLista}:</strong>
                <ul>
                  {segundaLista.map((n, i) => (
                    <li key={i}>
                      Fila {n.fila}: {n.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {resultado.aplicado ? (
              <div className="importar-excel__ok">
                <CheckCircle2 size={16} /> Importación aplicada.
              </div>
            ) : (
              (resultado.nuevos.length > 0 || segundaLista.length > 0) && (
                <button type="button" onClick={confirmarImportacion} disabled={confirmando}>
                  <Upload size={14} /> {confirmando ? "Importando..." : "Confirmar importación"}
                </button>
              )
            )}
          </div>
        )}

        {mensaje && <div className={`mensaje-form ${mensaje.tipo}`}>{mensaje.texto}</div>}
      </div>
    </Modal>
  );
}
