'use client';

// recharts is the heaviest single dep on /dashboard/analytics. Extracting
// the two chart blocks into a separate client module lets analytics-client
// dynamic-import them so the recharts bundle is only fetched on this route
// (and only after the KPI grid + empty states render). Pure perf split —
// no behaviour change. See cleanup lane 2026-05-05.
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import type { DailyRow, TopItemRow } from './types';

const RON = (v: number) => `${v.toFixed(2)} RON`;

export function RevenueLineChart({ daily }: { daily: DailyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={daily} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="day" stroke="#71717a" fontSize={12} />
        <YAxis stroke="#71717a" fontSize={12} />
        <Tooltip
          formatter={(v) => RON(Number(v))}
          contentStyle={{ borderRadius: 6, border: '1px solid #e4e4e7' }}
        />
        <Line type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TopItemsBarChart({ topItems }: { topItems: TopItemRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={topItems} margin={{ top: 5, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          dataKey="item_name"
          stroke="#71717a"
          fontSize={11}
          angle={-25}
          textAnchor="end"
          height={60}
          interval={0}
        />
        <YAxis stroke="#71717a" fontSize={12} />
        <Tooltip
          formatter={(v) => RON(Number(v))}
          contentStyle={{ borderRadius: 6, border: '1px solid #e4e4e7' }}
        />
        <Bar dataKey="revenue" fill="#7c3aed" />
      </BarChart>
    </ResponsiveContainer>
  );
}
