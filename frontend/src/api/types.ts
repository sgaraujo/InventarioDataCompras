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
  stock_actual: number;
  foto: string | null;
  activo: boolean;
  creado_en: string;
}

export type TipoMovimiento = "entrada" | "salida";

export interface Movimiento {
  id: number;
  material_id: number;
  material_codigo: string;
  material_descripcion: string;
  tipo: TipoMovimiento;
  cantidad: number;
  solicitante_id: number | null;
  solicitante_nombre: string | null;
  foto: string | null;
  adjunto: string | null;
  observaciones: string | null;
  registrado_por: string;
  creado_en: string;
}

// Resultado de la funcion RPC resumen_movimientos_mensual() -- entradas y
// salidas totales agrupadas por mes, para el grafico del Dashboard.
export interface ResumenMensualMovimientos {
  mes: string;
  entradas: number;
  salidas: number;
}
