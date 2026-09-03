import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  titulo: string;
  descripcion: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

// Reemplazo de window.confirm() con el mismo estilo visual que ya usa Modal
// para "¿seguro que quieres salir sin guardar?" -- reusa las mismas clases
// (.alert-overlay/.alert-dialog) para que ambos casos se vean iguales.
export function ConfirmDialog({
  titulo,
  descripcion,
  textoConfirmar = "Eliminar",
  textoCancelar = "Cancelar",
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  return createPortal(
    <div className="alert-overlay" onClick={onCancelar}>
      <div className="alert-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <h3 className="alert-dialog__titulo">{titulo}</h3>
        <p className="alert-dialog__descripcion">{descripcion}</p>
        <div className="alert-dialog__acciones">
          <button type="button" className="alert-dialog__cancelar" onClick={onCancelar}>
            {textoCancelar}
          </button>
          <button type="button" className="alert-dialog__confirmar" onClick={onConfirmar}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
