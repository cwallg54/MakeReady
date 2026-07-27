"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

const COLORS = ["#1d4ed8", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const num = (n: number) => n.toLocaleString();

type Datum = { name: string; value: number };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-neutral-900">{title}</h3>
      <div style={{ width: "100%", height: 240 }}>{children}</div>
    </div>
  );
}

export function ReportCharts({ pipeline, quoteValue, categoryValue, ordersByStage }: {
  pipeline: Datum[]; quoteValue: Datum[]; categoryValue: Datum[]; ordersByStage: Datum[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Pipeline">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pipeline} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(d) => `${d.name}: ${num(Number(d.value))}`} labelLine={false}>
              {pipeline.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => num(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Quoted value by status">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={quoteValue} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(d) => d.name} labelLine={false}>
              {quoteValue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Inventory value by category">
        <ResponsiveContainer>
          <BarChart data={categoryValue} layout="vertical" margin={{ left: 20, right: 40 }}>
            <XAxis type="number" tickFormatter={(v) => money(Number(v))} hide />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="value" fill="#1d4ed8" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="value" position="right" formatter={(v) => money(Number(v))} style={{ fontSize: 10, fill: "#475569" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Orders by stage">
        <ResponsiveContainer>
          <BarChart data={ordersByStage} margin={{ top: 10 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
            <Tooltip formatter={(v) => num(Number(v))} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: "#475569" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
