// Mapeo compartido de una fila de "movimientos" con sus joins a
// materiales/solicitantes resueltos -- usado por cualquier pantalla que
// traiga movimientos con ese join, para que no se dupliquen los mismos
// campos calculados (material_codigo, material_descripcion,
// solicitante_nombre) en cada pantalla.
export function mapMovimientoJoin(m: any) {
  return {
    ...m,
    material_codigo: (m.materiales as { codigo: string } | null)?.codigo ?? "—",
    material_descripcion: (m.materiales as { descripcion: string } | null)?.descripcion ?? "—",
    solicitante_nombre: (m.solicitantes as { nombre: string } | null)?.nombre ?? null,
  };
}
