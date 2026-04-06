'use client';

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, Legend,
  ScatterChart, Scatter, Treemap,
  FunnelChart, Funnel, LabelList,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Chart data types ──────────────────────────────────────────────
export interface ChartDataPoint {
  label: string;
  value: number;
  value2?: number;
  [key: string]: unknown;  // allow arbitrary extra fields
}

export type ChartType = 'area' | 'bar' | 'line' | 'pie' | 'donut' | 'radar' | 'radialBar' | 'scatter' | 'treemap' | 'funnel' | 'composed';

export interface ChartConfig {
  type: ChartType;
  title?: string;
  data: ChartDataPoint[];
  color?: string;
  color2?: string;
  label?: string;
  label2?: string;
  height?: number;
  stacked?: boolean;      // for bar/area
  composedTypes?: ('bar' | 'line' | 'area')[];  // for composed chart
}

// ── Palette ───────────────────────────────────────────────────────
const PALETTE = [
  '#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#ec4899',
  '#14b8a6', '#f59e0b', '#ef4444', '#6366f1', '#84cc16',
];

const COLORS: Record<string, { fill: string }> = {
  violet: { fill: '#8b5cf6' },
  blue:   { fill: '#3b82f6' },
  green:  { fill: '#22c55e' },
  orange: { fill: '#f97316' },
  pink:   { fill: '#ec4899' },
  teal:   { fill: '#14b8a6' },
  amber:  { fill: '#f59e0b' },
  red:    { fill: '#ef4444' },
  indigo: { fill: '#6366f1' },
  lime:   { fill: '#84cc16' },
};

function getColor(name?: string): string {
  return COLORS[name as keyof typeof COLORS]?.fill || COLORS.violet.fill;
}

// ── Custom tooltip ────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-medium text-neutral-500 dark:text-neutral-400 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Shared axis + grid for XY charts ──────────────────────────────
function XYChildren() {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-neutral-500 dark:fill-neutral-400" />
      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-neutral-500 dark:fill-neutral-400" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)} />
      <Tooltip content={<ChartTooltip />} />
    </>
  );
}

// ── Main chart component ──────────────────────────────────────────
export function KanChart({ config }: { config: ChartConfig }) {
  const { type, title, data, color, color2, label = 'Value', label2 = 'Value 2', height = 220, stacked, composedTypes } = config;
  const c1 = getColor(color);
  const c2 = getColor(color2 || 'blue');
  const hasSeries2 = data.some(d => d.value2 !== undefined);

  if (!data?.length) return null;

  const margin = { top: 4, right: 4, bottom: 0, left: -12 };

  const renderChart = () => {
    switch (type) {
      // ── Area ──
      case 'area':
        return (
          <AreaChart data={data} margin={margin}>
            <defs>
              <linearGradient id={`grad-${c1}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c1} stopOpacity={0.3} />
                <stop offset="100%" stopColor={c1} stopOpacity={0.05} />
              </linearGradient>
              {hasSeries2 && (
                <linearGradient id={`grad-${c2}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c2} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={c2} stopOpacity={0.05} />
                </linearGradient>
              )}
            </defs>
            <XYChildren />
            <Area type="monotone" dataKey="value" name={label} stroke={c1} fill={`url(#grad-${c1})`} strokeWidth={2} stackId={stacked ? '1' : undefined} />
            {hasSeries2 && <Area type="monotone" dataKey="value2" name={label2} stroke={c2} fill={`url(#grad-${c2})`} strokeWidth={2} stackId={stacked ? '1' : undefined} />}
          </AreaChart>
        );

      // ── Bar ──
      case 'bar':
        return (
          <BarChart data={data} margin={margin}>
            <XYChildren />
            <Bar dataKey="value" name={label} fill={c1} radius={[4, 4, 0, 0]} stackId={stacked ? '1' : undefined} />
            {hasSeries2 && <Bar dataKey="value2" name={label2} fill={c2} radius={[4, 4, 0, 0]} stackId={stacked ? '1' : undefined} />}
          </BarChart>
        );

      // ── Line ──
      case 'line':
        return (
          <LineChart data={data} margin={margin}>
            <XYChildren />
            <Line type="monotone" dataKey="value" name={label} stroke={c1} strokeWidth={2} dot={{ r: 3, fill: c1 }} />
            {hasSeries2 && <Line type="monotone" dataKey="value2" name={label2} stroke={c2} strokeWidth={2} dot={{ r: 3, fill: c2 }} />}
          </LineChart>
        );

      // ── Pie / Donut ──
      case 'pie':
      case 'donut':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={type === 'donut' ? '55%' : 0}
              outerRadius="80%"
              paddingAngle={2}
              label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        );

      // ── Radar ──
      case 'radar':
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid className="stroke-neutral-200 dark:stroke-neutral-700" />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-neutral-500 dark:fill-neutral-400" />
            <PolarRadiusAxis tick={{ fontSize: 10 }} className="fill-neutral-400" />
            <Radar name={label} dataKey="value" stroke={c1} fill={c1} fillOpacity={0.25} strokeWidth={2} />
            {hasSeries2 && <Radar name={label2} dataKey="value2" stroke={c2} fill={c2} fillOpacity={0.15} strokeWidth={2} />}
            <Tooltip content={<ChartTooltip />} />
          </RadarChart>
        );

      // ── Radial Bar ──
      case 'radialBar':
        return (
          <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={data.map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length] }))}>
            <RadialBar dataKey="value" label={{ position: 'insideStart', fill: '#fff', fontSize: 11 }} />
            <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" />
            <Tooltip content={<ChartTooltip />} />
          </RadialBarChart>
        );

      // ── Scatter ──
      case 'scatter':
        return (
          <ScatterChart margin={margin}>
            <XYChildren />
            <Scatter name={label} data={data} fill={c1} dataKey="value" />
          </ScatterChart>
        );

      // ── Treemap ──
      case 'treemap':
        return (
          <Treemap
            data={data.map((d, i) => ({ name: d.label, size: d.value, fill: PALETTE[i % PALETTE.length] }))}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="none"
            content={({ x, y, width, height: h, name, value }: { x: number; y: number; width: number; height: number; name?: string; value?: number }) => (
              <g>
                <rect x={x} y={y} width={width} height={h} rx={4} fill={PALETTE[data.findIndex(d => d.label === name) % PALETTE.length]} className="opacity-80 hover:opacity-100 transition-opacity" />
                {width > 50 && h > 30 && (
                  <>
                    <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>{name}</text>
                    <text x={x + 8} y={y + 32} fill="#ffffffbb" fontSize={10}>{typeof value === 'number' ? value.toLocaleString() : value}</text>
                  </>
                )}
              </g>
            )}
          />
        );

      // ── Funnel ──
      case 'funnel':
        return (
          <FunnelChart>
            <Tooltip content={<ChartTooltip />} />
            <Funnel dataKey="value" data={data.map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length], name: d.label }))} isAnimationActive>
              <LabelList position="center" fill="#fff" fontSize={12} fontWeight={600} />
            </Funnel>
          </FunnelChart>
        );

      // ── Composed (mixed bar + line + area) ──
      case 'composed': {
        const types = composedTypes || ['bar', 'line'];
        return (
          <ComposedChart data={data} margin={margin}>
            <XYChildren />
            {types[0] === 'bar' && <Bar dataKey="value" name={label} fill={c1} radius={[4, 4, 0, 0]} />}
            {types[0] === 'line' && <Line type="monotone" dataKey="value" name={label} stroke={c1} strokeWidth={2} dot={false} />}
            {types[0] === 'area' && <Area type="monotone" dataKey="value" name={label} stroke={c1} fill={c1} fillOpacity={0.15} strokeWidth={2} />}
            {hasSeries2 && types[1] === 'line' && <Line type="monotone" dataKey="value2" name={label2} stroke={c2} strokeWidth={2} dot={false} />}
            {hasSeries2 && types[1] === 'bar' && <Bar dataKey="value2" name={label2} fill={c2} radius={[4, 4, 0, 0]} />}
            {hasSeries2 && types[1] === 'area' && <Area type="monotone" dataKey="value2" name={label2} stroke={c2} fill={c2} fillOpacity={0.15} strokeWidth={2} />}
          </ComposedChart>
        );
      }

      default:
        return (
          <BarChart data={data} margin={margin}>
            <XYChildren />
            <Bar dataKey="value" name={label} fill={c1} radius={[4, 4, 0, 0]} />
          </BarChart>
        );
    }
  };

  return (
    <div className="my-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
      {title && (
        <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-2 uppercase tracking-wide">{title}</h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

// ── Parse chart directives from AI response text ──────────────────
// Format: ```chart\n{json}\n```
export interface TableConfig {
  title?: string;
  columns: string[];
  rows: Record<string, string>[];
}

export function parseChartDirectives(text: string): { cleanText: string; charts: ChartConfig[]; tables: TableConfig[] } {
  const charts: ChartConfig[] = [];
  const tables: TableConfig[] = [];
  let cleanText = text.replace(/```chart\n([\s\S]*?)```/g, (_, json) => {
    try {
      const config = JSON.parse(json);
      if (config.data && Array.isArray(config.data)) {
        charts.push(config);
      }
    } catch { /* ignore invalid chart JSON */ }
    return '';
  });

  cleanText = cleanText.replace(/```table\n([\s\S]*?)```/g, (_, json) => {
    try {
      const config = JSON.parse(json);
      if (config.columns && config.rows) {
        tables.push(config);
      }
    } catch { /* ignore invalid table JSON */ }
    return '';
  });

  return { cleanText: cleanText.trim(), charts, tables };
}
