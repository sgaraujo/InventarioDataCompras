import type { AccionAuditoria, Estado, EstadoDevolucion, EstadoDisponibilidad, EstadoMovimiento, EstadoSolicitud, FaseCierre, Rol, TipoEventoDevolucion, TipoEventoSolicitud, Usuario } from "../api/types";

export const ESTADO_LABEL: Record<Estado, string> = {
  ok: "OK",
  bajo_minimo: "Bajo mínimo",
  sin_existencias: "Sin existencias",
};

export const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  almacenista: "Almacenista",
  consulta: "Consulta",
  supervisor: "Supervisor",
  "tecnico-ejecutor": "Técnico",
  coordinador: "Coordinador",
};

// El coordinador puede hacer todo lo que hace admin (ver esAdminEquivalente
// en src/middleware/auth.js, la misma regla del lado del backend) -- se usa
// en vez de comparar "rol === admin" a mano en cada pantalla, para que
// coordinador vea exactamente lo mismo que admin en toda la UI.
export function esAdmin(usuario: Usuario | null | undefined): boolean {
  return usuario?.rol === "admin" || usuario?.rol === "coordinador";
}

export const ESTADO_SOLICITUD_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  lista: "Material OK",
  cancelada: "Cancelada",
};

export const ESTADO_MOVIMIENTO_LABEL: Record<EstadoMovimiento, string> = {
  lista: "Material OK",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  baja: "Baja de material",
  devolucion: "Devuelto a stock",
};

export const EVENTO_SOLICITUD_LABEL: Record<TipoEventoSolicitud, string> = {
  creada: "Creada",
  rechazada: "Rechazada",
  reenviada: "Reenviada",
  aprobada: "Aprobada",
  lista: "Material OK",
  cancelada: "Cancelada",
  material_agregado: "Material agregado",
};

export const ESTADO_DEVOLUCION_LABEL: Record<EstadoDevolucion, string> = {
  sin_reportar: "Pendiente de reportar",
  pendiente_correccion: "Pendiente corrección del solicitante",
  pendiente_aprobacion: "Pendiente aprobación supervisor",
  pendiente_disposicion: "Pendiente disposición",
  cerrada: "Cerrada",
};

export const EVENTO_DEVOLUCION_LABEL: Record<TipoEventoDevolucion, string> = {
  reportado: "Reportado",
  rechazado: "Rechazado",
  aprobado: "Aprobado",
  finalizado: "Finalizado",
  pasado_a_calidad: "Pasó a Calidad",
  regresado_a_cerrada: "Regresó a Cerrada",
  pasado_a_finalizado: "Pasó a Finalizado",
  facturado: "Facturado",
};

// Fase posterior a "Cerrada" (2026-09-01, en pruebas): manda sobre
// ESTADO_DEVOLUCION_LABEL cuando tiene valor -- ver FaseCierre en types.ts.
export const FASE_CIERRE_LABEL: Record<FaseCierre, string> = {
  calidad: "Calidad",
  finalizado: "Finalizado",
  facturado: "Facturado",
};

export const ACCION_LABEL: Record<AccionAuditoria, string> = {
  crear: "Creación",
  actualizar: "Actualización",
  eliminar: "Eliminación",
};

export const ENTIDAD_LABEL: Record<string, string> = {
  materiales: "Material",
  movimientos: "Movimiento",
  usuarios: "Usuario",
  categorias: "Categoría",
  proveedores: "Proveedor",
  almacenes: "Almacén",
  solicitudes_salida: "Solicitud de salida",
  solicitud_salida_devoluciones: "Devolución de material",
  herramientas: "Herramienta",
  prestamos_herramienta: "Préstamo de herramienta",
};

export const ESTADO_DISPONIBILIDAD_LABEL: Record<EstadoDisponibilidad, string> = {
  disponible: "Disponible",
  agotada: "Agotada",
};

export function money(n: string | number): string {
  return Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

export function moneda(n: string | number | null): string {
  if (n === null || n === "") return "—";
  return "$" + Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}
