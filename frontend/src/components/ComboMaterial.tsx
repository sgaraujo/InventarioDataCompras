import { useEffect, useMemo, useRef, useState } from "react";
import type { Material } from "../api/types";

export function etiquetaMaterial(m: Material): string {
  const codigo = m.codigo ? ` · ${m.codigo}` : "";
  const proveedor = m.proveedores.length ? ` · ${m.proveedores.map((p) => p.nombre).join(", ")}` : "";
  return `${m.producto} (${m.unidad})${codigo}${proveedor}`;
}

export function ComboMaterial({
  materiales,
  materialId,
  onSeleccionar,
  excluirIds,
}: {
  materiales: Material[];
  materialId: string;
  onSeleccionar: (id: string, etiqueta: string) => void;
  // ids de materiales ya elegidos en OTRAS lineas del mismo formulario (para no
  // poder seleccionar el mismo material dos veces y terminar con 2 movimientos
  // separados para lo mismo).
  excluirIds?: number[];
}) {
  // Si el combo se monta con un material ya seleccionado (ej. al reenviar una
  // solicitud rechazada, con los items que ya tenia), muestra su nombre de una vez
  // en vez de arrancar vacio.
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
    // Captura (3er arg = true): el modal detiene la propagacion de sus clicks
    // internos en la fase de burbuja, asi que un listener normal en "document"
    // nunca se entera de un click hecho dentro del modal pero fuera del combo.
    // En la fase de captura el listener se dispara antes de que eso ocurra.
    document.addEventListener("click", onClickFuera, true);
    return () => document.removeEventListener("click", onClickFuera, true);
  }, []);

  const candidatos = useMemo(() => {
    const disponibles = excluirIds?.length ? materiales.filter((m) => !excluirIds.includes(m.id)) : materiales;
    const filtro = texto.trim().toLowerCase();
    const lista = filtro
      ? disponibles.filter((m) => etiquetaMaterial(m).toLowerCase().includes(filtro))
      : disponibles;
    // Cuando hay varios materiales con el mismo nombre (distinto proveedor),
    // mostrar primero los que sí tienen stock disponible.
    const ordenados = [...lista].sort((a, b) => {
      const aConStock = Number(a.stock_actual) > 0 ? 0 : 1;
      const bConStock = Number(b.stock_actual) > 0 ? 0 : 1;
      return aConStock - bConStock;
    });
    return ordenados.slice(0, 40);
  }, [materiales, texto, excluirIds]);

  return (
    <div className="material-combo" ref={ref}>
      <label>Material</label>
      <input
        type="text"
        placeholder="Escribe para buscar..."
        autoComplete="off"
        required
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (materialId) onSeleccionar("", "");
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
                  onSeleccionar(String(m.id), etiquetaMaterial(m));
                  setAbierto(false);
                }}
              >
                {etiquetaMaterial(m)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
