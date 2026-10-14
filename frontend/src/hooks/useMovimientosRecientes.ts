import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { mapMovimientoJoin } from "../api/movimientos";
import type { MovimientoReciente } from "../api/types";

// Trae los ultimos N movimientos con material/solicitante ya resueltos.
// Compartido por Dashboard y Movimientos para que la consulta y el mapeo no
// se dupliquen (y queden desincronizados) entre las dos pantallas. Trae lo
// necesario para agrupar filas de un mismo lote (ver lib/agruparMovimientos.ts)
// y volver a generar la remision desde ahi.
export function useMovimientosRecientes(limite: number) {
  const [movimientos, setMovimientos] = useState<MovimientoReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("movimientos")
      .select(
        "id, creado_en, tipo, cantidad, observaciones, foto, adjunto, ubicacion, ubicacion_origen, " +
          "remision_numero, area_proyecto, centro_costo_texto, motivo_salida, tipo_movimiento, " +
          "material_codigo_snapshot, material_descripcion_snapshot, referencia_codigo_snapshot, " +
          "materiales(codigo, descripcion), material_referencias(codigo), solicitantes(nombre)"
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
