// Cliente fetch delgado. Sin librerias externas (axios, react-query):
// el backend es simple y no hace falta esa capa extra.

export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const esFormData = options?.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    headers: {
      // FormData: el navegador pone su propio Content-Type con el boundary correcto
      ...(options?.body && !esFormData ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) mensaje = data.error;
    } catch {
      // respuesta sin cuerpo JSON, se usa el mensaje generico
    }
    throw new ApiClientError(mensaje, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};

// Descarga un archivo (ej. la plantilla de Excel) y le hace disparar al
// navegador el dialogo de "Guardar como", en vez de tratar de parsear la
// respuesta como JSON (que es lo que hace el resto del cliente).
export async function descargarArchivo(path: string, nombreSugerido: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) mensaje = data.error;
    } catch {
      // sin cuerpo JSON
    }
    throw new ApiClientError(mensaje, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreSugerido;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
