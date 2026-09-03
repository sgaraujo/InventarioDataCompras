import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { ResumenFacturacion } from "../api/types";
import { money, moneda } from "../lib/labels";

// "2026-08" -> "ago" (granularidad "mes") / "2026-09-02" -> "02 sep" (granularidad "dia")
function periodoCorto(periodo: string, granularidad: "dia" | "mes"): string {
  if (granularidad === "dia") {
    const [anio, mes, dia] = periodo.split("-").map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  }
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "short" });
}

// Compartido entre Dashboard.tsx y Trazabilidad.tsx (2026-09-02, en pruebas)
// -- mismo grafico, mismos datos (GET /api/trazabilidad/resumen-facturacion-mensual),
// para no repetir el bloque de recharts en los dos lados. La granularidad
// (dia o mes) la decide el backend segun el rango filtrado -- ver
// resolverRangoFacturacion en trazabilidad.js.
export function GraficaFacturacionMensual({ resumen }: { resumen: ResumenFacturacion }) {
  const data = resumen.datos.map((r) => ({ ...r, periodoLabel: periodoCorto(r.periodo, resumen.granularidad) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e8" vertical={false} />
        <XAxis dataKey="periodoLabel" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => money(v)} width={70} />
        <Tooltip formatter={(value) => [moneda(Number(value)), "Facturación"]} />
        <Bar dataKey="total" name="Facturación" fill="#14919b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
