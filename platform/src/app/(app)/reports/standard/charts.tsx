"use client";

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LabelList, CartesianGrid, Legend,
} from "recharts";

type Datum = { name: string; value: number };

const BRAND = "#8DC63F";
const SLATE = "#94a3b8";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const moneyShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};
const num = (n: number) => n.toLocaleString();
const short = (s: string) => (s.length > 22 ? s.slice(0, 21) + "…" : s);
const tooltipStyle = { borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(15,23,42,.08)", fontSize: 12, padding: "8px 10px" };

export function ChartPanel({ title, subtitle, height = 300, children }: { title: string; subtitle?: string; height?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {subtitle && <span className="text-xs text-neutral-400">{subtitle}</span>}
      </div>
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

/** Stacked monthly revenue: migrated history + current orders. */
export function RevenueTrendChart({ data }: { data: { label: string; historical: number; current: number; total: number }[] }) {
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id="g-hist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SLATE} stopOpacity={0.6} />
            <stop offset="100%" stopColor={SLATE} stopOpacity={0.08} />
          </linearGradient>
          <linearGradient id="g-cur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.85} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10, fill: "#94a3b8" }} width={46} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v, n) => [money(Number(v)), n === "historical" ? "SAP history" : "MakeReady"]} contentStyle={tooltipStyle} />
        <Legend formatter={(v) => (v === "historical" ? "SAP history" : "MakeReady")} wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Area type="monotone" dataKey="historical" stackId="1" stroke={SLATE} fill="url(#g-hist)" strokeWidth={1.5} />
        <Area type="monotone" dataKey="current" stackId="1" stroke={BRAND} fill="url(#g-cur)" strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars, brand-colored, value labels on the right. */
export function HBars({ data, kind = "money", color = BRAND, gid }: { data: Datum[]; kind?: "money" | "num"; color?: string; gid: string }) {
  const fmt = kind === "money" ? money : num;
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.7} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "#475569" }} tickFormatter={short} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => fmt(Number(v))} cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill={`url(#${gid})`} radius={[0, 5, 5, 0]} maxBarSize={22}>
          <LabelList dataKey="value" position="right" formatter={(v) => (kind === "money" ? moneyShort(Number(v)) : num(Number(v)))} style={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Grouped vertical bars for two series (e.g. won $ vs order $ per rep). */
export function GroupedBars({ data, aKey, bKey, aLabel, bLabel }: { data: Record<string, number | string>[]; aKey: string; bKey: string; aLabel: string; bLabel: string }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 16, right: 8, left: -8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} interval={0} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10, fill: "#94a3b8" }} width={46} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Bar dataKey={aKey} name={aLabel} fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={34} />
        <Bar dataKey={bKey} name={bLabel} fill="#334155" radius={[4, 4, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ResponsiveContainer>
  );
}
