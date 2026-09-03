import { useEffect, useMemo, useRef, useState } from "react";
import type { Lpu } from "../api/types";
import { moneda } from "../lib/labels";

export function etiquetaLpu(l: Lpu): string {
  const alterno = l.nombre_alternativo && l.nombre_alternativo !== l.nombre ? ` (${l.nombre_alternativo})` : "";
  const unidad = l.unidad_medida ? ` [${l.unidad_medida}]` : "";
  return `${l.nombre}${alterno}${unidad} — ${moneda(l.precio_unitario)}`;
}

// Buscador de la Lista de Precios Unitarios -- mismo patron/clases que
// ComboMaterial (combo-opciones/combo-item), adaptado: aca no hay "excluir
// ids" porque el mismo item de la LPU si se puede repetir en varias lineas
// de una misma orden.
export function ComboLpu({
  items,
  lpuId,
  onSeleccionar,
}: {
  items: Lpu[];
  lpuId: number | null;
  onSeleccionar: (id: number | null) => void;
}) {
  const [texto, setTexto] = useState(() => {
    const actual = items.find((l) => l.id === lpuId);
    return actual ? etiquetaLpu(actual) : "";
  });
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("click", onClickFuera, true);
    return () => document.removeEventListener("click", onClickFuera, true);
  }, []);

  const candidatos = useMemo(() => {
    const filtro = texto.trim().toLowerCase();
    const lista = filtro
      ? items.filter(
          (l) => l.nombre.toLowerCase().includes(filtro) || (l.nombre_alternativo ?? "").toLowerCase().includes(filtro)
        )
      : items;
    return lista.slice(0, 40);
  }, [items, texto]);

  return (
    <div className="material-combo lpu-combo" ref={ref}>
      <input
        type="text"
        placeholder="Buscar en la lista de precios..."
        autoComplete="off"
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (lpuId) onSeleccionar(null);
        }}
      />
      {abierto && (
        <div className="combo-opciones">
          {candidatos.length === 0 ? (
            <div className="combo-vacio">Sin coincidencias</div>
          ) : (
            candidatos.map((l) => (
              <div
                key={l.id}
                className="combo-item"
                onClick={() => {
                  setTexto(etiquetaLpu(l));
                  onSeleccionar(l.id);
                  setAbierto(false);
                }}
              >
                {etiquetaLpu(l)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
