import { supabase } from "./supabaseClient";

const BUCKET = "evidencias";

// Sube una foto o un soporte documental al bucket publico "evidencias" y
// devuelve la URL publica para guardarla en la fila (materiales.foto,
// movimientos.foto/adjunto). El bucket es publico para lectura, la escritura
// requiere sesion (ver policies en supabase/migrations/0002_inventario.sql).
export async function subirEvidencia(carpeta: "materiales" | "movimientos", archivo: File): Promise<string> {
  const ruta = `${carpeta}/${Date.now()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo);
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}
