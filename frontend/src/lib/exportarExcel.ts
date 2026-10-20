// Exportador generico a .xlsx (todo client-side con exceljs, sin backend --
// mismo criterio que lib/remision.ts con jsPDF). Reemplaza el CSV plano:
// encabezado en negrita con color, filtro automatico, ancho de columna fijo
// y formato numerico/moneda real (no texto), para que se entienda apenas se
// abra en Excel.
//
// exceljs es pesado (~2 MB) -- se importa dinamico aca adentro para que solo
// se descargue cuando alguien le da clic a "Exportar", no en el bundle
// principal que carga todo el mundo apenas entra a la app.
const COLOR_ENCABEZADO = "FF1B4668"; // mismo azul de seccion que la remision

export interface ColumnaExcel {
  encabezado: string;
  ancho: number;
  // Formato numerico de Excel (numFmt) -- se deja sin definir para columnas
  // de texto.
  formato?: string;
}

export async function descargarExcel(
  nombreArchivo: string,
  nombreHoja: string,
  columnas: ColumnaExcel[],
  filas: (string | number | null)[][]
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja, { views: [{ state: "frozen", ySplit: 1 }] });

  hoja.columns = columnas.map((c) => ({
    header: c.encabezado,
    width: c.ancho,
    style: c.formato ? { numFmt: c.formato } : undefined,
  }));
  hoja.addRows(filas);

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  encabezado.alignment = { vertical: "middle" };
  encabezado.height = 20;
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
