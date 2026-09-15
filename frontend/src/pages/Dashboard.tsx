import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { supabase } from "../api/supabaseClient";
import type { Material, Movimiento, ResumenMensualMovimientos } from "../api/types";
import { useMovimientosRecientes } from "../hooks/useMovimientosRecientes";
import { PanelMovimientosRecientes } from "../components/PanelMovimientosRecientes";

function primerDiaDelMes(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
}

function primerDiaHaceSeisMeses(): string {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesCorto(mes: string): string {
  const [anio, m] = mes.split("-");
  return new Date(Number(anio), Number(m) - 1, 1).toLocaleDateString("es-CO", { month: "short" });
}

const COLOR = { success: "#2e8b3d", danger: "#c0392b" };

export function Dashboard() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [movimientosMes, setMovimientosMes] = useState<Movimiento[]>([]);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensualMovimientos[]>([]);
  const [cargando, setCargando] = useState(true);
  const { movimientos: movimientosRecientes, cargando: cargandoRecientes, error: errorRecientes } =
    useMovimientosRecientes(8);

  useEffect(() => {
    setCargando(true);
    Promise.all([
      supabase.from("materiales").select("id, stock_actual, activo").then(({ data }) => setMateriales((data as Material[]) ?? [])),
      supabase
        .from("movimientos")
        .select("id, tipo", { count: "exact" })
        .gte("creado_en", primerDiaDelMes())
        .then(({ data }) => setMovimientosMes((data as Movimiento[]) ?? [])),
      supabase
        .rpc("resumen_movimientos_mensual", { p_desde: primerDiaHaceSeisMeses() })
        .then(({ data }) => setResumenMensual((data as ResumenMensualMovimientos[]) ?? [])),
    ]).finally(() => setCargando(false));
  }, []);

  if (cargando) return <section className="view">Cargando...</section>;

  const activos = materiales.filter((m) => m.activo);
  const sinExistencias = activos.filter((m) => Number(m.stock_actual) <= 0).length;
  const conStock = activos.length - sinExistencias;

  const datosMensuales = resumenMensual.map((r) => ({ ...r, mesLabel: mesCorto(r.mes) }));
  const navigate = useNavigate();

  return (
    <section className="view">
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card__label">Total materiales</span>
          <span className="stat-card__value">{activos.length}</span>
        </div>
        <div className="stat-card stat-card--info">
          <span className="stat-card__label">Con existencias</span>
          <span className="stat-card__value">{conStock}</span>
        </div>
        <div
          className="stat-card stat-card--danger"
          role="button"
          title="Ver materiales sin existencias"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("/materiales?stock=sin")}
        >
          <span className="stat-card__label">Sin existencias</span>
          <span className="stat-card__value">{sinExistencias}</span>
        </div>
        <div className="stat-card stat-card--warn">
          <span className="stat-card__label">Movimientos este mes</span>
          <span className="stat-card__value">{movimientosMes.length}</span>
        </div>
      </div>

      <div className="dashboard-graficas">
        <div className="panel">
          <h2>Entradas vs. salidas por mes</h2>
          {datosMensuales.length === 0 ? (
            <div className="empty-state">Aún no hay movimientos registrados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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
          )}
        </div>
      </div>

      <PanelMovimientosRecientes movimientos={movimientosRecientes} cargando={cargandoRecientes} error={errorRecientes} />
    </section>
  );
}
