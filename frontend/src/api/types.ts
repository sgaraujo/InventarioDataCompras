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

// Catalogo de categorias de material (Equipos, Herramienta, Consumibles,
// Activos Fijos...). Cualquiera las ve, pero solo admin puede crear una
// nueva (ver RLS en 0023_categorias.sql).
export interface Categoria {
  id: number;
  nombre: string;
  creado_en: string;
}

export interface Material {
  id: number;
  codigo: string;
  empresa_id: number;
  empresa_nombre: string;
  centro_costo_id: number | null;
  centro_costo_nombre: string | null;
  categoria_id: number | null;
  categoria_nombre: string | null;
  descripcion: string;
  ubicacion: string | null;
  // Si es true, este material agrupa varias unidades/referencias
  // individuales (ver MaterialReferencia) -- cada movimiento tiene que
  // elegir cual referencia especifica se mueve, cantidad fija en 1.
  maneja_referencias: boolean;
  stock_actual: number;
  foto: string | null;
  // Precio de adquisicion por unidad -- opcional, solo lo puede poner/
  // cambiar el rol admin (ver trigger restringir_precio_a_admin()). El valor
  // total (precio * stock_actual) se calcula en el momento, nunca se guarda.
  precio_unitario: number | null;
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
  // URL publica de la foto de esta referencia puntual (bucket "evidencias").
  foto: string | null;
  creado_en: string;
}

// Vista material_referencias_estado -- cuanto stock tiene disponible cada
// referencia ahora mismo (una referencia puede tener varias unidades, ej.
// "112313" con 5 en stock), calculado igual que materiales.stock_actual
// pero filtrado por esa referencia -- nunca se guarda a mano.
export interface MaterialReferenciaEstado extends MaterialReferencia {
  stock_disponible: number;
  // Mismo precio opcional admin-only que materiales.precio_unitario, pero
  // por cada referencia puntual. valor_total = precio_unitario * stock_disponible,
  // calculado por la vista, nunca guardado.
  precio_unitario: number | null;
  valor_total: number | null;
}

// Documento adjunto a una referencia puntual (certificado, factura,
// manual...) -- puede haber varios por referencia.
export interface MaterialReferenciaDocumento {
  id: number;
  referencia_id: number;
  nombre: string;
  url: string;
  creado_en: string;
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
  // Solo en Salida -- a donde quedo el material. Si la salida es de una
  // referencia puntual, actualiza tambien su ubicacion real de una vez; si es
  // de un material sin referencias, solo queda registrado aca (no se
  // sobreescribe la ubicacion base del material -- ver ubicacion_origen).
  ubicacion: string | null;
  // Solo se llena cuando la salida es de un material SIN referencias: la
  // ubicacion que tenia el material antes de esta salida, para poder mostrar
  // "De X a Y" en Historial/Ultimos movimientos sin depender de que la
  // ubicacion del material no cambie despues.
  ubicacion_origen: string | null;
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
  ubicacion: string | null;
  ubicacion_origen: string | null;
}

// Resultado de la funcion RPC resumen_movimientos_mensual() -- entradas y
// salidas totales agrupadas por mes, para el grafico del Dashboard.
export interface ResumenMensualMovimientos {
  mes: string;
  entradas: number;
  salidas: number;
}
