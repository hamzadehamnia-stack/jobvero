'use client';

import { FileText, Briefcase, Mail, BarChart3, Send, Mic, Flame, TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';

const ICON_MAP: Record<string, LucideIcon> = {
  FileText,
  Briefcase,
  Mail,
  BarChart3,
  Send,
  Mic,
  Flame,
};

interface Props {
  label: string;
  value: number | string;
  iconName: string;
  color: string;
  data: number[];
  delta?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export default function StatCard({ label, value, iconName, color, data, delta, trend = 'neutral' }: Props) {
  const Icon      = ICON_MAP[iconName] ?? FileText;
  const chartData = data.map((v, i) => ({ i, v }));

  const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-400' : 'text-gray-400';
  const trendBg    = trend === 'up'
    ? 'bg-emerald-50 dark:bg-emerald-950/40'
    : trend === 'down'
    ? 'bg-red-50 dark:bg-red-950/30'
    : 'bg-gray-100 dark:bg-gray-800/60';

  return (
    <div className="relative bg-white/80 dark:bg-[#111827]/90 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-[#1F2937] p-5 shadow-sm hover:shadow-xl hover:shadow-gray-200/40 dark:hover:shadow-black/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden group cursor-default">
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${color}0D 0%, transparent 65%)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ backgroundColor: color + '18' }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${trendBg} ${trendColor}`}>
            {trend === 'up'   && <TrendingUp   size={9} />}
            {trend === 'down' && <TrendingDown  size={9} />}
            {delta}
          </span>
        )}
      </div>

      {/* Value + label */}
      <p className="text-3xl font-black text-gray-900 dark:text-white leading-none mb-1 tabular-nums tracking-tight">{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 leading-none mb-4 font-medium">{label}</p>

      {/* Sparkline */}
      <div className="h-12 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip contentStyle={{ display: 'none' }} cursor={false} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${label.replace(/\s/g, '')})`}
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
