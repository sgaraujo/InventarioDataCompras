# Guía del frontend — para replicar en un proyecto nuevo (backend en Supabase)

Este documento describe cómo está construido el **frontend** de ProyectoDatacenter
(`frontend/`), para servir de referencia al armar un proyecto nuevo de inventarios
con un enfoque distinto, pero con el mismo tipo de arquitectura frontend. El
backend actual de este proyecto es Node/Express + PostgreSQL con SQL directo;
ese backend **no** se replica — el proyecto nuevo usa Supabase. Al final hay una
sección específica de cómo adaptar estos mismos patrones cuando el backend es
Supabase en vez de un servidor propio.

---

## 1. Stack tecnológico

- **React 19** + **TypeScript**, con **Vite** como bundler/dev server (`vite.config.ts`).
- **React Router v7** (`react-router-dom`) — rutas anidadas con `<Outlet />`.
- **Sin gestor de estado global** (no Redux, no Zustand, no Context API para datos
  de negocio). Cada página maneja su propio estado con `useState`/`useEffect`.
  El único `Context` real es `AuthContext` (usuario logueado).
- **Sin librería de formularios** (no react-hook-form, no formik) — formularios
  controlados a mano con `useState` por campo.
- **Sin librería de fetching** (no react-query, no SWR, no axios) — un wrapper
  propio y delgado sobre `fetch` (`api/client.ts`).
- **Sin framework de CSS** (no Tailwind, no CSS Modules, no styled-components)
  — **un solo archivo** `index.css` con variables CSS (design tokens) y clases
  reutilizables a mano.
- **recharts** para gráficos (agregado más adelante en el proyecto).
- **lucide-react** para íconos.
- `oxlint` para lint, `tsc -b` (modo proyecto) antes de cada build — importante:
  correr `npm run build` de verdad, no solo `tsc --noEmit` suelto, porque el
  modo proyecto (`tsc -b`) detecta cosas que el otro modo se salta (pasó en
  este proyecto: un `<Paginacion>` sin una prop obligatoria no lo agarraba
  `tsc --noEmit` pero sí `tsc -b`).

## 2. Estructura de carpetas

```
frontend/src/
  api/
    client.ts       -> wrapper de fetch (api.get/post/put/delete/upload) + descargarArchivo()
    types.ts         -> TODAS las interfaces/tipos TS del dominio, en un solo archivo
  components/         -> piezas reutilizables entre páginas (ver sección 4)
  context/
    AuthContext.tsx   -> el único contexto global (usuario logueado)
  hooks/
    usePaginacion.ts  -> paginación client-side reutilizable
  lib/
    labels.ts         -> mapas de traducción (código backend -> texto en español)
                         + formatters (money, moneda) + helpers de rol (esAdmin...)
  pages/              -> una página por ruta, componente grande y autosuficiente
  App.tsx             -> define todas las rutas
  index.css           -> TODO el CSS del proyecto
```

No hay carpeta `services/` ni `store/` aparte — `api/client.ts` + `api/types.ts`
son toda la "capa de datos" del frontend.

## 3. Patrones de arquitectura (el corazón de este documento)

### 3.1 `api/client.ts` — cliente HTTP centralizado

Un wrapper delgado sobre `fetch`, sin librerías externas:

```ts
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: ... }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: ... }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
```

- Tipa genéricamente con `<T>` el tipo de respuesta esperado (definido en `types.ts`).
- Si la respuesta no es 2xx, lanza `ApiClientError` con el mensaje que mandó el
  backend (`{ error: "..." }`) — así cada página solo hace
  `catch (err) { err instanceof ApiClientError ? err.message : "Error genérico" }`.
- `descargarArchivo(path, nombreSugerido)` aparte: para exports de Excel, arma
  un blob y dispara la descarga del navegador en vez de intentar parsear JSON.
- No usa `credentials: "include"` porque en este proyecto el frontend y el
  backend siempre son el mismo origen (Vite proxea `/api` en dev, Express sirve
  el build en producción) — las cookies de sesión viajan solas. **Esto cambia
  con Supabase**, ver sección 6.

### 3.2 `api/types.ts` — un solo archivo con todos los tipos

Todas las interfaces del dominio (`Material`, `Usuario`, `SolicitudSalida`,
etc.) viven en un único archivo, reflejando 1:1 lo que el backend devuelve.
Los "enums" del dominio (roles, estados) son `type` de unión de strings:

```ts
export type Rol = "admin" | "almacenista" | "consulta" | "supervisor" | "tecnico-ejecutor" | "coordinador";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "lista" | "cancelada";
```

Esto permite que TypeScript obligue a manejar todos los casos (en `switch`, en
los mapas de `lib/labels.ts`, etc.) sin tener que ir a buscar el tipo en otro
lado.

### 3.3 Autenticación: `AuthContext` + `ProtectedRoute` + `RoleGate`

- `AuthProvider` hace `GET /api/auth/me` al montar, guarda `{ usuario, cargando }`.
- `ProtectedRoute`: si no hay usuario, `<Navigate to="/login" />`. Envuelve
  todas las rutas privadas en `App.tsx`.
- `RoleGate`: componente que recibe `roles={[...]}` y redirige a `/` si el
  usuario no tiene un rol permitido. Se usa por ruta (envolviendo un `<Route>`
  con roles restringidos), no por página individual — así una ruta bloqueada
  ni siquiera monta el componente de la página.
- Un helper de rol compuesto vive en `lib/labels.ts` (ej. `esAdmin(usuario)` en
  vez de comparar `rol === "admin"` a mano en cada archivo) — útil cuando un
  rol "hereda" permisos de otro (en este proyecto, "coordinador" pasa
  cualquier chequeo de "admin").

### 3.4 Páginas (`pages/*.tsx`) — el patrón dominante

Cada página es un componente grande y autosuficiente, sin dividir en muchos
subcomponentes ni capas "container/presentational". El esqueleto típico de una
página con tabla + filtros + export + modal de detalle:

```tsx
export function Materiales() {
  const [lista, setLista] = useState<Material[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroX, setFiltroX] = useState("");
  // ...un useState por cada filtro

n  function construirParamsFiltro() {
    const params = new URLSearchParams();
    if (filtroX) params.set("x", filtroX);
    return params;
  }

  function cargar() {
    setCargando(true);
    return api.get<Material[]>(`/api/materiales?${construirParamsFiltro()}`)
      .then(setLista).finally(() => setCargando(false));
  }

  useEffect(() => { cargar(); }, [filtroX /* ...cada filtro */]);

  const { pageItems, total, totalPaginas, paginaActual, desde, hasta, irAPagina } =
    usePaginacion(lista, TAMANO_PAGINA);

  async function exportar() {
    await descargarArchivo(`/api/materiales/exportar?${construirParamsFiltro()}`, "materiales.xlsx");
  }

  return (
    <section className="view">
      <div className="panel">
        <h2>...</h2>
        <div className="filtros-mov">...inputs de filtro...</div>
        <table className="tabla">...pageItems.map...</table>
        <Paginacion total={total} totalPaginas={totalPaginas} ... etiqueta="materiales" />
      </div>
      {viendoDetalle && <Modal ...>...</Modal>}
    </section>
  );
}
```

**Punto clave**: la misma función `construirParamsFiltro()` se reutiliza para
el `fetch` de la tabla Y para el export — así "lo que ves filtrado en pantalla"
y "lo que exportas" nunca pueden divergir.

### 3.5 `usePaginacion` — paginación 100% client-side

El backend devuelve la lista ya filtrada (con un `LIMIT` generoso, ej. 200
filas) y la paginación ocurre **en memoria**, no con offset/cursor en el
servidor. La página actual vive en la URL (`?pagina=2`) usando
`useSearchParams`, para que recargar o compartir el link mantenga el lugar.
Esto es simple y funciona bien mientras las listas no crezcan mucho — si el
proyecto nuevo espera listas de miles de filas, conviene paginar de verdad en
el backend/Supabase (`.range()` en supabase-js) en vez de copiar este patrón
literal.

### 3.6 `Modal.tsx` — un solo modal genérico para toda la app

Un componente `Modal` reutilizado para TODO: ver detalle, formularios,
confirmaciones. Usa `createPortal` para salir del árbol normal del DOM.

La pieza más importante: la prop `confirmarCierre` (boolean). Si es `true`,
antes de cerrar (click afuera, ESC, botón X) muestra un diálogo "¿Seguro que
quieres salir? Vas a perder los cambios sin guardar" con dos botones. Cada
página decide cuándo pasar `true`, normalmente comparando el estado actual del
formulario contra una foto de cómo estaba al abrir:

```tsx
<Modal
n  titulo="..."
  onClose={() => setViendoDetalle(null)}
  confirmarCierre={JSON.stringify(form) !== JSON.stringify(formInicialRef.current)}
>
```

### 3.7 `ConfirmDialog.tsx` — confirmación simple sin formulario

Para acciones puntuales (eliminar algo, confirmar una transición de estado)
que no necesitan el `Modal` completo: mismo estilo visual (reusa las clases
`.alert-overlay`/`.alert-dialog` que también usa `Modal` internamente), pero
un componente aparte y más liviano, con `titulo`, `descripcion`,
`onConfirmar`/`onCancelar`.

### 3.8 Combos de búsqueda (`ComboMaterial`, `ComboLpu`, etc.)

Patrón repetido para "buscar y seleccionar un ítem de una lista larga": un
`<input>` de texto + un dropdown de resultados filtrados en memoria + click
para seleccionar. Mismo esqueleto de CSS reutilizado (`.material-combo`,
`.combo-opciones`, `.combo-item`) con una clase modificadora por caso de uso
específico. Cierra al hacer click afuera (listener de `click` en el
`document`, comparado contra un `ref` del contenedor).

### 3.9 `lib/labels.ts` — la única fuente de "traducciones" y formatters

- Un `Record<CodigoBackend, TextoEspañol>` por cada tipo de unión del dominio
  (`ESTADO_LABEL`, `ROL_LABEL`, etc.) — nunca un `if/else` repetido por toda
  la app para traducir un código a texto.
- `money(n)` / `moneda(n)`: formato numérico y de moneda en `es-CO`
  (`toLocaleString`), usado en toda la app para que los números se vean
  consistentes.
- Helpers de rol compuesto (`esAdmin`, etc.).

**Nota de este proyecto en particular** (no hay backend compartido con el
frontend, todo Node/Express): varios de estos labels/formatters están
**duplicados** también del lado del servidor (para exports de Excel, por
ejemplo). Con Supabase esto cambia — ver sección 6.

### 3.10 Badges de estado — un solo sistema de color

Una clase base `.badge` + un modificador por código de estado
(`.badge.pendiente`, `.badge.aprobada`, `.badge.rechazada`...). El color
**siempre** sale de la misma paleta de variables CSS
(`--success`/`--warning`/`--danger`/`--teal`...), nunca un color inventado
para un caso puntual. Cuando se agregaron gráficos (recharts), los colores de
cada barra/segmento reutilizan esos mismos valores (en hex, ver sección 5) —
así un gráfico y un badge de la misma tabla nunca "dicen" cosas distintas con
colores distintos.

### 3.11 Filtros + Exportar a Excel

Casi toda página con tabla tiene su barra de filtros (`.filtros-mov`) y un
botón "Exportar" que golpea un endpoint hermano (`/exportar`) con **los
mismos parámetros de filtro** que la tabla. Ver 3.4 — la clave es una sola
función `construirParamsFiltro()` compartida entre ambos usos.

### 3.12 Notificaciones (`NotificationBell`) — polling simple

Sin WebSockets ni Server-Sent Events: un `setInterval` cada 30s que vuelve a
pedir `/api/notificaciones`. Simple y suficiente para el volumen de este
proyecto. Con Supabase, esto se reemplaza naturalmente por **Realtime**
(suscripción a cambios en la tabla), ver sección 6.

## 4. Componentes reutilizables — resumen rápido

| Componente | Para qué |
|---|---|
| `Modal.tsx` | Todo modal (detalle, formulario, confirmación con `confirmarCierre`) |
| `ConfirmDialog.tsx` | Confirmación simple sin formulario |
| `Paginacion.tsx` | Controles de paginación + texto "Mostrando X-Y de Z {etiqueta}" |
| `ComboMaterial.tsx` / `ComboLpu.tsx` | Buscador con dropdown para seleccionar un ítem de una lista larga |
| `NotificationBell.tsx` | Campanita de notificaciones con polling |
| `Layout.tsx` | Sidebar + topbar, visibilidad de cada ítem de menú según rol |
| `ProtectedRoute.tsx` | `ProtectedRoute` (requiere sesión) + `RoleGate` (requiere rol) |

## 5. Sistema visual / CSS

Un solo `index.css`, sin preprocesador ni framework:

- `:root` con la paleta completa como variables CSS: colores primarios
  (`--teal`, `--lime`), semánticos (`--success`, `--warning`, `--danger`),
  neutros (`--bg`, `--panel-bg`, `--text`, `--text-muted`, `--border`), más
  `--shadow` y `--radius` reutilizados en todos los paneles/tarjetas.
- Clases reutilizables por todo el proyecto: `.panel`, `.stats-grid`/`.stat-card`,
  `.tabla`/`.tabla-wrap`, `.filtros-mov`, `.btn-editar`/`.btn-nuevo`/
  `.btn-quitar-item`/`.btn-agregar-item`, `.detalle-datos`/`.detalle-items`/
  `.detalle-item-fila`, `.empty-state`, `.badge` + modificadores.
- Responsive con `@media (max-width: ...)` a mano, sin grid system de terceros.
- **Los gráficos de recharts no pueden leer `var(--...)` de forma confiable**
  en el atributo `fill` de un `<svg>` — los colores de la paleta se repiten en
  hex directo dentro de cada componente de gráfico (duplicación intencional,
  documentada en el propio archivo).

## 6. Cómo adaptar todo esto cuando el backend es Supabase

El backend actual (Express + `pg` + SQL directo + `express-session`) **no**
se replica. Pero como el frontend nuevo va a hablar con Supabase en vez de con
ese backend, esto es lo que cambia de cada patrón de arriba:

### Autenticación
`AuthContext` cambia de "pedir `/api/auth/me` con cookie de sesión" a usar el
SDK `@supabase/supabase-js`:
```ts
const { data: { session } } = await supabase.auth.getSession();
supabase.auth.onAuthStateChange((_event, session) => setUsuario(session?.user ?? null));
```
Ya no hay cookie httpOnly de servidor propio — Supabase maneja el token (JWT)
internamente en el cliente. `login`/`logout` pasan a ser
`supabase.auth.signInWithPassword(...)` / `supabase.auth.signOut()`.

### `api/client.ts`
Se reemplaza casi entero por el cliente de `supabase-js`
(`supabase.from("tabla").select()...`). Puede seguir existiendo una capa
delgada propia si se prefiere mantener el mismo estilo `api.get/post/...` en
las páginas (para no reescribir todas las páginas de una), pero por dentro
llamaría a supabase-js en vez de a `fetch`.

### Roles y visibilidad de datos (lo que hoy hace `construirFiltro` +
`requireRole` en cada ruta de Express)
Esto se mueve a **Row Level Security (RLS)** de Postgres/Supabase: políticas
por tabla que filtran filas según `auth.uid()` / un claim de rol, en vez de
lógica en un middleware de Express. `RoleGate` en el frontend sigue teniendo
sentido (para no mostrar ni montar una página que el rol no debería ver), pero
la seguridad real de los datos vive en las políticas RLS, no solo en el
frontend.

### Endpoints de "resumen" (los que arma `GROUP BY`/`generate_series`
para los gráficos de este proyecto)
No son un simple `select` filtrado — son agregaciones. En Supabase esto se
resuelve con **funciones de Postgres expuestas como RPC**
(`supabase.rpc("resumen_mensual", { desde, hasta })`), escritas en SQL/PLpgSQL
directo en la base — el mismo tipo de SQL que ya existe en las rutas
`resumen-*` de este proyecto, solo que vive como función en Postgres en vez de
en una ruta de Express.

### Archivos (evidencias, adjuntos, fotos)
Hoy: `multer` + disco local del servidor. Con Supabase: **Supabase Storage**
(`supabase.storage.from("bucket").upload(...)`), con políticas de acceso por
bucket en vez de un middleware de subida propio.

### Exportar a Excel
Hoy: se genera el `.xlsx` en el servidor (librería `exceljs` vía
`lib/importarExcel.js`) y se manda como descarga. Sin backend propio, hay dos
caminos: generarlo **en el navegador** (librería de Excel en el cliente, con
los datos que ya se trajeron con `supabase-js`) o, si hace falta que corra en
servidor, una **Supabase Edge Function**.

### Notificaciones
Hoy: polling cada 30s a una tabla propia. Con Supabase: **Realtime**
(`supabase.channel(...).on("postgres_changes", ...)`) — se entera al instante
sin pedir cada 30s, y es más simple que mantener el `setInterval`.

### Lo que NO cambia
Todo lo de las secciones 3 y 5 (estructura de páginas, `Modal`, `Paginacion`,
combos de búsqueda, sistema de badges/colores, CSS a mano, gráficos con
recharts) es independiente del backend — se puede copiar tal cual al proyecto
nuevo. Lo único que cambia es **de dónde vienen los datos** (`supabase-js` en
vez de `fetch` a un Express propio) y **dónde vive la seguridad** (RLS en vez
de middleware).

## 7. Checklist para arrancar el proyecto nuevo

1. `npm create vite@latest -- --template react-ts`, agregar `react-router-dom`,
   `recharts` (si va a tener gráficos), `lucide-react`, `@supabase/supabase-js`.
2. Copiar la estructura de carpetas de la sección 2 (`api/`, `components/`,
   `context/`, `hooks/`, `lib/`, `pages/`).
3. Definir el modelo de datos completo en Supabase primero (tablas + RLS) —
   de ahí sale `api/types.ts` casi directo (cada tabla ≈ una interfaz TS).
4. Armar `AuthContext` con `supabase-js` (ver sección 6).
5. Copiar `Modal.tsx`, `ConfirmDialog.tsx`, `Paginacion.tsx`,
   `ProtectedRoute.tsx`/`RoleGate` tal cual (son genéricos, no dependen del
   dominio de materiales).
6. Copiar el esqueleto de `index.css` (variables + clases reutilizables) y
   ajustar la paleta de colores al nuevo proyecto.
7. Para cada módulo nuevo, seguir el esqueleto de página de la sección 3.4.
