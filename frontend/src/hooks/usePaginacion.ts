import { useSearchParams } from "react-router-dom";

// Paginacion del lado del cliente: la lista completa (ya filtrada por lo que
// sea que la pagina traiga del backend) se trae entera y se corta aca en
// paginas de tamanoPagina. La pagina actual vive en la URL (?pagina=2) para
// que recargar o compartir el enlace mantenga el mismo lugar.
export function usePaginacion<T>(items: T[], tamanoPagina: number) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pagina = Number(searchParams.get("pagina") ?? "1");

  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanoPagina));
  // Si un filtro reduce el total y la URL seguia apuntando a una pagina que
  // ya no existe, se acota sola a la ultima pagina valida.
  const paginaActual = Math.min(Math.max(pagina, 1), totalPaginas);
  const inicio = (paginaActual - 1) * tamanoPagina;
  const pageItems = items.slice(inicio, inicio + tamanoPagina);
  const desde = total ? inicio + 1 : 0;
  const hasta = Math.min(inicio + tamanoPagina, total);

  function irAPagina(n: number) {
    const next = new URLSearchParams(searchParams);
    next.set("pagina", String(n));
    setSearchParams(next, { replace: true });
  }

  return { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina };
}
