# InventarioDataCompras

Nuevo sistema de compras, con backend en Supabase. Ver `GUIA_FRONTEND_NUEVO_PROYECTO.md`
y `GUIA_BASE_DATOS_SUPABASE.md` para el detalle de arquitectura (son la referencia de
como se armo esto a partir de ProyectoDatacenter).

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
   (roles disponibles: `admin`, `comprador`, `aprobador`, `consulta`)
4. `npm run dev` y entra a http://localhost:5173/login

## Backend (Supabase)

El esquema completo (tablas, triggers, políticas RLS) vive en
`supabase/migrations/0001_init.sql`, pensado para pegarse tal cual en el SQL
Editor del proyecto de Supabase. Es idempotente -- correrlo de nuevo no rompe
nada ni duplica datos.

## Estado actual

El frontend todavía trae copiadas las páginas del dominio de materiales de
ProyectoDatacenter (Materiales, Entradas, Herramientas, etc.) -- son solo la
base de referencia de patrones de UI. El dominio real de este proyecto
(Órdenes de Compra) todavía no tiene páginas propias; por ahora el backend
soporta login/roles y la tabla `ordenes_compra` (cabecera + líneas + eventos
de aprobación).
