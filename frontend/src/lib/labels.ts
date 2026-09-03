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
