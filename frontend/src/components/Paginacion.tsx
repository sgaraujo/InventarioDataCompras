interface PaginacionProps {
  paginaActual: number;
  totalPaginas: number;
  desde: number;
  hasta: number;
  total: number;
  etiqueta: string; // ej. "materiales", "solicitudes", "usuarios"
  onCambiarPagina: (n: number) => void;
}

export function Paginacion({ paginaActual, totalPaginas, desde, hasta, total, etiqueta, onCambiarPagina }: PaginacionProps) {
  return (
    <div className="paginacion">
      <span>
        Mostrando {desde}-{hasta} de {total} {etiqueta} · Página {paginaActual} de {totalPaginas}
      </span>
      <div className="paginacion__botones">
        <button type="button" disabled={paginaActual <= 1} onClick={() => onCambiarPagina(paginaActual - 1)}>
          &larr; Anterior
        </button>
        <button type="button" disabled={paginaActual >= totalPaginas} onClick={() => onCambiarPagina(paginaActual + 1)}>
          Siguiente &rarr;
        </button>
      </div>
    </div>
  );
}
