import { useEffect, useMemo, useRef, useState } from "react";
import type { Material } from "../api/types";

export function etiquetaMaterial(m: Material): string {
  return `${m.descripcion} · ${m.codigo} · ${m.empresa_nombre}`;
}

export function ComboMaterial({
  materiales,
  materialId,
  onSeleccionar,
}: {
  materiales: Material[];
  materialId: string;
  onSeleccionar: (id: string) => void;
}) {
  const [texto, setTexto] = useState(() => {
    const actual = materiales.find((m) => String(m.id) === materialId);
    return actual ? etiquetaMaterial(actual) : "";
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
      ? materiales.filter((m) => etiquetaMaterial(m).toLowerCase().includes(filtro))
      : materiales;
    return lista.slice(0, 40);
  }, [materiales, texto]);

  return (
    <div className="material-combo" ref={ref}>
      <label>Material</label>
      <input
        type="text"
        placeholder="Escribe para buscar por descripción o código..."
        autoComplete="off"
        required
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (materialId) onSeleccionar("");
        }}
      />
      <input type="hidden" value={materialId} readOnly />
      {abierto && (
        <div className="combo-opciones">
          {candidatos.length === 0 ? (
            <div className="combo-vacio">Sin coincidencias</div>
          ) : (
            candidatos.map((m) => (
              <div
                key={m.id}
                className="combo-item"
                onClick={() => {
                  setTexto(etiquetaMaterial(m));
                  onSeleccionar(String(m.id));
                  setAbierto(false);
                }}
              >
                {etiquetaMaterial(m)} <span className="stock-aviso">stock: {m.stock_actual}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
