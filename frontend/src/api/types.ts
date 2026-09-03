// Roles heredados de ProyectoDatacenter (almacenista, tecnico-ejecutor...) se
// mantienen por ahora porque las paginas viejas del dominio de materiales
// (Usuarios.tsx, Auditoria.tsx, Trazabilidad.tsx) todavia los referencian --
// se limpian cuando esas paginas se reescriban para compras. Los roles reales
// del nuevo dominio (respaldados por la tabla perfiles en Supabase, ver
// supabase/migrations/0001_init.sql) son admin/comprador/aprobador/consulta.
export type Rol =
  | "admin"
  | "comprador"
  | "aprobador"
  | "consulta"
  | "almacenista"
  | "supervisor"
  | "tecnico-ejecutor"
  | "coordinador";

// Perfil en Supabase (tabla "perfiles", enlazada 1:1 a auth.users por id) +
// el email que vive en Supabase Auth, no en la tabla propia.
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creado_en: string;
}

export interface Categoria {
  id: number;
  nombre: string;
  creado_en: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  creado_en: string;
}

export interface Almacen {
  id: number;
  nombre: string;
  ubicacion: string | null;
  responsable: string | null;
  activo: boolean;
  creado_en: string;
}

export type Estado = "ok" | "bajo_minimo" | "sin_existencias";

export interface Material {
  id: number;
  codigo: string | null; // Codigo SAP
  numero_parte: string | null;
  producto: string;
  unidad: string;
  categoria_id: number | null;
  categoria_nombre: string | null;
  proveedores: { id: number; nombre: string }[];
  almacen_id: number | null;
  almacen_nombre: string | null;
  valor_unitario: string | null;
  valor_total: string | null;
  marca: string | null;
  grupo: string[];
  modelo: string | null;
  serial: string | null;
  stock_minimo: string;
  stock_actual: string;
  creado_en: string;
  estado: Estado;
  activo: boolean;
}

export type TipoMovimiento = "entrada" | "salida";

// Estado propio del historial combinado de Movimientos -- no es lo mismo que
// EstadoSolicitud (que es el estado real de una solicitud_salida). "baja" no
// existe como estado de una solicitud, es especifico de una fila sintetica de
// este historial (sobrante que el almacenista decidio no sumar a stock).
export type EstadoMovimiento = "lista" | "rechazada" | "cancelada" | "baja" | "devolucion";

export interface Movimiento {
  id: number;
  material_id: number;
  producto: string;
  unidad: string;
  tipo: TipoMovimiento;
  cantidad: string;
  proveedor_id: number | null;
  proveedor_nombre: string | null;
  rf_relacionada: string | null;
  responsable: string | null;
  observaciones: string | null;
  numero_orden: string | null; // OE-001 (entradas) u OS-001 (salidas, heredado de la solicitud)
  creado_en: string;
  // "lista" para salidas que ya llegaron a "Material OK", "rechazada"/"cancelada"
  // para lineas de una solicitud que no llegaron a moverse de verdad, "baja" para
  // un sobrante de devolucion que el almacenista no sumo a stock. Las entradas
  // normales no pasan por ninguno de estos casos, por eso null.
  estado: EstadoMovimiento | null;
}

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "lista" | "cancelada";

export interface SolicitudSalidaItem {
  id: number;
  material_id: number;
  producto: string;
  unidad: string;
  cantidad: string;
}

export type TipoEventoSolicitud =
  | "creada"
  | "rechazada"
  | "reenviada"
  | "aprobada"
  | "lista"
  | "cancelada"
  | "material_agregado";

export interface SolicitudSalidaEvento {
  id: number;
  tipo: TipoEventoSolicitud;
  usuario_nombre: string | null;
  nota: string | null;
  creado_en: string;
}

// Persona que recibe el material en persona (distinta de "responsable" y de
// "solicitado_por") -- no necesariamente tiene usuario en el sistema, por eso
// es una lista propia que va llenando el supervisor/admin al crear.
export interface Destinatario {
  id: number;
  nombre: string;
}

export interface SolicitudSalida {
  id: number;
  numero_orden: string | null; // OS-001
  rf_relacionada: string; // antes "ref_relacionada"/"otp_relacionada" / campo visible "RF" (antes "REF")
  responsable: string | null;
  observaciones: string | null;
  estado: EstadoSolicitud;
  solicitado_por: number | null;
  solicitado_por_nombre: string | null;
  destinatario_id: number | null;
  destinatario_nombre: string | null; // null = "N/A" (tecnico, no aplica)
  creado_en: string;
  items: SolicitudSalidaItem[];
  eventos: SolicitudSalidaEvento[];
  visto_tecnico: boolean; // el tecnico ya leyo alguna notificacion sobre este ticket
  visto_supervisor: boolean; // algun supervisor ya leyo alguna notificacion sobre este ticket
  visto_almacenista: boolean; // algun almacenista ya leyo alguna notificacion sobre este ticket
  foto_evidencia: string | null; // nombre de archivo; se sube al alistar (GET /:id/foto para verla)
  adjunto: string | null; // nombre de archivo (imagen o PDF); obligatorio al crear (GET /:id/adjunto para verlo)
}

// Fase posterior a "Cerrada" (2026-09-01, en pruebas): Calidad -> Finalizado
// -> Facturado. Aparte de EstadoDevolucion (que sigue siendo por item) --
// cuando tiene valor, manda sobre estado_devolucion para lo que se muestra.
export type FaseCierre = "calidad" | "finalizado" | "facturado";

export interface DevolucionSolicitud {
  id: number;
  numero_orden: string | null;
  rf_relacionada: string;
  responsable: string | null;
  observaciones: string | null;
  estado: EstadoSolicitud;
  fase_cierre: FaseCierre | null;
  solicitado_por: number | null;
  solicitado_por_nombre: string | null;
  destinatario_nombre: string | null;
  foto_evidencia: string | null;
  creado_en: string;
}

export type EstadoDevolucion =
  | "sin_reportar"
  | "pendiente_correccion"
  | "pendiente_aprobacion"
  | "pendiente_disposicion"
  | "cerrada";

export interface DevolucionResumen {
  id: number; // id de la solicitud
  numero_orden: string | null;
  rf_relacionada: string;
  fase_cierre: FaseCierre | null;
  solicitado_por: number | null;
  solicitado_por_nombre: string | null;
  destinatario_nombre: string | null;
  creado_en: string;
  total_items: string;
  items_reportados: string;
  items_pendientes_aprobacion: string;
  items_rechazados: string;
  items_pendientes: string;
  items_cerrados: string;
  estado_devolucion: EstadoDevolucion;
}

export type EstadoItemDevolucion = "pendiente_aprobacion_supervisor" | "rechazado" | "pendiente_disposicion" | "cerrado";
export type DisposicionDevolucion = "stock" | "desecho";

export interface DevolucionItem {
  item_id: number;
  material_id: number;
  producto: string;
  unidad: string;
  cantidad_solicitada: string;
  devolucion_id: number | null;
  cantidad_usada: string | null;
  cantidad_sobrante: string | null;
  estado: EstadoItemDevolucion | null;
  disposicion: DisposicionDevolucion | null;
  reportado_por: number | null;
  reportado_por_nombre: string | null;
  reportado_en: string | null;
  motivo_rechazo: string | null;
  rechazado_por: number | null;
  rechazado_por_nombre: string | null;
  rechazado_en: string | null;
  aprobado_por: number | null;
  aprobado_por_nombre: string | null;
  aprobado_en: string | null;
  decidido_por: number | null;
  decidido_por_nombre: string | null;
  decidido_en: string | null;
}

export type TipoEventoDevolucion =
  | "reportado"
  | "rechazado"
  | "aprobado"
  | "finalizado"
  | "pasado_a_calidad"
  | "regresado_a_cerrada"
  | "pasado_a_finalizado"
  | "facturado";

export interface DevolucionEvento {
  id: number;
  tipo: TipoEventoDevolucion;
  usuario_nombre: string | null;
  nota: string | null;
  creado_en: string;
}

export interface DevolucionDetalle {
  solicitud: DevolucionSolicitud;
  eventos: DevolucionEvento[];
  items: DevolucionItem[];
}

export interface Notificacion {
  id: number;
  usuario_id: number;
  mensaje: string;
  leida: boolean;
  entidad: string | null;
  entidad_id: number | null;
  creado_en: string;
}

export type AccionAuditoria = "crear" | "actualizar" | "eliminar";

export interface RegistroAuditoria {
  id: number;
  usuario_id: number | null;
  usuario_nombre: string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id: number | null;
  detalles: Record<string, unknown> | null;
  creado_en: string;
}

// Modulo de Herramientas retornables: catalogo propio, aparte de Material.
// Aca no hay "consumo" -- una herramienta se presta y despues vuelve.
export type EstadoFisico = "Nuevo" | "Bueno" | "Regular" | "Malo";
export type EstadoDevolucionHerramienta = EstadoFisico | "Perdido";
export type EstadoDisponibilidad = "disponible" | "agotada";
export type EstadoPrestamo = "prestado" | "devuelto";

export interface Herramienta {
  id: number;
  descripcion: string;
  marca: string | null;
  modelo: string | null;
  serial: string | null;
  material: string | null;
  empaque: string | null;
  accesorios: string | null;
  estado_fisico: EstadoFisico;
  cantidad_total: string;
  cantidad_disponible: string;
  creado_en: string;
  estado: EstadoDisponibilidad;
}

// Proyeccion liviana de Usuario (solo lo que hace falta para elegir a quien
// recibe un prestamo) -- devuelta por GET /api/herramientas/receptores, al
// que solo tecnicos y supervisores activos llegan.
export interface Receptor {
  id: number;
  nombre: string;
  rol: Rol;
}

export interface PrestamoHerramienta {
  id: number;
  herramienta_id: number;
  herramienta_descripcion: string;
  herramienta_marca: string | null;
  herramienta_modelo: string | null;
  cantidad: string;
  recibe_usuario_id: number;
  recibe_nombre: string;
  recibe_rol: Rol;
  rf_relacionada: string | null;
  estado_entrega: EstadoFisico;
  observaciones: string | null;
  prestado_por: number | null;
  prestado_por_nombre: string | null;
  prestado_en: string;
  estado: EstadoPrestamo;
  estado_devolucion: EstadoDevolucionHerramienta | null;
  observaciones_devolucion: string | null;
  devuelto_por: number | null;
  devuelto_por_nombre: string | null;
  devuelto_en: string | null;
}

// Una fila por RF con la fecha (y quien) de cada hito de su recorrido
// completo -- se arma uniendo eventos de Salidas y de Devoluciones por
// solicitud_id, sin fusionar esas tablas (ver memoria del diseño).
export interface TrazabilidadRf {
  id: number;
  numero_orden: string | null;
  rf_relacionada: string;
  estado_salida: EstadoSolicitud;
  estado_devolucion: EstadoDevolucion | null; // null si nunca llego a Material OK
  fase_cierre: FaseCierre | null; // manda sobre estado_devolucion cuando tiene valor
  estado_actual: string; // ya calculado y traducido por el backend
  creado_en: string;
  solicitado_por_nombre: string | null;
  destinatario_nombre: string | null;
  items: {
    item_id: number;
    producto: string;
    unidad: string;
    cantidad: string;
  }[];
  // facturacion_items/total_facturacion/facturacion_estado solo vienen si el
  // usuario es admin/coordinador -- para el resto de roles el backend ni
  // siquiera manda esos campos (informacion financiera). Son lineas sueltas
  // (item de la LPU + cantidad) que el coordinador arma aparte, SIN relacion
  // con los materiales de la RF de arriba (ver solicitud_facturacion_items).
  facturacion_items?: {
    id: number;
    lpu_id: number;
    lpu_nombre: string;
    lpu_nombre_alternativo: string | null;
    unidad_medida: string | null;
    precio_unitario: string;
    cantidad: string;
  }[];
  total_facturacion?: number;
  facturacion_estado?: "completo" | "pendiente";
  creada_en: string | null;
  creada_por: string | null;
  aprobada_en: string | null;
  aprobada_por: string | null;
  lista_en: string | null;
  lista_por: string | null;
  reportado_en: string | null;
  reportado_por: string | null;
  cerrada_en: string | null;
  cerrada_por: string | null;
  calidad_en: string | null;
  calidad_por: string | null;
  finalizado_en: string | null;
  finalizado_por: string | null;
  facturado_en: string | null;
  facturado_por: string | null;
}

// Graficos del Dashboard (2026-09-02, en pruebas) -- "mes" siempre en
// formato "YYYY-MM", ya viene con los ultimos 6 meses completos (incluso en
// 0) desde el backend, ver GET /api/movimientos/resumen-mensual.
export interface ResumenMensualMovimientos {
  mes: string;
  entradas: number;
  salidas: number;
}

export interface ResumenEstadoSolicitudes {
  estado: EstadoSolicitud;
  total: number;
}

// "periodo" es "YYYY-MM" si granularidad es "mes", o "YYYY-MM-DD" si es
// "dia" -- el backend decide segun el tamaño del rango filtrado (ver
// resolverRangoFacturacion en trazabilidad.js): sin filtro, o con un rango
// largo, agrupa por mes; con un rango corto (<=31 dias), agrupa por dia --
// para que filtrar 1-2 dias no siga trayendo el mes completo.
export interface ResumenFacturacion {
  granularidad: "dia" | "mes";
  datos: { periodo: string; total: number }[];
}

// "estado" aca es el mismo codigo que devuelve codigoEstado() en
// Trazabilidad.tsx (estado_salida, o fase_cierre, o estado_devolucion segun
// la misma precedencia) -- una union de EstadoSolicitud | FaseCierre |
// EstadoDevolucion en un solo string, se tipa suelto para no repetir esa
// union aca (se usa solo como llave de un mapa de color/label).
export interface ResumenEstadoTrazabilidad {
  estado: string;
  total: number;
}

export interface ResumenDiarioAuditoria {
  fecha: string;
  total: number;
}

export interface ResumenAccionAuditoria {
  accion: AccionAuditoria;
  total: number;
}

// Lista de Precios Unitarios (LPU, 2026-09-01, en pruebas): catalogo fijo
// importado una sola vez desde Excel (ver db/importar_lpu.js) -- solo
// admin/coordinador la consultan, para facturar cada RF en Trazabilidad.
export interface Lpu {
  id: number;
  nombre: string;
  nombre_alternativo: string | null;
  unidad_medida: string | null; // ML, UNIDAD, ACTIVIDAD, H:H (HORA HOMBRE)...
  precio_unitario: string;
}

export interface ApiError {
  error: string;
}

// ===========================================================================
// Dominio de compras (nuevo, respaldado por Supabase -- ver
// supabase/migrations/0001_init.sql). Cabecera + lineas + eventos, mismo
// patron que SolicitudSalida en ProyectoDatacenter.
// ===========================================================================

export type EstadoOrdenCompra = "borrador" | "pendiente" | "aprobada" | "rechazada" | "cancelada";

export interface OrdenCompraItem {
  id: number;
  orden_id: number;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  subtotal: string;
}

export type TipoEventoOrdenCompra = "creada" | "enviada_aprobacion" | "aprobada" | "rechazada" | "cancelada";

export interface OrdenCompraEvento {
  id: number;
  orden_id: number;
  tipo: TipoEventoOrdenCompra;
  actor: string | null;
  nota: string | null;
  creado_en: string;
}

export interface OrdenCompra {
  id: number;
  numero: string;
  estado: EstadoOrdenCompra;
  proveedor: string;
  observaciones: string | null;
  total: string;
  creado_por: string;
  creado_en: string;
  items?: OrdenCompraItem[];
  eventos?: OrdenCompraEvento[];
}
