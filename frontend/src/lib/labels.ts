import type { Rol, Usuario } from "../api/types";

export const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  almacenista: "Almacenista",
  consulta: "Consulta",
};

export function esAdmin(usuario: Usuario | null | undefined): boolean {
  return usuario?.rol === "admin";
}

// Quien puede crear/editar materiales y registrar movimientos -- admin y
// almacenista (ver perfiles_rol_check en el esquema). "consulta" es de solo
// lectura en toda la app.
export function puedeEditar(usuario: Usuario | null | undefined): boolean {
  return usuario?.rol === "admin" || usuario?.rol === "almacenista";
}

export function money(n: string | number): string {
  return Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

// Para un movimiento de salida de un material SIN referencias, muestra "De X
// a Y" (ubicacion_origen solo se guarda en ese caso -- ver migracion
// 0021_ubicacion_origen_materiales_sin_referencia.sql). En cualquier otro
// caso (entrada, o salida de una referencia puntual) muestra solo el valor
// guardado, o "—" si no hay nada.
export function textoUbicacionMovimiento(m: { ubicacion: string | null; ubicacion_origen: string | null }): string {
  if (m.ubicacion_origen) return `De ${m.ubicacion_origen} a ${m.ubicacion}`;
  return m.ubicacion || "—";
}
