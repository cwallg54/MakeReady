"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList, CartesianGrid } from "recharts";

type Datum = { name: string; value: number };

const PALETTE = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#0891b2", "#64748b"];
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const num = (n: number) => n.toLocaleString();
const short = (s: string) => (s.length > 20 ? s.slice(0, 19) + "…" : s);

const tooltipStyle = { borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(15,23,42,.08)", fontSize: 12, padding: "8px 10px" };

function Panel({ title, subtitle, children, height = 280 }: { title: string; subtitle?: string; children: React.ReactNode; height?: number }) {
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

function Donut({ data, fmt }: { data: Datum[]; fmt: (n: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative h-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [fmt(Number(v)), String(n)]} contentStyle={tooltipStyle} />
          <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ top: "-14%" }}>
        <div className="text-2xl font-bold text-neutral-900">{fmt(total)}</div>
        <div className="text-xs text-neutral-400">total</div>
      </div>
    </div>
  );
}

function HBar({ data, fmt, gid, color }: { data: Datum[]; fmt: (n: number) => string; gid: string; color: string }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.75} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11, fill: "#475569" }} tickFormatter={short} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => fmt(Number(v))} cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill={`url(#${gid})`} radius={[0, 5, 5, 0]} maxBarSize={22}>
          <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ReportCharts({ pipeline, byState, byGroup, categoryValue, categoryUnits, ordersByStage }: {
  pipeline: Datum[]; byState: Datum[]; byGroup: Datum[]; categoryValue: Datum[]; categoryUnits: Datum[]; ordersByStage: Datum[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Accounts by lifecycle stage" subtitle="CRM">
        <Donut data={pipeline} fmt={num} />
      </Panel>
      <Panel title="Inventory value by category" subtitle="top 12 · $ on hand">
        <HBar data={categoryValue} fmt={money} gid="g-catval" color="#2563eb" />
      </Panel>
      <Panel title="Accounts by state" subtitle="top 12">
        <HBar data={byState} fmt={num} gid="g-state" color="#0ea5e9" />
      </Panel>
      <Panel title="Accounts by account group" subtitle="top 10">
        <HBar data={byGroup} fmt={num} gid="g-group" color="#a855f7" />
      </Panel>
      <Panel title="On-hand units by category" subtitle="top 12">
        <HBar data={categoryUnits} fmt={num} gid="g-units" color="#14b8a6" />
      </Panel>
      <Panel title="Orders by stage" subtitle="active pipeline">
        <ResponsiveContainer>
          <BarChart data={ordersByStage} margin={{ top: 16, left: -18, right: 8 }}>
            <defs>
              <linearGradient id="g-orders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.65} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} interval={0} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={34} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => num(Number(v))} cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill="url(#g-orders)" radius={[5, 5, 0, 0]} maxBarSize={54}>
              <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
