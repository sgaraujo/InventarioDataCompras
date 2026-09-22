// Roles respaldados por la tabla perfiles en Supabase (ver
// supabase/migrations/0002_inventario.sql).
export type Rol = "admin" | "almacenista" | "consulta";

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

export interface Empresa {
  id: number;
  nombre: string;
  creado_en: string;
}

export interface CentroCosto {
  id: number;
  empresa_id: number;
  nombre: string;
  creado_en: string;
}

export interface Solicitante {
  id: number;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

export interface Material {
  id: number;
  codigo: string;
  empresa_id: number;
  empresa_nombre: string;
  centro_costo_id: number | null;
  centro_costo_nombre: string | null;
  descripcion: string;
  ubicacion: string | null;
  // Si es true, este material agrupa varias unidades/referencias
  // individuales (ver MaterialReferencia) -- cada movimiento tiene que
  // elegir cual referencia especifica se mueve, cantidad fija en 1.
  maneja_referencias: boolean;
  stock_actual: number;
  foto: string | null;
  activo: boolean;
  creado_en: string;
}

// Una unidad individual dentro de un material que "maneja_referencias" (ej.
// un generador puntual con su propio codigo de activo y ubicacion, dentro
// del material generico "DUCATI / GENERADORES 8 KVA").
export interface MaterialReferencia {
  id: number;
  material_id: number;
  codigo: string;
  ubicacion: string | null;
  creado_en: string;
}

// Vista material_referencias_estado -- cuanto stock tiene disponible cada
// referencia ahora mismo (una referencia puede tener varias unidades, ej.
// "112313" con 5 en stock), calculado igual que materiales.stock_actual
// pero filtrado por esa referencia -- nunca se guarda a mano.
export interface MaterialReferenciaEstado extends MaterialReferencia {
  stock_disponible: number;
}

export type TipoMovimiento = "entrada" | "salida";

export interface Movimiento {
  id: number;
  // Puede ser null si el material fue eliminado despues -- el historial
  // sigue mostrando codigo/descripcion via material_codigo/material_
  // descripcion (resueltos por mapMovimientoJoin, con snapshot de respaldo).
  material_id: number | null;
  material_codigo: string;
  material_descripcion: string;
  // Solo si el material maneja_referencias -- misma logica de snapshot que
  // material_codigo/material_descripcion (ver mapMovimientoJoin).
  referencia_id: number | null;
  referencia_codigo: string | null;
  tipo: TipoMovimiento;
  cantidad: number;
  solicitante_id: number | null;
  solicitante_nombre: string | null;
  foto: string | null;
  adjunto: string | null;
  acta_entrega: string | null;
  observaciones: string | null;
  registrado_por: string;
  creado_en: string;
}

// Version liviana de Movimiento para paneles de "ultimos movimientos"
// (Dashboard, Movimientos) que no necesitan foto/adjunto/observaciones.
export interface MovimientoReciente {
  id: number;
  creado_en: string;
  tipo: TipoMovimiento;
  cantidad: number;
  material_descripcion: string;
  solicitante_nombre: string | null;
}

// Resultado de la funcion RPC resumen_movimientos_mensual() -- entradas y
// salidas totales agrupadas por mes, para el grafico del Dashboard.
export interface ResumenMensualMovimientos {
  mes: string;
  entradas: number;
  salidas: number;
}
