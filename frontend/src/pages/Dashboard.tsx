import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { api } from "../api/client";
import type {
  Material,
  Movimiento,
  ResumenMensualMovimientos,
  ResumenEstadoSolicitudes,
  ResumenFacturacion,
} from "../api/types";
import { ESTADO_LABEL, ESTADO_SOLICITUD_LABEL, money, esAdmin } from "../lib/labels";
import { useAuth } from "../context/AuthContext";
import { GraficaFacturacionMensual } from "../components/GraficaFacturacionMensual";

function primerDiaDelMes(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
}

// "2026-08" -> "ago" (eje X de los graficos de barras mensuales)
function mesCorto(mes: string): string {
  const [anio, m] = mes.split("-");
  return new Date(Number(anio), Number(m) - 1, 1).toLocaleDateString("es-CO", { month: "short" });
}

// Mismos colores que ya usan los badges/stat-cards en toda la app (ver
// index.css) -- se repiten aca en hex porque un <svg> de recharts no puede
// leer var(--...) de forma confiable en el atributo "fill".
const COLOR = {
  teal: "#14919b",
  success: "#2e8b3d",
  warning: "#b45309",
  danger: "#c0392b",
  gris: "#94a3b8",
};

// Mismo criterio de color que .badge.pendiente/.aprobada/.rechazada/.lista/
// .cancelada en index.css, para que el grafico use el mismo lenguaje visual
// que las etiquetas de estado en el resto de la app.
const COLOR_ESTADO_SOLICITUD: Record<string, string> = {
  pendiente: COLOR.warning,
  aprobada: COLOR.success,
  rechazada: COLOR.danger,
  lista: COLOR.teal,
  cancelada: COLOR.gris,
};

export function Dashboard() {
  const { usuario } = useAuth();
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [movimientosRecientes, setMovimientosRecientes] = useState<Movimiento[]>([]);
  const [movimientosMes, setMovimientosMes] = useState<Movimiento[]>([]);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensualMovimientos[]>([]);
  const [resumenEstado, setResumenEstado] = useState<ResumenEstadoSolicitudes[]>([]);
  const [resumenFacturacion, setResumenFacturacion] = useState<ResumenFacturacion>({ granularidad: "mes", datos: [] });
  const [cargando, setCargando] = useState(true);

  // Que grafico le corresponde a cada rol (ver conversacion de diseño):
  // - salud del stock: todos.
  // - entradas vs salidas: a quien le importa el flujo general de material
  //   (admin/coordinador/almacenista/consulta), no al tecnico/supervisor que
  //   solo les interesa el estado de SUS solicitudes.
  // - facturacion mensual: solo quien ve precios (ver esAdmin en labels.ts).
  // - solicitudes por estado: supervisor (todas) y tecnico (las suyas, el
  //   backend ya filtra) -- son quienes mueven ese flujo dia a dia.
  const puedeVerFacturacion = esAdmin(usuario);
  const mostrarEntradasSalidas = esAdmin(usuario) || usuario?.rol === "almacenista" || usuario?.rol === "consulta";
  const mostrarSolicitudesEstado = usuario?.rol === "supervisor" || usuario?.rol === "tecnico-ejecutor";

  useEffect(() => {
    setCargando(true);
    const cargas: Promise<unknown>[] = [
      api.get<Material[]>("/api/materiales").then(setMateriales),
      api.get<Movimiento[]>("/api/movimientos").then((v) => setMovimientosRecientes(v.slice(0, 8))),
      api.get<Movimiento[]>(`/api/movimientos?desde=${primerDiaDelMes()}`).then(setMovimientosMes),
    ];
    if (mostrarEntradasSalidas) {
      cargas.push(api.get<ResumenMensualMovimientos[]>("/api/movimientos/resumen-mensual").then(setResumenMensual));
    }
    if (mostrarSolicitudesEstado) {
      cargas.push(
        api.get<ResumenEstadoSolicitudes[]>("/api/solicitudes-salida/resumen-estado").then(setResumenEstado)
      );
    }
    if (puedeVerFacturacion) {
      cargas.push(
        api.get<ResumenFacturacion>("/api/trazabilidad/resumen-facturacion-mensual").then(setResumenFacturacion)
      );
    }
    Promise.all(cargas).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) return <section className="view">Cargando...</section>;

  const bajoMinimo = materiales.filter((m) => m.estado === "bajo_minimo").length;
  const sinExistencias = materiales.filter((m) => m.estado === "sin_existencias").length;
  const ok = materiales.length - bajoMinimo - sinExistencias;

  const datosStock = [
    { name: ESTADO_LABEL.ok, value: ok, color: COLOR.teal },
    { name: ESTADO_LABEL.bajo_minimo, value: bajoMinimo, color: COLOR.warning },
    { name: ESTADO_LABEL.sin_existencias, value: sinExistencias, color: COLOR.danger },
  ].filter((d) => d.value > 0);

  const datosMensuales = resumenMensual.map((r) => ({ ...r, mesLabel: mesCorto(r.mes) }));
  const datosEstado = resumenEstado
    .filter((r) => r.total > 0)
    .map((r) => ({
      name: ESTADO_SOLICITUD_LABEL[r.estado],
      value: r.total,
      color: COLOR_ESTADO_SOLICITUD[r.estado] || COLOR.gris,
    }));

  const prioridad: Record<string, number> = { sin_existencias: 0, bajo_minimo: 1 };
  const criticos = materiales
    .filter((m) => m.estado === "sin_existencias" || m.estado === "bajo_minimo")
    .sort((a, b) => {
      if (prioridad[a.estado] !== prioridad[b.estado]) return prioridad[a.estado] - prioridad[b.estado];
      return Number(b.stock_minimo) - Number(b.stock_actual) - (Number(a.stock_minimo) - Number(a.stock_actual));
    })
    .slice(0, 10);

  return (
    <section className="view">
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card__label">Total materiales</span>
          <span className="stat-card__value">{materiales.length}</span>
        </div>
        <div className="stat-card stat-card--warn">
          <span className="stat-card__label">Bajo mínimo</span>
          <span className="stat-card__value">{bajoMinimo}</span>
        </div>
        <div className="stat-card stat-card--danger">
          <span className="stat-card__label">Sin existencias</span>
          <span className="stat-card__value">{sinExistencias}</span>
        </div>
        <div className="stat-card stat-card--info">
          <span className="stat-card__label">Movimientos este mes</span>
          <span className="stat-card__value">{movimientosMes.length}</span>
        </div>
      </div>

      <div className="dashboard-graficas">
        <div className="panel">
          <h2>Salud del stock</h2>
          {datosStock.length === 0 ? (
            <div className="empty-state">No hay materiales registrados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={datosStock} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {datosStock.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} materiales`, undefined]} />
                <Legend verticalAlign="bottom" height={32} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {mostrarEntradasSalidas && (
          <div className="panel">
            <h2>Entradas vs. salidas (últimos 6 meses)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datosMensuales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e8" vertical={false} />
                <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                <Tooltip />
                <Legend />
                <Bar dataKey="entradas" name="Entradas" fill={COLOR.success} radius={[4, 4, 0, 0]} />
                <Bar dataKey="salidas" name="Salidas" fill={COLOR.danger} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {puedeVerFacturacion && (
          <div className="panel">
            <h2>Facturación mensual</h2>
            <GraficaFacturacionMensual resumen={resumenFacturacion} />
          </div>
        )}

        {mostrarSolicitudesEstado && (
          <div className="panel">
            <h2>{usuario?.rol === "tecnico-ejecutor" ? "Mis solicitudes" : "Solicitudes"} por estado (30 días)</h2>
            {datosEstado.length === 0 ? (
              <div className="empty-state">Sin solicitudes en los últimos 30 días.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={datosEstado} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                    {datosEstado.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} solicitudes`, undefined]} />
                  <Legend verticalAlign="bottom" height={32} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Materiales críticos</h2>
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {criticos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Todos los materiales están dentro del stock mínimo.
                  </td>
                </tr>
              ) : (
                criticos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.producto}</td>
                    <td>
                      <span className="cat-pill">{m.categoria_nombre || "—"}</span>
                    </td>
                    <td>
                      {money(m.stock_actual)} {m.unidad}
                    </td>
                    <td>
                      {money(m.stock_minimo)} {m.unidad}
                    </td>
                    <td>
                      <span className={`badge ${m.estado}`}>{ESTADO_LABEL[m.estado]}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Últimos movimientos</h2>
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {movimientosRecientes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Aún no hay movimientos registrados.
                  </td>
                </tr>
              ) : (
                movimientosRecientes.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.creado_en).toLocaleString("es-CO")}</td>
                    <td>{m.producto}</td>
                    <td>
                      <span className={`badge ${m.tipo}`}>{m.tipo === "entrada" ? "Entrada" : "Salida"}</span>
                    </td>
                    <td>
                      {money(m.cantidad)} {m.unidad}
                    </td>
                    <td>{m.responsable || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
