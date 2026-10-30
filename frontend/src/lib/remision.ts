import jsPDF from "jspdf";
import { supabase } from "../api/supabaseClient";

// Recrea el formato oficial "Remision_salida_materiales_INTEEGRA.docx"
// (version con una sola tabla de datos combinada). Sin logo ni cinta
// decorativa -- decision del cliente: si una remision mezcla materiales de
// empresas distintas no tiene sentido ponerle el logo de una sola marca.

export interface ItemRemision {
  codigo: string;
  descripcion: string;
  cantidad: string;
  serieLote: string;
  // Observacion propia de este material (no de toda la remision) -- ver
  // discusion 2026-10-30. Opcional, va en la columna "Observaciones" de la
  // tabla de detalle, no en el resto del documento.
  observaciones?: string;
}

export type TipoMovimientoRemision = "" | "Consumo" | "Traslado" | "Préstamo" | "Alquiler" | "Otro";

export interface DatosRemisionSalida {
  numero: string;
  fechaEntrega: string;
  areaProyecto: string;
  centroCosto: string;
  solicitadoPor: string;
  // Siempre vacio por ahora -- falta que nos pasen la identificacion
  // asociada a cada solicitante.
  identificacion: string;
  destinoUbicacion: string;
  motivoSalida: string;
  tipoMovimiento: TipoMovimientoRemision;
  items: ItemRemision[];
}

const COLOR_TITULO: [number, number, number] = [79, 98, 40]; // #4F6228
const COLOR_SECCION: [number, number, number] = [27, 70, 104]; // #1B4668
const COLOR_LABEL_BG: [number, number, number] = [234, 241, 221]; // #EAF1DD
const COLOR_BORDE: [number, number, number] = [130, 130, 130];
const COLOR_TEXTO: [number, number, number] = [30, 30, 30];

const MARGEN = 14;
const FIRMA_RATIO = 612 / 392;
// Quien entrega es siempre la misma persona -- se llena sola, no depende de
// quien registra la salida en el sistema.
const NOMBRE_ENTREGO = "Xiomara Urueña";
const OPCIONES_TIPO_MOVIMIENTO: Exclude<TipoMovimientoRemision, "">[] = [
  "Consumo",
  "Traslado",
  "Préstamo",
  "Alquiler",
  "Otro",
];

// La firma real de Xiomara ya no vive en el codigo (ver 0028_bucket_privado_
// firma.sql) -- se pide al bucket privado "privado" en el momento de armar
// el PDF, solo accesible con sesion de un usuario activo. Se cachea en
// memoria (dura lo que dure la pestaña abierta) para no volver a pedirla
// cada vez que alguien reimprime una remision. Si la descarga falla por lo
// que sea (sin internet, archivo no subido todavia, etc.) el PDF se genera
// igual, solo que sin la imagen -- no es razon para bloquear la remision.
let firmaXiomaraCache: string | null | undefined;

function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => resolve(lector.result as string);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

async function obtenerFirmaXiomara(): Promise<string | null> {
  if (firmaXiomaraCache !== undefined) return firmaXiomaraCache;
  try {
    const { data, error } = await supabase.storage.from("privado").download("firma-xiomara.jpg");
    if (error || !data) throw error ?? new Error("Descarga vacía");
    firmaXiomaraCache = await blobADataUrl(data);
  } catch (err) {
    console.error("No se pudo cargar la firma para la remisión:", err);
    firmaXiomaraCache = null;
  }
  return firmaXiomaraCache;
}

function construirRemisionPdf(datos: DatosRemisionSalida, firmaXiomara: string | null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGEN * 2;
  const labelW = 34;
  const valueW = contentW / 2 - labelW;
  let y = 20;

  function asegurarEspacio(necesario: number) {
    if (y + necesario > pageH - 15) {
      doc.addPage();
      y = 20;
    }
  }

  // --- Titulo ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...COLOR_TITULO);
  doc.text("REMISIÓN DE SALIDA DE MATERIALES", pageW / 2, y, { align: "center" });
  y += 10;

  function tituloSeccion(texto: string) {
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_SECCION);
    doc.text(texto, MARGEN, y);
    y += 3.5;
  }

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

  // --- DATOS DE ENTREGA ---
  tituloSeccion("DATOS DE ENTREGA");
  filaDoble("N.º REMISIÓN", datos.numero, "FECHA DE ENTREGA", datos.fechaEntrega);
  filaDoble("ÁREA / PROYECTO", datos.areaProyecto, "CENTRO DE COSTO", datos.centroCosto);
  filaDoble("SOLICITADO POR", datos.solicitadoPor, "IDENTIFICACIÓN", datos.identificacion);
  filaSimple("DESTINO / UBICACIÓN", datos.destinoUbicacion);
  const tipoTexto = OPCIONES_TIPO_MOVIMIENTO.map(
    (op) => `[${datos.tipoMovimiento === op ? "X" : " "}] ${op}`
  ).join("   ");
  filaDoble("MOTIVO DE SALIDA", datos.motivoSalida, "TIPO DE MOVIMIENTO", tipoTexto, { fontSize: 8 });

  // --- Detalle de materiales ---
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

  const filas = datos.items.length > 0 ? datos.items : [{ codigo: "", descripcion: "", cantidad: "", serieLote: "" }];
  filas.forEach((item, i) => {
    const valores = [
      String(i + 1),
      item.codigo,
      item.descripcion,
      "UND",
      item.cantidad,
      item.serieLote,
      item.observaciones || "",
    ];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    // Descripcion y Observaciones son las unicas columnas con texto largo
    // que de verdad puede partirse en varias lineas -- la fila crece segun
    // la que mas lineas necesite, para que el texto nunca se monte sobre la
    // fila de abajo (antes la altura era fija y una observacion larga se
    // salia de su fila).
    const lineasPorColumna = cols.map((c, idx) => doc.splitTextToSize(valores[idx] || "", c.w - 2));
    const maxLineas = Math.max(...lineasPorColumna.map((l) => l.length), 1);
    const alturaFila = Math.max(hFila, maxLineas * 4 + 5);
    asegurarEspacio(alturaFila);

    let x = MARGEN;
    cols.forEach((c, idx) => {
      doc.rect(x, y, c.w, alturaFila, "D");
      doc.text(lineasPorColumna[idx], x + c.w / 2, y + 5.5, { align: "center", maxWidth: c.w - 2 });
      x += c.w;
    });
    y += alturaFila;
  });

  // --- Control y autorizacion ---
  asegurarEspacio(5 + 8 + 36);
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

  // Mas alta que antes para que la firma de quien entrega quepa en el mismo
  // orden (Nombre / Firma / Fecha) que las otras dos columnas, no al lado.
  const hCuerpoAut = 36;
  x = MARGEN;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (let i = 0; i < 3; i++) {
    doc.rect(x, y, colW, hCuerpoAut, "D");
    if (i === 0) {
      doc.text(`Nombre: ${NOMBRE_ENTREGO}`, x + 3, y + 7);
      doc.text("Firma:", x + 3, y + 13);
      const firmaW = 22;
      const firmaH = firmaW / FIRMA_RATIO;
      if (firmaXiomara) doc.addImage(firmaXiomara, "JPEG", x + 3, y + 14, firmaW, firmaH);
      doc.text(`Fecha: ${datos.fechaEntrega}`, x + 3, y + 14 + firmaH + 5);
    } else {
      doc.text("Nombre: ______________________", x + 3, y + 9);
      doc.text("Firma: ________________________", x + 3, y + 19);
      doc.text("Fecha: ________________________", x + 3, y + 29);
    }
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

  return doc;
}

function nombreArchivo(datos: DatosRemisionSalida): string {
  return `${datos.numero}.pdf`;
}

export async function descargarRemisionPdf(datos: DatosRemisionSalida): Promise<void> {
  const firma = await obtenerFirmaXiomara();
  construirRemisionPdf(datos, firma).save(nombreArchivo(datos));
}

export async function abrirRemisionPdf(datos: DatosRemisionSalida): Promise<void> {
  // window.open hay que llamarlo apenas entra (todavia dentro del gesto del
  // click) -- si se espera a tener la firma primero, algunos navegadores
  // (Safari sobre todo) tratan el popup como no solicitado por el usuario y
  // lo bloquean en silencio. Se abre una pestaña en blanco de una vez y se
  // le pone la URL real cuando ya este lista.
  const ventana = window.open("", "_blank");
  const firma = await obtenerFirmaXiomara();
  const url = construirRemisionPdf(datos, firma).output("bloburl").toString();
  if (ventana) ventana.location.href = url;
  else window.open(url, "_blank");
}
