import type { TipoMovimiento } from "../api/types";

// Campos minimos que necesita agruparMovimientos() -- tanto Movimiento
// (Historial) como MovimientoReciente (panel de "Ultimos movimientos")
// cumplen esta forma, asi que la misma funcion sirve para las dos pantallas.
export interface ItemAgrupable {
  id: number;
  creado_en: string;
  tipo: TipoMovimiento;
  cantidad: number;
  material_codigo: string;
  material_descripcion: string;
  referencia_codigo: string | null;
  solicitante_nombre: string | null;
  observaciones: string | null;
  foto: string | null;
  adjunto: string | null;
  ubicacion: string | null;
  ubicacion_origen: string | null;
  remision_numero: number | null;
  area_proyecto: string | null;
  centro_costo_texto: string | null;
  motivo_salida: string | null;
  tipo_movimiento: string | null;
}

// Una fila para mostrar: puede ser un movimiento suelto (esGrupo = false,
// items tiene 1 elemento) o varios movimientos que se registraron juntos en
// la misma Entrada/Salida (mismo remision_numero, esGrupo = true). Los
// campos que varian entre los items del grupo (material, referencia,
// cantidad) quedan en null para que la pantalla muestre "—" o "Varios";
// los que son iguales en todos (solicitante, observaciones, ubicacion,
// foto/adjunto, datos de la remision) se toman del primero porque siempre
// coinciden -- son el mismo valor que se escribio una sola vez al registrar.
export interface FilaMovimiento<T extends ItemAgrupable> {
  id: string;
  esGrupo: boolean;
  creado_en: string;
  tipo: TipoMovimiento;
  materialCodigo: string | null;
  materialDescripcion: string | null;
  materialesDistintos: number;
  referenciaCodigo: string | null;
  cantidad: number | null;
  solicitanteNombre: string | null;
  observaciones: string | null;
  foto: string | null;
  adjunto: string | null;
  ubicacion: string | null;
  ubicacionOrigen: string | null;
  remisionNumero: number | null;
  areaProyecto: string | null;
  centroCostoTexto: string | null;
  motivoSalida: string | null;
  tipoMovimientoRemision: string | null;
  items: T[];
}

function valorUniforme<V>(valores: V[]): V | null {
  const primero = valores[0];
  return valores.every((v) => v === primero) ? (primero ?? null) : null;
}

function filaDesdeItems<T extends ItemAgrupable>(items: T[], lote: number | null): FilaMovimiento<T> {
  const base = items[0];
  const masReciente = items.reduce((max, i) => (i.creado_en > max.creado_en ? i : max), base);
  return {
    id: lote != null ? `lote-${lote}` : `m-${base.id}`,
    esGrupo: items.length > 1,
    creado_en: masReciente.creado_en,
    tipo: base.tipo,
    materialCodigo: valorUniforme(items.map((i) => i.material_codigo)),
    materialDescripcion: valorUniforme(items.map((i) => i.material_descripcion)),
    materialesDistintos: new Set(items.map((i) => i.material_codigo)).size,
    referenciaCodigo: valorUniforme(items.map((i) => i.referencia_codigo)),
    cantidad: valorUniforme(items.map((i) => i.cantidad)),
    solicitanteNombre: base.solicitante_nombre,
    observaciones: base.observaciones,
    foto: base.foto,
    adjunto: base.adjunto,
    ubicacion: base.ubicacion,
    ubicacionOrigen: base.ubicacion_origen,
    remisionNumero: lote,
    areaProyecto: base.area_proyecto,
    centroCostoTexto: base.centro_costo_texto,
    motivoSalida: base.motivo_salida,
    tipoMovimientoRemision: base.tipo_movimiento,
    items,
  };
}

// Agrupa los movimientos que comparten remision_numero (2 o mas) en una
// sola fila; los que estan solos (remision_numero null, o un numero que
// solo tiene un movimiento) quedan como fila individual. Devuelve todo
// ordenado por fecha, mas reciente primero.
export function agruparMovimientos<T extends ItemAgrupable>(movs: T[]): FilaMovimiento<T>[] {
  const porLote = new Map<number, T[]>();
  for (const m of movs) {
    if (m.remision_numero == null) continue;
    const arr = porLote.get(m.remision_numero) ?? [];
    arr.push(m);
    porLote.set(m.remision_numero, arr);
  }

  const idsAgrupados = new Set<number>();
  const filas: FilaMovimiento<T>[] = [];
  for (const [lote, items] of porLote) {
    if (items.length < 2) continue;
    for (const it of items) idsAgrupados.add(it.id);
    filas.push(filaDesdeItems(items, lote));
  }
  for (const m of movs) {
    if (idsAgrupados.has(m.id)) continue;
    // Antes se forzaba "null" aca, lo que le borraba el remision_numero a
    // cualquier Salida que quedara sola (sin agrupar con otras) -- por eso
    // nunca le aparecia el link para volver a ver su remision, aunque el
    // dato si estuviera guardado. Se le pasa el remision_numero real del
    // propio movimiento (sigue siendo null si de verdad no tiene uno).
    filas.push(filaDesdeItems([m], m.remision_numero));
  }

  filas.sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime());
  return filas;
}
