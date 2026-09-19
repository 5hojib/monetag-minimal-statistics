import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { StatItem } from '../types';
import { formatCurrency, formatCompactNumber, calculateCpm } from '../utils/formatters';
import { useTheme } from '../context/ThemeContext';
import { usePanZoom, clampChartWindow, ChartWindow } from '../hooks/usePanZoom';

interface ChartsSectionProps {
  stats: StatItem[];
}

type MetricId = 'revenue' | 'cpm' | 'impressions' | 'clicks';

const DEFAULT_DAYS = 30;
const MIN_SPAN = 5;

// Stops the app-level touch swipe / pull-to-refresh listeners (attached on
// `window`) from firing when a gesture begins inside the interactive chart.
const swallowTouch = (e: SyntheticEvent) => e.stopPropagation();

export default function ChartsSection({ stats }: ChartsSectionProps) {
  const [activeMetric, setActiveMetric] = useState<MetricId>('revenue');
  const [activePoint, setActivePoint] = useState<{
    date: string;
    displayDate: string;
    value: number;
  } | null>(null);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const gridColor = isDark ? '#171717' : '#f1f5f9';
  const axisColor = isDark ? '#525252' : '#94a3b8';
  const strokeColor = isDark ? '#e5e5e5' : '#0f172a';
  const fillColor = isDark ? 'rgba(245, 245, 245, 0.10)' : '#f1f5f9';
  const yAxisLineColor = isDark ? '#a3a3a3' : '#64748b';
  const xAxisLineColor = isDark ? '#404040' : '#cbd5e1';

  // The scroller shows the whole cached history; the main chart only the
  // visible slice. Every cached day is the source of truth.
  const chartData = useMemo(() => {
    return [...stats]
      .filter(item => item.date_time)
      .sort((a, b) => (a.date_time! > b.date_time! ? 1 : -1))
      .map(item => {
        const money = typeof item.money === 'string' ? parseFloat(item.money) : Number(item.money || 0);
        const impressions = typeof item.impressions === 'string' ? parseFloat(item.impressions) : Number(item.impressions || 0);
        const clicks = typeof item.clicks === 'string' ? parseFloat(item.clicks) : Number(item.clicks || 0);
        const cpm = calculateCpm(money, impressions);

        return {
          date: item.date_time,
          displayDate: item.date_time ? item.date_time.slice(5) : '', // "MM-DD"
          money: Number(money.toFixed(4)),
          cpm: Number(cpm.toFixed(4)),
          impressions: Math.round(impressions),
          clicks: Math.round(clicks),
        };
      });
  }, [stats]);

  const count = chartData.length;

  // Visible window over the whole history, in fractional day indices
  // (rounded only when slicing rows, so the scroller overlay glides
  // smoothly). Defaults to the trailing DEFAULT_DAYS. Dragging pans it,
  // pinching (or pulling the scroller edges) squeezes it.
  const [window, setWindow] = useState<ChartWindow>(() => ({
    start: Math.max(0, count - DEFAULT_DAYS),
    end: count,
  }));
  const interactedRef = useRef(false);
  const markWindowChange = useCallback((w: ChartWindow) => {
    interactedRef.current = true;
    setWindow(w);
  }, []);

  // True while any pointer is down on the chart/scroller/edges. When false,
  // the window overlay glides between positions with a CSS transition.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setWindow(prev => {
      if (count <= 0) return { start: 0, end: 0 };
      // Untouched window (first load / after reset) tracks the latest data
      // and always shows the trailing DEFAULT_DAYS.
      if (!interactedRef.current) {
        return { start: Math.max(0, count - DEFAULT_DAYS), end: count };
      }
      return clampChartWindow(prev.start, prev.end, count, MIN_SPAN);
    });
  }, [count]);

  const visible = useMemo(() => {
    const start = Math.max(0, Math.round(window.start));
    const end = Math.min(count, Math.round(window.end));
    return end > start ? chartData.slice(start, end) : [];
  }, [chartData, window, count]);

  const metricKey: Record<MetricId, 'money' | 'cpm' | 'impressions' | 'clicks'> = {
    revenue: 'money',
    cpm: 'cpm',
    impressions: 'impressions',
    clicks: 'clicks',
  };

  // Drag-to-pan / pinch-to-zoom on the main chart plot.
  const main = usePanZoom({ count, window, onChange: markWindowChange, minSpan: MIN_SPAN });
  // Same gestures on the scroller below the chart.
  const scroller = usePanZoom({ count, window, onChange: markWindowChange, minSpan: MIN_SPAN });

  // Drag the scroller's edge handles to resize ("squeeze") the window.
  const edgeRef = useRef<{ edge: 'left' | 'right'; startX: number; startWin: ChartWindow } | null>(null);

  const handleEdgeDown = (edge: 'left' | 'right') => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    edgeRef.current = { edge, startX: e.clientX, startWin: { ...window } };
  };

  const handleEdgeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = edgeRef.current;
    const el = scroller.containerRef.current;
    if (!r || !el) return;
    const rect = el.getBoundingClientRect();
    const delta = ((e.clientX - r.startX) / Math.max(1, rect.width)) * count;
    if (r.edge === 'left') {
      markWindowChange(clampChartWindow(r.startWin.start + delta, r.startWin.end, count, MIN_SPAN));
    } else {
      markWindowChange(clampChartWindow(r.startWin.start, r.startWin.end + delta, count, MIN_SPAN));
    }
  };

  const handleEdgeUp = () => {
    edgeRef.current = null;
    setDragging(false);
  };

  const handleReset = () => {
    interactedRef.current = false;
    setWindow({ start: Math.max(0, count - DEFAULT_DAYS), end: count });
  };

  const handleMetricChange = (metricId: MetricId) => {
    setActiveMetric(metricId);
    setActivePoint(null);
  };

  const handleChartInteraction = (e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
      const item = e.activePayload[0].payload;
      const val =
        activeMetric === 'revenue'
          ? item.money
          : activeMetric === 'cpm'
          ? item.cpm
          : activeMetric === 'impressions'
          ? item.impressions
          : item.clicks;
      setActivePoint({
        date: item.date,
        displayDate: item.displayDate,
        value: val,
      });
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    useEffect(() => {
      if (active && payload && payload.length > 0 && payload[0]?.payload) {
        const item = payload[0].payload;
        const val =
          activeMetric === 'revenue'
            ? item.money
            : activeMetric === 'cpm'
            ? item.cpm
            : activeMetric === 'impressions'
            ? item.impressions
            : item.clicks;

        setActivePoint(prev => {
          if (prev?.date === item.date && prev?.value === val) return prev;
          return {
            date: item.date,
            displayDate: item.displayDate,
            value: val,
          };
        });
      }
    }, [active, payload]);

    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 dark:bg-black text-white px-3 py-2 rounded text-xs space-y-1 font-mono border border-slate-800 dark:border-neutral-800">
          <div className="text-slate-400 dark:text-neutral-500 text-[11px] pb-1 border-b border-slate-800 dark:border-neutral-800">
            {data.date}
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400 dark:text-neutral-400 font-sans">Revenue</span>
            <span className="text-white font-bold">{formatCurrency(data.money)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400 dark:text-neutral-400 font-sans">CPM</span>
            <span>{formatCurrency(data.cpm)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400 dark:text-neutral-400 font-sans">Impressions</span>
            <span>{formatCompactNumber(data.impressions)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400 dark:text-neutral-400 font-sans">Clicks</span>
            <span>{formatCompactNumber(data.clicks)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-black rounded-2xl p-6 text-center text-xs text-slate-500 dark:text-neutral-400">
        No statistics available for the last 30 days.
      </div>
    );
  }

  const metrics: { id: MetricId; label: string }[] = [
    { id: 'revenue', label: 'Revenue' },
    { id: 'cpm', label: 'CPM' },
    { id: 'impressions', label: 'Impressions' },
    { id: 'clicks', label: 'Clicks' },
  ];

  const dataKey = metricKey[activeMetric];
  const isArea = activeMetric === 'revenue' || activeMetric === 'impressions';

  const renderPlot = (data: typeof chartData) =>
    isArea ? (
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} onClick={handleChartInteraction}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="displayDate" stroke={axisColor} fontSize={10} tickLine={false} fontFamily="monospace" />
        <YAxis
          stroke={axisColor}
          fontSize={10}
          tickLine={false}
          fontFamily="monospace"
          tickFormatter={(val) => (activeMetric === 'impressions' ? formatCompactNumber(val) : `$${val}`)}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        {activePoint && (
          <>
            <ReferenceLine y={activePoint.value} stroke={yAxisLineColor} strokeDasharray="3 3" strokeWidth={1.5} />
            <ReferenceLine x={activePoint.displayDate} stroke={xAxisLineColor} strokeDasharray="3 3" strokeWidth={1} />
          </>
        )}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={strokeColor}
          strokeWidth={1.5}
          fill={fillColor}
          activeDot={{ r: 4, stroke: isDark ? '#000' : '#fff', strokeWidth: 1.5, fill: strokeColor }}
          isAnimationActive={false}
        />
      </AreaChart>
    ) : (
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} onClick={handleChartInteraction}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="displayDate" stroke={axisColor} fontSize={10} tickLine={false} fontFamily="monospace" />
        <YAxis
          stroke={axisColor}
          fontSize={10}
          tickLine={false}
          fontFamily="monospace"
          tickFormatter={(val) => (activeMetric === 'cpm' ? `$${val}` : formatCompactNumber(val))}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        {activePoint && (
          <>
            <ReferenceLine y={activePoint.value} stroke={yAxisLineColor} strokeDasharray="3 3" strokeWidth={1.5} />
            <ReferenceLine x={activePoint.displayDate} stroke={xAxisLineColor} strokeDasharray="3 3" strokeWidth={1} />
          </>
        )}
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={strokeColor}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, stroke: isDark ? '#000' : '#fff', strokeWidth: 1.5, fill: strokeColor }}
          isAnimationActive={false}
        />
      </LineChart>
    );

  const isFull = window.start <= 0.001 && window.end >= count - 0.001;
  const fromIdx = Math.max(0, Math.round(window.start));
  const toIdx = Math.min(count - 1, Math.round(window.end) - 1);
  const spanDays = Math.min(count, Math.round(window.end - window.start));
  const fromLabel = chartData[fromIdx]?.displayDate ?? '';
  const toLabel = chartData[toIdx]?.displayDate ?? '';
  const windowLeft = `${(window.start / count) * 100}%`;
  const windowWidth = `${((window.end - window.start) / count) * 100}%`;
  const overlayTransition = dragging ? 'none' : 'left 200ms cubic-bezier(0.22, 1, 0.36, 1), width 200ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      id="charts-section"
      className="w-full bg-white dark:bg-black rounded-2xl p-4 transition-colors select-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none active:outline-none [&_*]:outline-none [&_*]:focus:outline-none [&_*]:focus:ring-0 [&_svg]:outline-none"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-neutral-100 uppercase tracking-wider select-none">Trend</h3>
          {!isFull && (
            <button
              id="chart-reset-zoom"
              onClick={handleReset}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white cursor-pointer select-none"
            >
              Reset
            </button>
          )}
        </div>

        {/* Metric Selector */}
        <div className="flex items-center gap-1 p-0.5 rounded-full bg-slate-100 dark:bg-neutral-900 select-none">
          {metrics.map(m => (
            <button
              key={m.id}
              id={`chart-metric-${m.id}`}
              onClick={() => handleMetricChange(m.id)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors cursor-pointer select-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none active:outline-none ${
                activeMetric === m.id
                  ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visible date range */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-neutral-500 mb-1">
        <span>
          {fromLabel} – {toLabel} · {spanDays}d
        </span>
        <span className="hidden sm:inline">Drag to pan · Pinch to zoom</span>
      </div>

      {/* Main chart — pan (drag) and pinch-zoom directly on it */}
      <div
        ref={main.containerRef}
        onPointerDown={(e) => { setDragging(true); main.onPointerDown(e); }}
        onPointerMove={main.onPointerMove}
        onPointerUp={(e) => { setDragging(false); main.onPointerUp(e); }}
        onPointerCancel={(e) => { setDragging(false); main.onPointerCancel(e); }}
        onTouchStart={swallowTouch}
        onTouchMove={swallowTouch}
        onTouchEnd={swallowTouch}
        onTouchCancel={swallowTouch}
        className="h-[240px] w-full select-none outline-none touch-none cursor-grab active:cursor-grabbing"
      >
        <ResponsiveContainer width="100%" height="100%">
          {renderPlot(visible)}
        </ResponsiveContainer>
      </div>

      {/* Scroller — mini overview of the whole history with a draggable/squeezable window */}
      <div
        ref={scroller.containerRef}
        onPointerDown={(e) => { setDragging(true); scroller.onPointerDown(e); }}
        onPointerMove={scroller.onPointerMove}
        onPointerUp={(e) => { setDragging(false); scroller.onPointerUp(e); }}
        onPointerCancel={(e) => { setDragging(false); scroller.onPointerCancel(e); }}
        onTouchStart={swallowTouch}
        onTouchMove={swallowTouch}
        onTouchEnd={swallowTouch}
        onTouchCancel={swallowTouch}
        className="relative mt-3 h-12 w-full touch-none cursor-grab active:cursor-grabbing"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={strokeColor}
              strokeWidth={1}
              fill={isDark ? 'rgba(245,245,245,0.06)' : 'rgba(15,23,42,0.06)'}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Window overlay */}
        <div
          className="absolute top-0 bottom-0 border-y-2 border-slate-400 dark:border-neutral-400 bg-slate-900/[0.07] dark:bg-white/[0.07]"
          style={{ left: windowLeft, width: windowWidth, transition: overlayTransition }}
        >
          {/* Left squeeze handle */}
          <div
            id="chart-window-edge-left"
            onPointerDown={handleEdgeDown('left')}
            onPointerMove={handleEdgeMove}
            onPointerUp={handleEdgeUp}
            onPointerCancel={handleEdgeUp}
            onTouchStart={swallowTouch}
            onTouchMove={swallowTouch}
            onTouchEnd={swallowTouch}
            onTouchCancel={swallowTouch}
            className="absolute left-0 top-0 bottom-0 w-[10px] -ml-[5px] cursor-ew-resize touch-none flex items-center justify-center"
          >
            <div className="w-[3px] h-full bg-slate-500 dark:bg-neutral-300 rounded-full" />
          </div>
          {/* Right squeeze handle */}
          <div
            id="chart-window-edge-right"
            onPointerDown={handleEdgeDown('right')}
            onPointerMove={handleEdgeMove}
            onPointerUp={handleEdgeUp}
            onPointerCancel={handleEdgeUp}
            onTouchStart={swallowTouch}
            onTouchMove={swallowTouch}
            onTouchEnd={swallowTouch}
            onTouchCancel={swallowTouch}
            className="absolute right-0 top-0 bottom-0 w-[10px] -mr-[5px] cursor-ew-resize touch-none flex items-center justify-center"
          >
            <div className="w-[3px] h-full bg-slate-500 dark:bg-neutral-300 rounded-full" />
          </div>
        </div>
      </div>

      <p className="mt-2 text-[10px] font-mono text-slate-400 dark:text-neutral-600 sm:hidden select-none">
        All days · drag the scroller to scroll · pinch or pull the edges to zoom
      </p>
    </div>
  );
}