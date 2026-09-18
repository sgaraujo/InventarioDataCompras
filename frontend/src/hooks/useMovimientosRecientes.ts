import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { mapMovimientoJoin } from "../api/movimientos";
import type { MovimientoReciente } from "../api/types";

// Trae los ultimos N movimientos con material/solicitante ya resueltos.
// Compartido por Dashboard y Movimientos para que la consulta y el mapeo no
// se dupliquen (y queden desincronizados) entre las dos pantallas. Selecciona
// solo las columnas que el panel muestra -- nada de foto/adjunto/observaciones.
export function useMovimientosRecientes(limite: number) {
  const [movimientos, setMovimientos] = useState<MovimientoReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("movimientos")
      .select(
        "id, creado_en, tipo, cantidad, material_descripcion_snapshot, materiales(descripcion), solicitantes(nombre)"
      )
      .order("creado_en", { ascending: false })
      .limit(limite);

    if (error) {
      setError(error.message);
      setMovimientos([]);
    } else {
      setError(null);
      setMovimientos((data ?? []).map(mapMovimientoJoin) as MovimientoReciente[]);
    }
    setCargando(false);
  }, [limite]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { movimientos, cargando, error, recargar };
}
