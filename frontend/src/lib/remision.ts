import jsPDF from "jspdf";
import { LOGO_INTEEGRA_JPG, RIBBON_PIE_PNG } from "../assets/remision/images";

// Recrea (logo, colores, secciones) el formato oficial
// "Remision_salida_materiales_INTEEGRA.docx" -- se genera 1 remision por cada
// Salida registrada, con un solo renglon de detalle (lo que de verdad se
// movio en ese registro). Los campos que el formato original deja para
// diligenciar a mano (Identificacion, Cargo/Area, Tipo de movimiento, las
// firmas) se imprimen vacios a proposito.
export interface DatosRemision {
  numero: string;
  fecha: string;
  empresa: string;
  centroCosto: string;
  solicitante: string;
  destino: string;
  motivo: string;
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

function construirRemisionPdf(datos: DatosRemision): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGEN * 2;
  let y = 14;

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

  const labelW = 34;
  const valueW = contentW / 2 - labelW;

  // Fila con 2 pares label/valor (4 celdas). El alto se ajusta solo si el
  // texto necesita mas de una linea (ej. las casillas de tipo de movimiento).
  function filaDoble(
    labelA: string,
    valueA: string,
    labelB: string,
    valueB: string,
    opts?: { fontSize?: number }
  ) {
    const fontSize = opts?.fontSize ?? 9;
    const x0 = MARGEN;
    const xB = x0 + labelW + valueW;
    const padX = 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const lineasA = doc.splitTextToSize(valueA || "—", valueW - padX * 2);
    const lineasB = doc.splitTextToSize(valueB || "—", valueW - padX * 2);
    const lineH = fontSize * 0.42;
    const h = Math.max(8, Math.max(lineasA.length, lineasB.length) * lineH + 4);

    doc.setDrawColor(...COLOR_BORDE);
    doc.setLineWidth(0.2);
    doc.setFillColor(...COLOR_LABEL_BG);
    doc.rect(x0, y, labelW, h, "FD");
    doc.rect(x0 + labelW, y, valueW, h, "D");
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

  function tituloSeccion(texto: string) {
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_SECCION);
    doc.text(texto, MARGEN, y);
    y += 3.5;
  }

  filaDoble("N.º REMISIÓN", datos.numero, "FECHA", datos.fecha);
  filaDoble("ÁREA / PROYECTO", datos.empresa, "CENTRO DE COSTO", datos.centroCosto);
  filaDoble("SOLICITADO POR", datos.solicitante, "CARGO / ÁREA", "");

  tituloSeccion("DATOS DE ENTREGA");
  filaDoble("ENTREGADO A", datos.solicitante, "IDENTIFICACIÓN", "");
  filaDoble("DESTINO / UBICACIÓN", datos.destino, "FECHA DE ENTREGA", datos.fecha);
  filaDoble(
    "MOTIVO DE SALIDA",
    datos.motivo,
    "TIPO DE MOVIMIENTO",
    "[ ] Consumo   [ ] Traslado   [ ] Préstamo   [ ] Alquiler   [ ] Otro",
    { fontSize: 8 }
  );

  // --- Detalle de materiales ---
  tituloSeccion("DETALLE DE MATERIALES");
  const cols: { titulo: string; w: number; valor: string }[] = [
    { titulo: "Ítem", w: 10, valor: "1" },
    { titulo: "Código", w: 24, valor: datos.codigo },
    { titulo: "Descripción", w: 55, valor: datos.descripcion },
    { titulo: "Unidad", w: 16, valor: "UND" },
    { titulo: "Cantidad", w: 18, valor: datos.cantidad },
    { titulo: "Serie / Lote", w: 32, valor: datos.serieLote },
    { titulo: "Observaciones", w: contentW - (10 + 24 + 55 + 16 + 18 + 32), valor: "" },
  ];
  const hCabecera = 7;
  const hFila = 9;
  let x = MARGEN;
  doc.setDrawColor(...COLOR_BORDE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  for (const c of cols) {
    // El relleno se re-aplica en cada celda porque dibujar texto (linea de
    // abajo) cambia el color de relleno compartido que usa el rect siguiente.
    doc.setFillColor(...COLOR_LABEL_BG);
    doc.rect(x, y, c.w, hCabecera, "FD");
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(c.titulo, x + c.w / 2, y + 4.7, { align: "center", maxWidth: c.w - 2 });
    x += c.w;
  }
  y += hCabecera;
  x = MARGEN;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const c of cols) {
    doc.rect(x, y, c.w, hFila, "D");
    const lineas = doc.splitTextToSize(c.valor || "", c.w - 2);
    doc.text(lineas, x + c.w / 2, y + 5.5, { align: "center", maxWidth: c.w - 2 });
    x += c.w;
  }
  y += hFila;

  // --- Control y autorizacion ---
  tituloSeccion("CONTROL Y AUTORIZACIÓN");
  const colW = contentW / 3;
  const titulos = ["ENTREGÓ (Almacén / responsable)", "RECIBIÓ (Nombre y firma)", "AUTORIZÓ (Jefe / responsable)"];
  const hTitAut = 8;
  x = MARGEN;
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

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  const notas = doc.splitTextToSize(
    "Notas: Registrar cantidades entregadas y verificar el estado de los materiales. La firma de recibido confirma la entrega física.",
    contentW
  );
  doc.text(notas, MARGEN, y);

  // --- Pie de pagina (cinta decorativa + contacto) ---
  const pageH = doc.internal.pageSize.getHeight();
  const ribbonW = 70;
  const ribbonH = ribbonW / RIBBON_RATIO;
  const footerY = pageH - 20;
  doc.addImage(RIBBON_PIE_PNG, "PNG", pageW - ribbonW - MARGEN, footerY - ribbonH + 6, ribbonW, ribbonH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text("Contacto: Av. Carrera 40 No. 20A - 44 Piso 5 · Tel.: +57 601 7184570", MARGEN, footerY + 2);
  doc.text("Email: info@inteegra.co · Bogotá, Colombia", MARGEN, footerY + 6);

  return doc;
}

function nombreArchivo(datos: DatosRemision): string {
  return `${datos.numero}.pdf`;
}

export function descargarRemisionPdf(datos: DatosRemision): void {
  construirRemisionPdf(datos).save(nombreArchivo(datos));
}

export function abrirRemisionPdf(datos: DatosRemision): void {
  const url = construirRemisionPdf(datos).output("bloburl");
  window.open(url, "_blank");
}
