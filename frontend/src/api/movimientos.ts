// Mapeo compartido de una fila de "movimientos" con sus joins a
// materiales/solicitantes resueltos -- usado por cualquier pantalla que
// traiga movimientos con ese join, para que no se dupliquen los mismos
// campos calculados (material_codigo, material_descripcion,
// solicitante_nombre) en cada pantalla.
//
// El material se puede eliminar despues (ver 0007_eliminar_material_conserva_
// historial.sql) sin borrar su historial -- ahi el join a materiales viene
// null, y se usa la "foto" que quedo guardada en el propio movimiento
// (material_codigo_snapshot/material_descripcion_snapshot) para que el
// historial nunca deje de decir que material era.
export function mapMovimientoJoin(m: any) {
  const material = m.materiales as { codigo: string; descripcion: string } | null;
  const referencia = m.material_referencias as { codigo: string } | null;
  return {
    ...m,
    material_codigo: material?.codigo ?? m.material_codigo_snapshot ?? "—",
    material_descripcion: material?.descripcion ?? m.material_descripcion_snapshot ?? "Material eliminado",
    referencia_codigo: referencia?.codigo ?? m.referencia_codigo_snapshot ?? null,
    solicitante_nombre: (m.solicitantes as { nombre: string } | null)?.nombre ?? null,
  };
}
