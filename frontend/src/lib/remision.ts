import jsPDF from "jspdf";
import { LOGO_INTEEGRA_JPG, RIBBON_PIE_PNG } from "../assets/remision/images";

// Recrea el formato oficial "Remision_salida_materiales_INTEEGRA.docx"
// (version con una sola tabla de datos combinada -- ver analisis del
// 2026-10-14). Por ahora solo se llena la tabla "DETALLE DE MATERIALES" con
// los materiales reales de la salida; el resto de campos (N.º remision,
// fecha, area/proyecto, centro de costo, solicitado por, identificacion,
// destino/ubicacion, motivo, tipo de movimiento) quedan en blanco a
// proposito -- falta decidir de donde sale cada uno con la plantilla nueva.
export interface ItemRemision {
  codigo: string;
  descripcion: string;
  cantidad: string;
  serieLote: string;
}

const COLOR_TITULO: [number, number, number] = [79, 98, 40]; // #4F6228
const COLOR_SECCION: [number, number, number] = [27, 70, 104]; // #1B4668
const COLOR_LABEL_BG: [number, number, number] = [234, 241, 221]; // #EAF1DD
const COLOR_BORDE: [number, number, number] = [130, 130, 130];
const COLOR_TEXTO: [number, number, number] = [30, 30, 30];

const MARGEN = 14;
const LOGO_RATIO = 1650 / 579;
const RIBBON_RATIO = 523 / 182;

function construirRemisionPdf(items: ItemRemision[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGEN * 2;
  const labelW = 34;
  const valueW = contentW / 2 - labelW;
  let y = 14;

  // Si lo que sigue no cabe antes del margen inferior, pasa de pagina.
  function asegurarEspacio(necesario: number) {
    if (y + necesario > pageH - 15) {
      doc.addPage();
      y = 14;
    }
  }

  // --- Logo ---
  const logoW = 58;
  const logoH = logoW / LOGO_RATIO;
  doc.addImage(LOGO_INTEEGRA_JPG, "JPEG", (pageW - logoW) / 2, y, logoW, logoH);
  y += logoH + 7;

  // --- Titulo ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...COLOR_TITULO);
  doc.text("REMISIÓN DE SALIDA DE MATERIALES", pageW / 2, y, { align: "center" });
  y += 8;

  function tituloSeccion(texto: string) {
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_SECCION);
    doc.text(texto, MARGEN, y);
    y += 3.5;
  }

  // Fila con 2 pares label/valor (4 celdas).
  function filaDoble(labelA: string, valueA: string, labelB: string, valueB: string, opts?: { fontSize?: number }) {
    const fontSize = opts?.fontSize ?? 9;
    const x0 = MARGEN;
    const xB = x0 + labelW + valueW;
    const padX = 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const lineasA = doc.splitTextToSize(valueA, valueW - padX * 2);
    const lineasB = doc.splitTextToSize(valueB, valueW - padX * 2);
    const lineH = fontSize * 0.42;
    const h = Math.max(8, Math.max(lineasA.length, lineasB.length) * lineH + 4);

    doc.setDrawColor(...COLOR_BORDE);
    doc.setLineWidth(0.2);
    doc.setFillColor(...COLOR_LABEL_BG);
    doc.rect(x0, y, labelW, h, "FD");
    doc.rect(x0 + labelW, y, valueW, h, "D");
    doc.setFillColor(...COLOR_LABEL_BG);
    doc.rect(xB, y, labelW, h, "FD");
    doc.rect(xB + labelW, y, valueW, h, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(labelA, x0 + padX, y + 4.5);
    doc.text(labelB, xB + padX, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.text(lineasA, x0 + labelW + padX, y + 4.5);
    doc.text(lineasB, xB + labelW + padX, y + 4.5);

    y += h;
  }

  // Fila con un solo label/valor que ocupa todo el ancho (ej. Destino/Ubicacion).
  function filaSimple(label: string, value: string, fontSize = 9) {
    const x0 = MARGEN;
    const padX = 2;
    const anchoValor = contentW - labelW;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const lineas = doc.splitTextToSize(value, anchoValor - padX * 2);
    const lineH = fontSize * 0.42;
    const h = Math.max(8, lineas.length * lineH + 4);

    doc.setDrawColor(...COLOR_BORDE);
    doc.setLineWidth(0.2);
    doc.setFillColor(...COLOR_LABEL_BG);
    doc.rect(x0, y, labelW, h, "FD");
    doc.rect(x0 + labelW, y, anchoValor, h, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(label, x0 + padX, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.text(lineas, x0 + labelW + padX, y + 4.5);

    y += h;
  }

  // --- DATOS DE ENTREGA (todo en blanco por ahora, ver nota arriba) ---
  tituloSeccion("DATOS DE ENTREGA");
  filaDoble("N.º REMISIÓN", "", "FECHA DE ENTREGA", "");
  filaDoble("ÁREA / PROYECTO", "", "CENTRO DE COSTO", "");
  filaDoble("SOLICITADO POR", "", "IDENTIFICACIÓN", "");
  filaSimple("DESTINO / UBICACIÓN", "");
  filaDoble("MOTIVO DE SALIDA", "", "TIPO DE MOVIMIENTO", "[ ] Consumo   [ ] Traslado   [ ] Préstamo   [ ] Alquiler   [ ] Otro", {
    fontSize: 8,
  });

  // --- Detalle de materiales (una fila por cada item de la salida) ---
  tituloSeccion("DETALLE DE MATERIALES");
  const cols: { titulo: string; w: number }[] = [
    { titulo: "Ítem", w: 10 },
    { titulo: "Código", w: 24 },
    { titulo: "Descripción", w: 55 },
    { titulo: "Unidad", w: 16 },
    { titulo: "Cantidad", w: 18 },
    { titulo: "Serie / Lote", w: 32 },
    { titulo: "Observaciones", w: contentW - (10 + 24 + 55 + 16 + 18 + 32) },
  ];
  const hCabecera = 7;
  const hFila = 9;

  function dibujarCabeceraMateriales() {
    let x = MARGEN;
    doc.setDrawColor(...COLOR_BORDE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    for (const c of cols) {
      doc.setFillColor(...COLOR_LABEL_BG);
      doc.rect(x, y, c.w, hCabecera, "FD");
      doc.setTextColor(...COLOR_TEXTO);
      doc.text(c.titulo, x + c.w / 2, y + 4.7, { align: "center", maxWidth: c.w - 2 });
      x += c.w;
    }
    y += hCabecera;
  }

  asegurarEspacio(hCabecera + hFila);
  dibujarCabeceraMateriales();

  const filas = items.length > 0 ? items : [{ codigo: "", descripcion: "", cantidad: "", serieLote: "" }];
  filas.forEach((item, i) => {
    asegurarEspacio(hFila);
    const valores = [String(i + 1), item.codigo, item.descripcion, "UND", item.cantidad, item.serieLote, ""];
    let x = MARGEN;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    cols.forEach((c, idx) => {
      doc.rect(x, y, c.w, hFila, "D");
      const lineas = doc.splitTextToSize(valores[idx] || "", c.w - 2);
      doc.text(lineas, x + c.w / 2, y + 5.5, { align: "center", maxWidth: c.w - 2 });
      x += c.w;
    });
    y += hFila;
  });

  // --- Control y autorizacion ---
  asegurarEspacio(5 + 8 + 24);
  tituloSeccion("CONTROL Y AUTORIZACIÓN");
  const colW = contentW / 3;
  const titulos = ["ENTREGÓ", "MENSAJERIA/CORRESPONDENCIA", "RECIBIÓ"];
  const hTitAut = 8;
  let x = MARGEN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  for (const t of titulos) {
    doc.setFillColor(...COLOR_LABEL_BG);
    doc.rect(x, y, colW, hTitAut, "FD");
    doc.setTextColor(...COLOR_TEXTO);
    const lineas = doc.splitTextToSize(t, colW - 4);
    doc.text(lineas, x + colW / 2, y + 4, { align: "center" });
    x += colW;
  }
  y += hTitAut;

  const hCuerpoAut = 24;
  x = MARGEN;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (let i = 0; i < 3; i++) {
    doc.rect(x, y, colW, hCuerpoAut, "D");
    doc.text("Nombre: ______________________", x + 3, y + 7);
    doc.text("Firma: ________________________", x + 3, y + 15);
    doc.text("Fecha: ________________________", x + 3, y + 22);
    x += colW;
  }
  y += hCuerpoAut + 6;

  // --- Notas ---
  asegurarEspacio(10);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  const notas = doc.splitTextToSize(
    "Notas: Registrar cantidades entregadas y verificar el estado de los materiales. La firma de recibido confirma la entrega física.",
    contentW
  );
  doc.text(notas, MARGEN, y);

  // --- Pie de pagina (cinta decorativa + contacto) -- en cada pagina ---
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    const ribbonW = 70;
    const ribbonH = ribbonW / RIBBON_RATIO;
    const footerY = pageH - 20;
    doc.addImage(RIBBON_PIE_PNG, "PNG", pageW - ribbonW - MARGEN, footerY - ribbonH + 6, ribbonW, ribbonH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text("Contacto: Av. Carrera 40 No. 20A - 44 Piso 5 · Tel.: +57 601 7184570", MARGEN, footerY + 2);
    doc.text("Email: info@inteegra.co · Bogotá, Colombia", MARGEN, footerY + 6);
  }

  return doc;
}

function nombreArchivo(): string {
  return `Remision_salida_${Date.now()}.pdf`;
}

export function descargarRemisionPdf(items: ItemRemision[]): void {
  construirRemisionPdf(items).save(nombreArchivo());
}

export function abrirRemisionPdf(items: ItemRemision[]): void {
  const url = construirRemisionPdf(items).output("bloburl");
  window.open(url, "_blank");
}
