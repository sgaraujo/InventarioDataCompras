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

export interface ImagenesColumnaExcel {
  // Indice (0-based) de la columna de `columnas` donde va la imagen -- esa
  // columna igual necesita un valor (vacio) en cada fila de `filas` para que
  // el resto de columnas no se corra.
  columna: number;
  // Una URL por fila, mismo orden y mismo largo que `filas`. null = esa fila
  // no tiene foto (se deja vacia, no bloquea el resto del export).
  urls: (string | null)[];
  // Lado del thumbnail cuadrado en pixeles -- tambien define el alto de las
  // filas para que la imagen no quede cortada.
  ladoPx?: number;
}

// exceljs tipa "buffer" como Buffer (Node) -- en el navegador no hay ese
// global, asi que se manda en base64 en su lugar (tambien soportado).
function arrayBufferABase64(datos: ArrayBuffer): string {
  const bytes = new Uint8Array(datos);
  let binario = "";
  const TAMANO_BLOQUE = 0x8000; // evita el limite de argumentos de fromCharCode con fotos grandes
  for (let i = 0; i < bytes.length; i += TAMANO_BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAMANO_BLOQUE));
  }
  return btoa(binario);
}

// Convierte una URL publica de foto (bucket "evidencias") a lo que exceljs
// necesita para embeberla -- se descarga como binario, no como link. Si
// falla (404, formato no soportado por Excel -- solo png/jpeg/gif, no
// webp/svg) devuelve null y esa fila simplemente queda sin imagen, nunca
// rompe el resto del export.
async function descargarImagenParaExcel(url: string): Promise<{ base64: string; extension: "png" | "jpeg" | "gif" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") ?? "";
    const extension = tipo.includes("png")
      ? "png"
      : tipo.includes("gif")
        ? "gif"
        : tipo.includes("jpeg") || tipo.includes("jpg")
          ? "jpeg"
          : null;
    if (!extension) return null;
    const base64 = arrayBufferABase64(await res.arrayBuffer());
    return { base64, extension };
  } catch {
    return null;
  }
}

export async function descargarExcel(
  nombreArchivo: string,
  nombreHoja: string,
  columnas: ColumnaExcel[],
  filas: (string | number | null)[][],
  imagenes?: ImagenesColumnaExcel
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

  if (imagenes) {
    const ladoPx = imagenes.ladoPx ?? 60;
    const ladoPt = ladoPx * 0.75; // 1 px (96 dpi) = 0.75 pt
    for (let i = 0; i < filas.length; i++) {
      hoja.getRow(i + 2).height = ladoPt + 6;
    }
    const descargas = await Promise.all(
      imagenes.urls.map((url) => (url ? descargarImagenParaExcel(url) : Promise.resolve(null)))
    );
    descargas.forEach((img, i) => {
      if (!img) return;
      const imageId = libro.addImage({ base64: img.base64, extension: img.extension });
      hoja.addImage(imageId, {
        tl: { col: imagenes.columna, row: i + 1 },
        ext: { width: ladoPx, height: ladoPx },
        editAs: "oneCell",
      });
    });
  }

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
