import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  WifiOff,
  RefreshCw,
  BarChart2,
  TrendingUp,
  BarChart3,
  Layers,
  Download,
  FileText,
} from "lucide-react";
import {
  db,
  ref,
  query,
  limitToLast,
  onValue,
  off,
  mapArduinoReading,
  DB_PATHS,
} from "@/lib/firebase";

// Truncates to exactly 2 decimal places WITHOUT rounding
function truncTo2(v) {
  if (v === null || v === undefined) return "--";
  return (Math.floor(Number(v) * 100) / 100).toFixed(2);
}

const THRESHOLDS = {
  air_temperature: { safeMin: 25, safeMax: 32, cautionMin: 22, cautionMax: 35 },
  temperature: { safeMin: 26, safeMax: 31, cautionMin: 24, cautionMax: 33 },
  humidity: { safeMin: 65, safeMax: 85, cautionMin: 55, cautionMax: 90 },
  ph: { safeMin: 7.8, safeMax: 8.3, cautionMin: 7.5, cautionMax: 8.5 },
  turbidity: { safeMin: 0, safeMax: 25, cautionMin: 0, cautionMax: 50 },
};

const SENSOR_META = [
  { key: "air_temperature", name: "Air Temp", unit: "°C", color: "hsl(var(--caution))" },
  { key: "temperature", name: "Water Temp", unit: "°C", color: "hsl(var(--primary))" },
  { key: "humidity", name: "Humidity", unit: "%", color: "hsl(var(--accent))" },
  { key: "ph", name: "pH Level", unit: "pH", color: "hsl(var(--caution))" },
  { key: "turbidity", name: "Turbidity", unit: "NTU", color: "hsl(var(--danger))" },
];

const TIME_RANGES = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const TIME_LABELS = {
  day: "Last 24 Hours",
  week: "Last 7 Days",
  month: "Last 30 Days",
};

const GRAPH_TYPES = [
  { id: "line", label: "Line Chart", icon: TrendingUp, desc: "Best for continuous trend analysis over time" },
  { id: "area", label: "Area Chart", icon: Layers, desc: "Highlights volume and range fluctuations" },
  { id: "bar", label: "Bar Chart", icon: BarChart3, desc: "Compares individual reading intervals" },
];

// Derive per-reading overall release status
function readingReleaseStatus(entry) {
  let dangerCount = 0;
  let cautionCount = 0;
  SENSOR_META.forEach(({ key }) => {
    const v = entry[key];
    if (v === null || v === undefined) return;
    const t = THRESHOLDS[key];
    if (v < t.cautionMin || v > t.cautionMax) dangerCount++;
    else if (v < t.safeMin || v > t.safeMax) cautionCount++;
  });
  if (dangerCount >= 1) return "danger";
  if (cautionCount >= 2) return "nogo_caution";
  if (cautionCount === 1) return "go_caution";
  return "go";
}

// ── Export helpers ──────────────────────────────────────────────────────────
function exportTrendsCSV(data, timeLabel) {
  const headers = ["Timestamp", "Air Temp (°C)", "Water Temp (°C)", "Humidity (%)", "pH", "Turbidity (NTU)", "Release Status"];
  const rows = data.map((e) => [
    new Date(e.timestamp).toLocaleString("en-PH"),
    e.air_temperature ?? "",
    e.temperature ?? "",
    e.humidity ?? "",
    e.ph ?? "",
    e.turbidity ?? "",
    readingReleaseStatus(e).toUpperCase().replace(/_/g, " "),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bantay-dagat-trends-${timeLabel.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTrendsPDF(data, timeLabel) {
  const statusMap = { go: "GO", go_caution: "GO (Caution)", nogo_caution: "NO-GO (Caution)", danger: "NO-GO (Danger)" };
  const rows = data.map((e) => {
    const s = readingReleaseStatus(e);
    const color = s === "go" ? "#16a34a" : s === "go_caution" ? "#d97706" : s === "nogo_caution" ? "#ea580c" : "#dc2626";
    return `<tr>
      <td>${new Date(e.timestamp).toLocaleString("en-PH")}</td>
      <td>${e.air_temperature != null ? Number(e.air_temperature).toFixed(2) : "—"}</td>
      <td>${e.temperature != null ? Number(e.temperature).toFixed(2) : "—"}</td>
      <td>${e.humidity != null ? Number(e.humidity).toFixed(2) : "—"}</td>
      <td>${e.ph != null ? Number(e.ph).toFixed(2) : "—"}</td>
      <td>${e.turbidity != null ? Number(e.turbidity).toFixed(2) : "—"}</td>
      <td style="color:${color};font-weight:bold">${statusMap[s] ?? s}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Bantay Dagat – Historical Trends (${timeLabel})</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    p.meta { font-size: 12px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f0f4f8; padding: 8px 10px; text-align: left; border: 1px solid #cdd5e0; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
    td { padding: 7px 10px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <h1>Bantay Dagat – Historical Water Quality Trends</h1>
  <p class="meta">Period: ${timeLabel} &nbsp;·&nbsp; Exported: ${new Date().toLocaleString("en-PH")} &nbsp;·&nbsp; ${data.length} readings</p>
  <table>
    <thead><tr><th>Timestamp</th><th>Air Temp (°C)</th><th>Water Temp (°C)</th><th>Humidity (%)</th><th>pH</th><th>Turbidity (NTU)</th><th>Release Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

export default function HistoricalTrends() {
  const [allHistory, setAllHistory] = useState([]);
  const [timeRange, setTimeRange] = useState("day");
  const [graphType, setGraphType] = useState("line");
  const [connectionState, setConnectionState] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(true);

  useEffect(() => {
    // Limit to last 500 readings at database level to maintain high UI performance and low bandwidth usage
    const historyQuery = query(ref(db, DB_PATHS.READINGS), limitToLast(500));

    onValue(
      historyQuery,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const entries = Object.values(data)
            .map(mapArduinoReading)
            .filter((e) => e && e.timestamp)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((entry) => ({
              timestamp: entry.timestamp,
              time: new Date(entry.timestamp).toLocaleTimeString("en-PH", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              date: new Date(entry.timestamp).toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
              }),
              air_temperature: entry.air_temperature ?? null,
              temperature: entry.temperature ?? null,
              humidity: entry.humidity ?? null,
              ph: entry.ph ?? null,
              turbidity: entry.turbidity ?? null,
            }));
          setAllHistory(entries);
          setConnectionState("live");
          setErrorMessage(null);
        } else {
          setAllHistory([]);
          setConnectionState("live");
        }
      },
      (error) => {
        setConnectionState("error");
        setErrorMessage(error.message);
      },
    );

    return () => off(historyQuery);
  }, []);

  const now = Date.now();
  const filteredHistory = allHistory.filter(
    (entry) => entry.timestamp >= now - TIME_RANGES[timeRange],
  );

  const chartData = filteredHistory.map((entry) => ({
    ...entry,
    label:
      timeRange === "day" ? entry.time : `${entry.date} ${entry.time}`,
  }));

  const hasData = chartData.length > 0;

  // ── Data Analytics ─────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (filteredHistory.length === 0) return null;

    const sensorStats = SENSOR_META.map(({ key, name, unit }) => {
      const values = filteredHistory
        .map((e) => e[key])
        .filter((v) => v !== null && v !== undefined);

      if (values.length === 0) return { key, name, unit, noData: true };

      const t = THRESHOLDS[key];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const safeCount = values.filter(
        (v) => v >= t.safeMin && v <= t.safeMax,
      ).length;
      const pctSafe = (safeCount / values.length) * 100;

      return { key, name, unit, min, max, avg, pctSafe, count: values.length };
    });

    const goReadyCount = filteredHistory.filter((e) => {
      const s = readingReleaseStatus(e);
      return s === "go" || s === "go_caution";
    }).length;
    const goReadiness = (goReadyCount / filteredHistory.length) * 100;

    const allSafeCount = filteredHistory.filter((e) => {
      const s = readingReleaseStatus(e);
      return s === "go";
    }).length;
    const pctAllSafe = (allSafeCount / filteredHistory.length) * 100;

    return {
      sensorStats,
      goReadiness,
      pctAllSafe,
      totalReadings: filteredHistory.length,
    };
  }, [filteredHistory]);

  // High-contrast editorial tooltip
  const CustomTooltip = ({ active, payload, label, unit }) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      const formattedVal =
        val !== null && val !== undefined
          ? `${(Math.floor(Number(val) * 100) / 100).toFixed(2)} ${unit || ""}`
          : "—";
      return (
        <div className="bg-[#1a1714] text-[#fffaf2] p-2.5 rounded-lg text-xs shadow-xl border border-[#38332e]">
          <p className="font-semibold text-[#a8a29e] mb-1 text-[11px] font-mono">{label}</p>
          <p className="font-bold text-white text-sm font-mono tracking-tight">
            Value: <span className="text-[#f5f0eb]">{formattedVal}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Helper renderer for dynamic graph types
  const renderChartComponent = (sensorKey, color, domain, unit) => {
    const threshold = THRESHOLDS[sensorKey];
    const yDomain = domain || [0, "auto"];
    const strokeColor = "#1e3a8a";

    return (
      <ResponsiveContainer width="100%" height={250}>
        {graphType === "line" && (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ebe4d4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7c7366" }} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: 10, fill: "#7c7366" }} />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {threshold.safeMin !== undefined && (
              <ReferenceLine
                y={threshold.safeMin}
                stroke="#15803d"
                strokeDasharray="5 4"
                label={{ value: "Safe Min", position: "right", fontSize: 10, fill: "#15803d" }}
              />
            )}
            <ReferenceLine
              y={threshold.safeMax}
              stroke="#9a3412"
              strokeDasharray="5 4"
              label={{ value: "Cap Limit", position: "right", fontSize: 10, fill: "#9a3412" }}
            />
            <Line
              type="monotone"
              dataKey={sensorKey}
              stroke={strokeColor}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          </LineChart>
        )}

        {graphType === "area" && (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`metFill-${sensorKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e3a8a" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ebe4d4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7c7366" }} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: 10, fill: "#7c7366" }} />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {threshold.safeMin !== undefined && (
              <ReferenceLine
                y={threshold.safeMin}
                stroke="#15803d"
                strokeDasharray="5 4"
                label={{ value: "Safe Min", position: "right", fontSize: 10, fill: "#15803d" }}
              />
            )}
            <ReferenceLine
              y={threshold.safeMax}
              stroke="#9a3412"
              strokeDasharray="5 4"
              label={{ value: "Cap Limit", position: "right", fontSize: 10, fill: "#9a3412" }}
            />
            <Area
              type="monotone"
              dataKey={sensorKey}
              stroke={strokeColor}
              fill={`url(#metFill-${sensorKey})`}
              fillOpacity={1}
              connectNulls
              strokeWidth={2}
            />
          </AreaChart>
        )}

        {graphType === "bar" && (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ebe4d4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7c7366" }} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: 10, fill: "#7c7366" }} />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {threshold.safeMin !== undefined && (
              <ReferenceLine
                y={threshold.safeMin}
                stroke="#15803d"
                strokeDasharray="5 4"
                label={{ value: "Safe Min", position: "right", fontSize: 10, fill: "#15803d" }}
              />
            )}
            <ReferenceLine
              y={threshold.safeMax}
              stroke="#9a3412"
              strokeDasharray="5 4"
              label={{ value: "Cap Limit", position: "right", fontSize: 10, fill: "#9a3412" }}
            />
            <Bar dataKey={sensorKey} fill="#1e3a8a" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* ── Header & Filters ─────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-header font-bold text-foreground">
              Historical Water Quality Trends
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visualize sensor patterns and long-term release parameters
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Export Buttons */}
            {hasData && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportTrendsCSV(filteredHistory, TIME_LABELS[timeRange])}
                  title="Export data as CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-safe/10 text-safe border border-safe/30 hover:bg-safe/20 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  onClick={() => exportTrendsPDF(filteredHistory, TIME_LABELS[timeRange])}
                  title="Export data as PDF"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </button>
              </div>
            )}

            {/* Graph Type Selector */}
            <div className="flex items-center bg-secondary/30 p-1 rounded-xl border border-secondary">
              {GRAPH_TYPES.map((gt) => {
                const Icon = gt.icon;
                const active = graphType === gt.id;
                return (
                  <button
                    key={gt.id}
                    onClick={() => setGraphType(gt.id)}
                    title={gt.desc}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
                      active
                        ? "bg-white text-primary shadow-sm border border-secondary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{gt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Time Range Selector */}
            <div className="flex gap-1.5">
              {Object.keys(TIME_RANGES).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${
                    timeRange === range
                      ? "bg-primary text-white"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  {TIME_LABELS[range]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Firebase Connection Banner ─────────────────────────────────────── */}
        {connectionState === "connecting" && (
          <div className="mb-6 flex items-center gap-3 bg-secondary/40 border border-secondary rounded-xl px-5 py-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Connecting to Firebase...
          </div>
        )}

        {connectionState === "error" && (
          <div className="mb-6 flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {errorMessage || "Unable to load historical data from Firebase."}
          </div>
        )}

        {/* ── No Data State ──────────────────────────────────────────────────── */}
        {connectionState === "live" && !hasData && (
          <div className="mb-6 bg-secondary/30 border border-secondary rounded-xl px-5 py-8 text-center text-muted-foreground text-sm">
            No sensor history found for the selected time range. Data will
            appear here once the Arduino begins transmitting.
          </div>
        )}

        {/* ── Data Analytics Section ─────────────────────────────────────────── */}
        {hasData && analytics && (
          <div className="mb-6 bg-white rounded-xl border border-secondary shadow-sm overflow-hidden">
            {/* Analytics header / toggle */}
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="w-full flex items-center justify-between gap-2 p-5 hover:bg-secondary/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <BarChart2 className="w-4 h-4" />
                </span>
                <div className="text-left">
                  <p className="text-sm font-header font-bold text-foreground">
                    Data Analytics
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analytics.totalReadings} readings ·{" "}
                    {TIME_LABELS[timeRange]}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                {showAnalytics ? "▲ Collapse" : "▼ Expand"}
              </span>
            </button>

            {showAnalytics && (
              <div className="border-t border-secondary px-5 pb-5 pt-4">
                {/* GO-Readiness Score */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  <div className="p-4 rounded-xl bg-secondary/20 border border-secondary/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      GO-Readiness Score
                    </p>
                    <p
                      className={`text-3xl font-header font-bold leading-none ${
                        analytics.goReadiness >= 80
                          ? "text-safe"
                          : analytics.goReadiness >= 50
                            ? "text-caution"
                            : "text-danger"
                      }`}
                    >
                      {analytics.goReadiness.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      % of readings fit for release (GO or GO with Caution)
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          analytics.goReadiness >= 80
                            ? "bg-safe"
                            : analytics.goReadiness >= 50
                              ? "bg-caution"
                              : "bg-danger"
                        }`}
                        style={{ width: `${analytics.goReadiness}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-secondary/20 border border-secondary/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      Fully Safe Readings
                    </p>
                    <p
                      className={`text-3xl font-header font-bold leading-none ${
                        analytics.pctAllSafe >= 80
                          ? "text-safe"
                          : analytics.pctAllSafe >= 50
                            ? "text-caution"
                            : "text-danger"
                      }`}
                    >
                      {analytics.pctAllSafe.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      % of readings where ALL 5 parameters were in safe range
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          analytics.pctAllSafe >= 80
                            ? "bg-safe"
                            : analytics.pctAllSafe >= 50
                              ? "bg-caution"
                              : "bg-danger"
                        }`}
                        style={{ width: `${analytics.pctAllSafe}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-secondary/20 border border-secondary/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      Total Readings
                    </p>
                    <p className="text-3xl font-header font-bold text-primary leading-none">
                      {analytics.totalReadings}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Sensor readings captured during {TIME_LABELS[timeRange].toLowerCase()}
                    </p>
                  </div>
                </div>

                {/* Per-Sensor Stats Table */}
                <div className="overflow-x-auto rounded-xl border border-secondary">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-secondary/30 border-b border-secondary">
                        <th className="py-2.5 px-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Parameter
                        </th>
                        <th className="py-2.5 px-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Min
                        </th>
                        <th className="py-2.5 px-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Average
                        </th>
                        <th className="py-2.5 px-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Max
                        </th>
                        <th className="py-2.5 px-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider min-w-[160px]">
                          % in Safe Range
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.sensorStats.map((s) => {
                        if (s.noData)
                          return (
                            <tr key={s.key} className="border-b border-secondary/40">
                              <td className="py-3 px-4 font-medium text-foreground">
                                {s.name}
                              </td>
                              <td colSpan={4} className="py-3 px-4 text-center text-xs text-muted-foreground italic">
                                No data available
                              </td>
                            </tr>
                          );

                        const t = THRESHOLDS[s.key];
                        const minStatus = s.min < t.safeMin || s.min > t.safeMax ? "text-caution" : "text-safe";
                        const maxStatus = s.max < t.safeMin || s.max > t.safeMax ? "text-caution" : "text-safe";
                        const avgStatus = s.avg < t.safeMin || s.avg > t.safeMax ? "text-caution font-bold" : "text-safe font-bold";

                        return (
                          <tr key={s.key} className="border-b border-secondary/40 hover:bg-secondary/10 transition-colors">
                            <td className="py-3 px-4 font-medium text-foreground">{s.name}</td>
                            <td className={`py-3 px-4 text-center font-mono text-xs ${minStatus}`}>{truncTo2(s.min)} {s.unit}</td>
                            <td className={`py-3 px-4 text-center font-mono text-xs ${avgStatus}`}>{truncTo2(s.avg)} {s.unit}</td>
                            <td className={`py-3 px-4 text-center font-mono text-xs ${maxStatus}`}>{truncTo2(s.max)} {s.unit}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      s.pctSafe >= 80 ? "bg-safe" : s.pctSafe >= 50 ? "bg-caution" : "bg-danger"
                                    }`}
                                    style={{ width: `${s.pctSafe}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold w-10 text-right shrink-0 ${
                                  s.pctSafe >= 80 ? "text-safe" : s.pctSafe >= 50 ? "text-caution" : "text-danger"
                                }`}>
                                  {s.pctSafe.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Dynamic Charts Grid ─────────────────────────────────────────────── */}
        {hasData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Air Temperature */}
            <div className="bg-[#fffaf2] rounded-xl p-6 border border-[#ddd4c4] shadow-sm">
              <h3 className="text-base font-header font-bold text-[#1a1714] mb-4">
                Air Temperature (°C)
              </h3>
              {renderChartComponent("air_temperature", "hsl(var(--caution))", [0, 50], "°C")}
            </div>

            {/* Water Temperature */}
            <div className="bg-[#fffaf2] rounded-xl p-6 border border-[#ddd4c4] shadow-sm">
              <h3 className="text-base font-header font-bold text-[#1a1714] mb-4">
                Water Temperature (°C)
              </h3>
              {renderChartComponent("temperature", "hsl(var(--primary))", [0, 40], "°C")}
            </div>

            {/* Humidity */}
            <div className="bg-[#fffaf2] rounded-xl p-6 border border-[#ddd4c4] shadow-sm">
              <h3 className="text-base font-header font-bold text-[#1a1714] mb-4">
                Humidity (%)
              </h3>
              {renderChartComponent("humidity", "hsl(var(--accent))", [0, 100], "%")}
            </div>

            {/* pH */}
            <div className="bg-[#fffaf2] rounded-xl p-6 border border-[#ddd4c4] shadow-sm">
              <h3 className="text-base font-header font-bold text-[#1a1714] mb-4">
                pH Level
              </h3>
              {renderChartComponent("ph", "hsl(var(--caution))", [6, 9], "pH")}
            </div>

            {/* Turbidity */}
            <div className="bg-[#fffaf2] rounded-xl p-6 border border-[#ddd4c4] shadow-sm lg:col-span-2">
              <h3 className="text-base font-header font-bold text-[#1a1714] mb-4">
                Turbidity (NTU)
              </h3>
              {renderChartComponent("turbidity", "hsl(var(--danger))", [0, 60], "NTU")}
            </div>
          </div>
        )}

        {/* ── Legend ──────────────────────────────────────────────────────────── */}
        <div className="mt-6 bg-secondary/30 rounded-xl p-4 border border-secondary">
          <p className="text-sm font-medium text-foreground mb-3">
            Threshold Legend
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-safe" />
              <span className="text-sm text-muted-foreground">Safe Range</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-caution" />
              <span className="text-sm text-muted-foreground">
                Caution Range
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-danger" />
              <span className="text-sm text-muted-foreground">
                Danger Range
              </span>
            </div>
          </div>
          {connectionState === "live" && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing {chartData.length} readings from Firebase ·{" "}
              {TIME_LABELS[timeRange]} · Mode: {GRAPH_TYPES.find((g) => g.id === graphType)?.label}.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
