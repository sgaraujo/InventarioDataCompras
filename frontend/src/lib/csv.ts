// Generador de CSV simple, sin libreria (mismo criterio que lib/remision.ts
// con jsPDF: todo client-side, sin backend). Lleva BOM UTF-8 para que Excel
// en Windows muestre bien las tildes al abrirlo con doble click.
function celda(valor: string | number | null | undefined): string {
  const texto = valor == null ? "" : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function descargarCsv(
  nombreArchivo: string,
  encabezados: string[],
  filas: (string | number | null)[][]
): void {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celda).join(","));
  const contenido = "﻿" + lineas.join("\r\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
