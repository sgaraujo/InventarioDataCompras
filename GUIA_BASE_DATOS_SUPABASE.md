# Guía de base de datos — de ProyectoDatacenter a Supabase

Este documento explica **cómo está diseñada la base de datos** del proyecto
original (ProyectoDatacenter, PostgreSQL puro sin ORM) — no como algo para
copiar tabla por tabla (el dominio nuevo es compras, no materiales de campo),
sino como **catálogo de patrones reutilizables** que sí valen para cualquier
sistema de inventario, más una guía de qué cambia concretamente al mover el
backend a Supabase.

---

## 1. Filosofía del diseño original

- **PostgreSQL directo, sin ORM** — todo el SQL vive a mano en las rutas del
  backend (o, en Supabase, en funciones/políticas/vistas).
- **Un solo archivo de esquema, idempotente** (`db/schema.sql`): se puede
  correr las veces que sea sin romper nada ni duplicar datos —
  `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  y para cambiar una regla `CHECK` existente: `DROP CONSTRAINT IF EXISTS` +
  `ADD CONSTRAINT` con la nueva regla. Esto es exactamente lo que hacen las
  migraciones de Supabase (`supabase/migrations/*.sql`), mismo criterio.
- **La visibilidad de datos por rol hoy vive en el backend** (una función
  `construirFiltro(usuario, query)` por ruta, que arma el `WHERE` según el
  rol antes de tocar la base). **Esto es justo lo que cambia con Supabase**
  — ver sección 4.
- **Los campos derivados nunca los calcula la aplicación**: o son una
  columna `GENERATED ALWAYS AS (...) STORED`, o los mantiene un `TRIGGER`.
  Menos lugares donde algo se puede desincronizar.

## 2. Tablas del proyecto original (como ejemplo del patrón, no para copiar)

| Tabla | Para qué |
|---|---|
| `usuarios` | cuenta + rol + `activo` |
| `auditoria` | log genérico de TODO cambio (crear/actualizar/eliminar) de cualquier entidad, con un JSON de detalles |
| `categorias` / `proveedores` / `almacenes` | catálogos simples |
| `materiales` | el ítem central del inventario — `stock_actual` lo mantiene un trigger, no la app |
| `material_proveedores` | tabla puente N:M |
| `movimientos` | cada entrada/salida real de stock — al insertar uno, un trigger actualiza `materiales.stock_actual` solo |
| `solicitudes_salida` + `solicitud_salida_items` + `solicitud_salida_eventos` | el patrón "cabecera + líneas + eventos" (ver 3.1) |
| `solicitud_salida_devoluciones` + `..._eventos` | un segundo flujo de aprobación encadenado al primero |
| `notificaciones` | in-app |
| `alertas_stock` | un estado propio (activa/resuelta) por material, para no repetir notificaciones — mantenido por trigger |
| `password_resets` | tokens de un solo uso, se guarda el hash, nunca el token en crudo |
| `herramientas` + `prestamos_herramienta` | otro módulo con el mismo patrón cabecera+eventos |
| `lista_precios_unitarios` + `solicitud_facturacion_items` | catálogo fijo (cargado una sola vez) + líneas sueltas que lo referencian |

## 3. Patrones reutilizables — estos sí valen para el proyecto de compras

### 3.1 Cabecera + líneas + eventos (el patrón más repetido en este proyecto)

Cualquier "documento con flujo de aprobación" (una solicitud, una orden de
compra, una requisición) se modela en tres tablas:

- **Cabecera** (`solicitudes_salida`): estado actual, quién la creó, fechas.
- **Líneas** (`solicitud_salida_items`): qué contiene (material + cantidad).
- **Eventos** (`solicitud_salida_eventos`): una fila por cada transición de
  estado (`creada`, `aprobada`, `rechazada`, `reenviada`...), con el actor,
  una nota opcional (motivo de rechazo) y la fecha.

Ventaja: el timeline visual de "qué le pasó a este documento" sale gratis de
la tabla de eventos, sin necesitar la auditoría genérica para eso. Para el
proyecto de compras: una orden de compra o una requisición encajan
directamente en este mismo esqueleto.

### 3.2 Estado calculado al leer, nunca guardado

El estado agregado de una solicitud (ej. "todas sus líneas están cerradas")
**no es una columna** — se calcula con un `CASE`/`COUNT` al hacer el
`SELECT`, mirando el estado de cada línea. Así nunca queda una cabecera
desincronizada porque alguien cambió una línea y se olvidó de actualizar el
estado general. En Supabase esto se puede resolver igual con una vista SQL,
o con la misma lógica armada del lado del cliente vía `supabase-js`.

### 3.3 Triggers para mantener campos derivados

`materiales.stock_actual` nunca lo calcula el backend a mano — un trigger en
`movimientos` (`AFTER INSERT`) lo suma/resta solo. Esto es **exactamente
igual en Supabase** (son funciones/triggers puros de Postgres, Supabase no
le agrega ninguna capa encima) — se puede copiar la función y el trigger tal
cual, ajustando nombres de tabla/columna al dominio nuevo.

```sql
CREATE OR REPLACE FUNCTION actualizar_stock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE materiales SET stock_actual = stock_actual + NEW.cantidad WHERE id = NEW.material_id;
  ELSE
    UPDATE materiales SET stock_actual = stock_actual - NEW.cantidad WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_stock
  AFTER INSERT ON movimientos
  FOR EACH ROW EXECUTE FUNCTION actualizar_stock();
```

### 3.4 Alertas con estado propio, no solo eventos sueltos

`alertas_stock` tiene una fila por material con `activa`/`activada_en`/
`resuelta_en` — un trigger en `materiales` decide cuándo pasa de inactiva a
activa (y viceversa) comparando `stock_actual` contra `stock_minimo`, y solo
ahí genera **una** notificación (no una por cada movimiento mientras el
stock sigue bajo). Patrón: "estado singleton por entidad" en vez de dejar
que la aplicación decida cuándo notificar.

### 3.5 Columnas generadas para valores que siempre derivan de otras

Ej. `cantidad_sobrante NUMERIC(12,2) GENERATED ALWAYS AS (cantidad_solicitada - cantidad_usada) STORED`
— Postgres la recalcula solo, nunca puede quedar desincronizada porque nadie
la actualiza a mano. Útil para totales de línea (`cantidad * precio_unitario`)
en el proyecto de compras.

### 3.6 Semillas idempotentes para catálogos fijos

Un catálogo que se carga una sola vez (en este proyecto, una lista de
precios importada de un Excel) se inserta con un `WHERE NOT EXISTS` que
protege contra duplicados si el script de esquema se vuelve a correr:

```sql
INSERT INTO catalogo_fijo (nombre, valor)
SELECT * FROM (VALUES ('...', 123), ('...', 456)) AS v(nombre, valor)
WHERE NOT EXISTS (SELECT 1 FROM catalogo_fijo);
```

### 3.7 Auditoría genérica, separada de los eventos de negocio

`auditoria` es una tabla única para TODO cambio de cualquier entidad
(`accion`, `entidad`, `entidad_id`, `detalles` JSON) — sirve para "quién
cambió qué" en general. Es **distinta** de las tablas de eventos de 3.1 (que
sí importan para el timeline visual de un documento puntual). No conviene
mezclar las dos cosas en una sola tabla.

## 4. Lo que cambia concretamente al mover esto a Supabase

### Visibilidad de datos por rol → Row Level Security (RLS)

Hoy cada ruta de Express arma su propio `WHERE` en JS según el rol del
usuario logueado (ej. "el técnico solo ve lo que él mismo creó"). En
Supabase esa lógica se mueve a **políticas RLS por tabla**, usando
`auth.uid()` (o un claim de rol guardado en la fila del usuario /
`app_metadata` del JWT). Ejemplo de traducción directa:

```js
// Hoy (Express, en JS):
if (usuario.rol === "tecnico-ejecutor") {
  condiciones.push(`solicitado_por = $${valores.length}`);
}
```

```sql
-- Supabase (política RLS en SQL):
CREATE POLICY "tecnico ve solo lo suyo" ON solicitudes_salida
  FOR SELECT USING (
    solicitado_por = auth.uid()
    OR (SELECT rol FROM usuarios WHERE id = auth.uid()) IN ('admin', 'supervisor', 'consulta')
  );
```

**Importante**: en Supabase, si una tabla no tiene RLS activado, queda
expuesta por la API REST automática a cualquiera con la `anon key`. A
diferencia de este proyecto (donde la seguridad vivía 100% en el middleware
de Express), en Supabase **cada tabla nueva necesita
`ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + sus políticas desde el día
uno**, no después.

### Autenticación

`usuarios.password_hash` (bcrypt manejado a mano en este proyecto)
desaparece — Supabase Auth maneja login/sesión/tokens. La tabla `usuarios`
propia pasa a ser una tabla de "perfil" (rol, nombre, almacén/área) enlazada
1:1 a `auth.users` por `id` (mismo UUID).

### Triggers y funciones

No cambian en absoluto — Postgres es Postgres. Los triggers de 3.3/3.4 se
pueden copiar prácticamente tal cual, solo ajustando nombres de
tabla/columna al dominio de compras.

### Agregaciones para reportes/gráficos

Las consultas tipo `GROUP BY`/`generate_series` (usadas en este proyecto
para los resúmenes de los gráficos del dashboard) se exponen en Supabase
como **funciones RPC** (`supabase.rpc("nombre_funcion", { parametros })`) en
vez de una ruta de Express — mismo SQL, distinto lugar donde vive.

## 5. Checklist para armar el esquema del proyecto de compras

1. Definir las tablas del dominio nuevo (ítems/productos, proveedores,
   órdenes de compra, aprobaciones, recepciones...) usando el patrón
   cabecera + líneas + eventos (3.1) donde el flujo lo pida.
2. Activar RLS en cada tabla **desde que se crea**, no como paso posterior.
3. Escribir las políticas de visibilidad por rol antes de conectar el
   frontend — no depender de que el frontend "se porte bien" ocultando cosas.
4. Copiar el patrón de trigger (3.3) para cualquier campo derivado (ej. total
   de una orden = suma de sus líneas, o stock disponible).
5. Migraciones idempotentes en `supabase/migrations/`, mismo criterio que
   `db/schema.sql` de este proyecto.
