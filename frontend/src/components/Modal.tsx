import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  // Si es true, antes de cerrar (X, ESC, click afuera del modal) pide
  // confirmacion -- para no perder sin querer datos de un formulario a medio
  // llenar. Cada pantalla decide cuando pasar esto en true (ej. si hay texto
  // escrito que todavia no se envio); los modales de solo lectura (ver una
  // foto, un detalle) simplemente no lo pasan y se cierran directo.
  confirmarCierre?: boolean;
}

export function Modal({ titulo, onClose, children, confirmarCierre }: ModalProps) {
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);

  function intentarCerrar() {
    if (confirmarCierre) {
      setPidiendoConfirmacion(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Con la confirmacion ya abierta, ESC solo la cancela (se queda
      // editando) en vez de intentar cerrar el modal de nuevo.
      if (pidiendoConfirmacion) {
        setPidiendoConfirmacion(false);
      } else {
        intentarCerrar();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, confirmarCierre, pidiendoConfirmacion]);

  return createPortal(
    <div className="modal-backdrop" onClick={intentarCerrar}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{titulo}</h2>
          <button type="button" className="modal-cerrar" onClick={intentarCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>

      {pidiendoConfirmacion && (
        <div className="alert-overlay" onClick={(e) => { e.stopPropagation(); setPidiendoConfirmacion(false); }}>
          <div className="alert-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <h3 className="alert-dialog__titulo">¿Seguro que quieres salir?</h3>
            <p className="alert-dialog__descripcion">Vas a perder los cambios sin guardar.</p>
            <div className="alert-dialog__acciones">
              <button type="button" className="alert-dialog__cancelar" onClick={() => setPidiendoConfirmacion(false)}>
                Seguir editando
              </button>
              <button type="button" className="alert-dialog__confirmar" onClick={onClose}>
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
