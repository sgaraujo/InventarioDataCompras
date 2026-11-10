# InventarioDataCompras

Sistema de control de inventario (materiales, entradas/salidas) por empresa y
centro de costo, con backend en Supabase. El alcance real salió de la
solicitud del cliente (ver `DESARROLLO INVENTARIO.xlsx`, con sus empresas,
centros de costo, solicitantes y el inventario actual que ya maneja) -- no es
un flujo de compras con aprobación, es control de existencias.

Ver `GUIA_FRONTEND_NUEVO_PROYECTO.md` y `GUIA_BASE_DATOS_SUPABASE.md` para el
detalle de arquitectura general (son la referencia de cómo se armó esto a
partir de ProyectoDatacenter).

## Setup local

1. `cd frontend && npm install`
2. Copiar `frontend/.env.example` a `frontend/.env.local` y completar con las
   credenciales del proyecto de Supabase (pidele a quien tenga acceso al
   dashboard la Project URL y la Publishable/anon key -- no son secretas, pero
   son propias de este proyecto):
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. Pide que te creen un usuario en Supabase (Authentication -> Users -> Add
   user, con "Auto Confirm User" marcado) con tu email y una contraseña, y que
   te asignen un rol corriendo en el SQL Editor:
   ```sql
   update public.perfiles set rol = 'admin' where id = '<tu-uuid>';
   ```
   (roles disponibles: `admin`, `almacenista`, `consulta`)
   (roles disponibles: `admin`, `almacenista`, `consulta`)
4. `npm run dev` y entra a http://localhost:5173/login

## Backend (Supabase)

El esquema vive en `supabase/migrations/` (correr en orden, son idempotentes
-- cada archivo trae en sus comentarios el porqué del cambio, esto es solo un
resumen por bloques, no reemplaza leerlos):

- `0001`-`0002`: base -- perfiles/roles (enlazados a auth.users), `empresas`,
  `centros_costo`, `solicitantes`, `materiales` (código autogenerado, foto,
  stock mantenido por trigger) y `movimientos` (entrada/salida, solicitante,
  foto, soporte documental). RPC `resumen_movimientos_mensual()` para el
  Dashboard, bucket de Storage público `evidencias`.
- `0003`-`0017`: seguridad y auditoría -- RLS, triggers de stock con lock de
  fila, preservar historial al eliminar un material, políticas de Storage.
- `0010`-`0011`, `0018`-`0019`: referencias/seriales -- un material puede
  manejar varias unidades individuales (`material_referencias`), cada una con
  su propio stock, ubicación, foto y documentos adjuntos.
- `0020`-`0021`: trazabilidad de ubicación en salidas ("De X a Y").
- `0022`: precio unitario (material o por referencia, solo admin), valor
  total calculado en el momento.
- `0023`-`0024`: categorías de material (catálogo, solo admin agrega/borra).
- `0025`: remisión de salida -- número consecutivo real, área/proyecto,
  centro de costo, motivo, tipo de movimiento.
- `0026`-`0027`, `0029`: módulo Galería -- carpetas de fotos, bucket privado
  `galeria` dentro de `evidencias`, y relación muchos-a-muchos con remisiones
  (una carpeta puede cubrir varias salidas separadas, ver `0029`).
- `0028`: bucket privado `privado` (no público) para archivos sensibles que
  no deben quedar embebidos en el código fuente ni en el paquete JS público
  -- hoy solo la firma de quien entrega la remisión.

Los datos semilla (empresas, centros de costo, solicitantes y los 41
materiales reales con su historial de movimientos Feb-Mayo 2026) salen de
`DESARROLLO INVENTARIO.xlsx` y ya están cargados en el proyecto de Supabase.

## Módulos

- **Dashboard**: existencias, movimientos del mes, entradas vs. salidas por
  mes, últimos movimientos agrupados.
- **Materiales**: catálogo con código, empresa, centro de costo, categoría,
  foto, precio/valor y stock. Soporta materiales con varias referencias
  (seriales) individuales. Exportar a Excel (`.xlsx`, respeta los filtros
  activos, una fila por referencia en materiales con serial). Crear/editar
  (admin y almacenista); precio solo admin.
- **Categorías**: catálogo simple para clasificar materiales. Todos los
  roles ven/filtran, solo admin agrega/elimina.
- **Movimientos**: registrar entradas y salidas. Una salida puede incluir
  varios materiales distintos en un solo carrito (un número de remisión
  cubre todos); cada material puede llevar su propia observación. Al
  registrar una salida se genera un PDF de remisión imprimible (firma de
  quien entrega incluida, descargada de un bucket privado). Admin y
  almacenista.
- **Historial**: consulta y filtro de todos los movimientos, agrupados por
  remisión cuando aplica, con detalle por material y re-impresión de la
  remisión. Enlaces a foto/soporte de cada uno (modal, no pestaña aparte).
  Todos los roles (solo lectura).
- **Galería**: carpetas con nombre libre para registros fotográficos de
  salidas y envíos. Una carpeta puede asociarse a varias remisiones (no solo
  una) -- desde el detalle de una salida en Historial se puede crear una
  carpeta nueva o asociarla a una ya existente. Todos los roles crean,
  renombran y suben fotos; solo admin elimina.
- **Usuarios**: crear cuentas, cambiar rol y activar/desactivar, todo desde
  la UI (solo admin).

## Seguridad

- La sesión se cierra sola a las 8 horas desde el login (límite absoluto,
  no se reinicia con actividad) -- Supabase Auth por defecto no tiene esto.
- Archivos sensibles que no deben quedar en el código fuente ni en el
  paquete público (ej. una firma real) van en el bucket privado `privado`,
  no embebidos.

## Pendiente para siguientes iteraciones

- Exportar Historial a Excel (ya existe para Materiales).
- Recuperar contraseña (se quitó el flujo viejo, falta re-wirearlo con
  `supabase.auth.resetPasswordForEmail`).
