'use client';

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Chart data types ──────────────────────────────────────────────
export interface ChartDataPoint {
  label: string;        // x-axis label (date, category, etc.)
  value: number;        // primary value
  value2?: number;      // optional secondary series
}

export interface ChartConfig {
  type: 'area' | 'bar' | 'line';
  title?: string;
  data: ChartDataPoint[];
  color?: string;       // primary color (default: violet)
  color2?: string;      // secondary series color
  label?: string;       // series name
  label2?: string;      // secondary series name
  height?: number;
}

// ── Palette ───────────────────────────────────────────────────────
const COLORS = {
  violet: { fill: '#8b5cf6', gradient: '#8b5cf620' },
  blue:   { fill: '#3b82f6', gradient: '#3b82f620' },
  green:  { fill: '#22c55e', gradient: '#22c55e20' },
  orange: { fill: '#f97316', gradient: '#f9731620' },
  pink:   { fill: '#ec4899', gradient: '#ec489920' },
};

function getColor(name?: string): { fill: string; gradient: string } {
  return COLORS[(name as keyof typeof COLORS)] || COLORS.violet;
}

// ── Custom tooltip ────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Main chart component ──────────────────────────────────────────
export function KanChart({ config }: { config: ChartConfig }) {
  const { type, title, data, color, color2, label = 'Value', label2 = 'Value 2', height = 200 } = config;
  const c1 = getColor(color);
  const c2 = getColor(color2 || 'blue');
  const hasSeries2 = data.some(d => d.value2 !== undefined);

  if (data.length === 0) return null;

  const commonProps = {
    data,
    margin: { top: 4, right: 4, bottom: 0, left: -12 },
  };

  const commonChildren = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        className="fill-neutral-500 dark:fill-neutral-400"
      />
      <YAxis
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        className="fill-neutral-500 dark:fill-neutral-400"
        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)}
      />
      <Tooltip content={<ChartTooltip />} />
    </>
  );

  return (
    <div className="my-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
      {title && (
        <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-2 uppercase tracking-wide">{title}</h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {type === 'area' ? (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c1.fill} stopOpacity={0.3} />
                <stop offset="100%" stopColor={c1.fill} stopOpacity={0.05} />
              </linearGradient>
              {hasSeries2 && (
                <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c2.fill} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={c2.fill} stopOpacity={0.05} />
                </linearGradient>
              )}
            </defs>
            {commonChildren}
            <Area type="monotone" dataKey="value" name={label} stroke={c1.fill} fill="url(#grad1)" strokeWidth={2} />
            {hasSeries2 && <Area type="monotone" dataKey="value2" name={label2} stroke={c2.fill} fill="url(#grad2)" strokeWidth={2} />}
          </AreaChart>
        ) : type === 'bar' ? (
          <BarChart {...commonProps}>
            {commonChildren}
            <Bar dataKey="value" name={label} fill={c1.fill} radius={[4, 4, 0, 0]} />
            {hasSeries2 && <Bar dataKey="value2" name={label2} fill={c2.fill} radius={[4, 4, 0, 0]} />}
          </BarChart>
        ) : (
          <LineChart {...commonProps}>
            {commonChildren}
            <Line type="monotone" dataKey="value" name={label} stroke={c1.fill} strokeWidth={2} dot={false} />
            {hasSeries2 && <Line type="monotone" dataKey="value2" name={label2} stroke={c2.fill} strokeWidth={2} dot={false} />}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ── Parse chart directives from AI response text ──────────────────
// Format: ```chart\n{json}\n```
export function parseChartDirectives(text: string): { cleanText: string; charts: ChartConfig[] } {
  const charts: ChartConfig[] = [];
  const cleanText = text.replace(/```chart\n([\s\S]*?)```/g, (_, json) => {
    try {
      const config = JSON.parse(json);
      if (config.data && Array.isArray(config.data)) {
        charts.push(config);
      }
    } catch { /* ignore invalid chart JSON */ }
    return ''; // Remove the chart block from text
  });

  return { cleanText: cleanText.trim(), charts };
}
