import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Ultimo recurso: si algo revienta durante el render (ej. un choque entre
// React y el corrector ortografico del navegador al editar en linea), esto
// evita que toda la app se ponga en blanco -- muestra un aviso y deja
// recargar sin perder la sesion.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error no controlado:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Ocurrió un problema inesperado</h2>
          <p>La página tuvo un error y no se puede seguir mostrando. Recarga para continuar.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
