"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";

// Paleta categórica validada (contraste y separación para daltonismo) para 2 series
export const SERIES = { a: "#2a78d6", b: "#e0662b" };
const AXIS = { fontSize: 11, fill: "#64748b" };

/** Distribución de estados NAP: barras horizontales con etiqueta de texto (el color no es la única pista). */
export function StatusBars({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ key: k, label: STATUS_LABELS[k] || k, value: v }))
    .sort((a, b) => b.value - a.value);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sin datos.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 30 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={170} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v as number, "Fuentes"]} />
        <Bar dataKey="value" isAnimationActive={false} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "#334155" }}>
          {rows.map((r) => (
            <Cell key={r.key} fill={STATUS_COLORS[r.key] || "#64748b"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Acciones por prioridad (una sola serie: sin leyenda). */
export function PriorityBars({ data }: { data: Record<string, number> }) {
  const rows = ["P0", "P1", "P2", "P3"].map((p) => ({ p, value: data[p] || 0 }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} margin={{ top: 16, right: 10 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="p" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={30} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v as number, "Acciones"]} />
        <Bar dataKey="value" isAnimationActive={false} fill={SERIES.a} radius={[4, 4, 0, 0]} maxBarSize={48} label={{ position: "top", fontSize: 11, fill: "#334155" }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolución histórica: dos recuentos en el mismo eje. */
export function HistoryLines({ data }: { data: { date: string; verified: number; confirmed_inconsistencies: number }[] }) {
  if (data.length < 1) return <p className="text-sm text-muted-foreground">Aún no hay auditorías finalizadas.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 10, right: 20 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={30} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="verified" name="Citaciones verificadas" stroke={SERIES.a} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="confirmed_inconsistencies" name="Inconsistencias confirmadas" stroke={SERIES.b} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
