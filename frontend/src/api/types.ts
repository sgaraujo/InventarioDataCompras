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

// Modulo Galeria (ver 0026_galeria.sql): carpetas con nombre libre,
// opcionalmente asociadas a una remision de salida, con sus fotos.
export interface GaleriaCarpeta {
  id: number;
  nombre: string;
  remision_numero: number | null;
  creado_en: string;
  total_fotos: number;
}

export interface GaleriaFoto {
  id: number;
  carpeta_id: number;
  url: string;
  nombre_archivo: string | null;
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
  // Numero de lote compartido por todos los movimientos que se registraron
  // juntos en una misma Entrada (varias referencias) o Salida (varios
  // materiales) -- ver supabase/migrations/0025_remision_campos_salida.sql.
  // En Salida es ademas el numero impreso en la remision ("REM-000123");
  // en Entrada solo sirve para agrupar la vista en Historial/Ultimos
  // movimientos, no genera documento.
  remision_numero: number | null;
  // Los siguientes 4 solo se llenan en Salida, para la remision -- ver
  // lib/remision.ts.
  area_proyecto: string | null;
  centro_costo_texto: string | null;
  motivo_salida: string | null;
  tipo_movimiento: string | null;
  registrado_por: string;
  creado_en: string;
}

// Version liviana de Movimiento para paneles de "ultimos movimientos"
// (Dashboard, Movimientos) y para Historial agrupado -- trae lo necesario
// para agrupar varias filas en una (ver lib/agruparMovimientos.ts) y volver
// a generar la remision desde ahi, sin el acta_entrega/registrado_por que
// no hacen falta en ninguna de las dos pantallas.
export interface MovimientoReciente {
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

// Resultado de la funcion RPC resumen_movimientos_mensual() -- entradas y
// salidas totales agrupadas por mes, para el grafico del Dashboard.
export interface ResumenMensualMovimientos {
  mes: string;
  entradas: number;
  salidas: number;
}
