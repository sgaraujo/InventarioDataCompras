import { supabase } from "./supabaseClient";

const BUCKET = "evidencias";

// Sube una foto o un soporte documental al bucket publico "evidencias" y
// devuelve la URL publica para guardarla en la fila (materiales.foto,
// material_referencias.foto, material_referencia_documentos.url,
// movimientos.foto/adjunto). El bucket es publico para lectura, la escritura
// requiere sesion (ver policies en supabase/migrations/0002_inventario.sql).
export async function subirEvidencia(carpeta: "materiales" | "referencias" | "movimientos", archivo: File): Promise<string> {
  const ruta = `${carpeta}/${Date.now()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo);
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

// Borra del bucket el archivo detras de una URL publica devuelta por
// subirEvidencia. Si la URL no es de este bucket no hace nada.
export async function borrarEvidencia(urlPublica: string): Promise<void> {
  const marca = `/object/public/${BUCKET}/`;
  const i = urlPublica.indexOf(marca);
  if (i === -1) return;
  const ruta = decodeURIComponent(urlPublica.slice(i + marca.length));
  const { error } = await supabase.storage.from(BUCKET).remove([ruta]);
  if (error) throw error;
}
