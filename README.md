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
4. `npm run dev` y entra a http://localhost:5173/login

## Backend (Supabase)

El esquema vive en `supabase/migrations/` (correr en orden, son idempotentes):

- `0001_init.sql`: perfiles (enlazados a auth.users) y roles.
- `0002_inventario.sql`: reemplaza el dominio inicial (compras con aprobación,
  descartado) por el real -- `empresas`, `centros_costo`, `solicitantes`,
  `materiales` (código autogenerado, foto, stock mantenido por trigger) y
  `movimientos` (entrada/salida, solicitante, foto, soporte documental).
  Incluye la función RPC `resumen_movimientos_mensual()` para el gráfico del
  Dashboard, y el bucket de Storage `evidencias` para fotos/soportes.

Los datos semilla (empresas, centros de costo, solicitantes y los 41
materiales reales con su historial de movimientos Feb-Mayo 2026) salen de
`DESARROLLO INVENTARIO.xlsx` y ya están cargados en el proyecto de Supabase.

## Módulos

- **Dashboard**: existencias, movimientos del mes, entradas vs. salidas por mes.
- **Materiales**: catálogo con código, empresa, centro de costo, foto y stock
  actual. Crear/editar (admin y almacenista).
- **Movimientos**: registrar entradas y salidas (material, cantidad,
  solicitante, foto de evidencia, soporte documental). Admin y almacenista.
- **Historial**: consulta y filtro de todos los movimientos, con enlaces a
  la foto/soporte de cada uno. Todos los roles (solo lectura).

## Pendiente para siguientes iteraciones

- Exportar a Excel (materiales / historial).
- Gestión de usuarios y roles desde la UI (hoy se asigna por SQL).
- Recuperar contraseña (se quitó el flujo viejo, falta re-wirearlo con
  `supabase.auth.resetPasswordForEmail`).
