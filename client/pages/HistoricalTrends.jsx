import { printDocument, escapeHtml } from "@/lib/printExport";
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
  orderByChild,
  startAt,
  onValue,
  mapArduinoReading,
  DB_PATHS,
} from "@/lib/firebase";
import { SENSORS, RELEASE_META, releaseStatus, evaluateReading, truncTo2 } from "@/lib/sensors";

// Thresholds come from the shared config; keep the {safeMin,…} shape used below
const THRESHOLDS = Object.fromEntries(
  SENSORS.map((s) => [
    s.key,
    {
      safeMin: s.threshold.safe[0],
      safeMax: s.threshold.safe[1],
      cautionMin: s.threshold.caution[0],
      cautionMax: s.threshold.caution[1],
    },
  ]),
);

const pickSensors = (r) => Object.fromEntries(SENSORS.map((s) => [s.key, r?.[s.key] ?? null]));

const SENSOR_META = SENSORS.map(({ key, name, unit, type }) => ({ key, name, unit, type }));

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

// ── Export helpers ──────────────────────────────────────────────────────────
// Exports use the RAW monitoring station values (audit trail); faulty probes are marked.
const rawCell = (e, key) => {
  const v = e.raw?.[key];
  if (v === null || v === undefined) return "";
  return e[key] === null ? `${v} (fault)` : v;
};

const STATUS_COLOR = {
  go: "#16a34a",
  go_caution: "#d97706",
  nogo_caution: "#ea580c",
  danger: "#dc2626",
  fault: "#57534e",
  unknown: "#57534e",
};

function exportTrendsCSV(data, timeLabel) {
  const headers = ["Timestamp", "Air Temp (°C)", "Water Temp (°C)", "Humidity (%)", "pH", "Turbidity (NTU)", "Release Status"];
  const rows = data.map((e) => [
    new Date(e.timestamp).toLocaleString("en-PH"),
    rawCell(e, "air_temperature"),
    rawCell(e, "temperature"),
    rawCell(e, "humidity"),
    rawCell(e, "ph"),
    rawCell(e, "turbidity"),
    RELEASE_META[e.release].label,
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
  const cell = (e, key) => {
    const v = e.raw?.[key];
    if (v === null || v === undefined) return "—";
    const n = escapeHtml(typeof v === "number" ? truncTo2(v) : String(v));
    return e[key] === null ? `<span style="color:#57534e;text-decoration:line-through">${n}</span>` : n;
  };
  const rows = data.map((e) => {
    const s = e.release;
    return `<tr>
      <td>${new Date(e.timestamp).toLocaleString("en-PH")}</td>
      <td>${cell(e, "air_temperature")}</td>
      <td>${cell(e, "temperature")}</td>
      <td>${cell(e, "humidity")}</td>
      <td>${cell(e, "ph")}</td>
      <td>${cell(e, "turbidity")}</td>
      <td style="color:${STATUS_COLOR[s]};font-weight:bold">${RELEASE_META[s].label}</td>
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
  <p class="meta" style="margin-top:12px">Struck-through values are physically impossible probe readings (sensor fault) and are excluded from the release decision.</p>
  </body></html>`;

  printDocument(html);
}

export default function HistoricalTrends() {
  const [allHistory, setAllHistory] = useState([]);
  const [timeRange, setTimeRange] = useState("day");
  const [graphType, setGraphType] = useState("line");
  const [connectionState, setConnectionState] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(true);

  useEffect(() => {
    // Fetch the selectable month, rather than only ~42 hours of 5-minute samples.
    const historyQuery = query(ref(db, DB_PATHS.READINGS), orderByChild("timestamp"), startAt(Date.now() - TIME_RANGES.month));

    const unsubscribe = onValue(
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
              // Faulty probe values (e.g. -127 °C, pH 23) become null so they
              // never distort charts or statistics; raw values kept for export.
              ...pickSensors(evaluateReading(entry).clean),
              raw: pickSensors(entry),
              release: releaseStatus(entry),
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

    return unsubscribe;
  }, []);

  const now = Date.now();
  const filteredHistory = allHistory.filter(
    (entry) => entry.timestamp >= now - TIME_RANGES[timeRange] && entry.timestamp <= now,
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

    const sensorStats = SENSOR_META.map(({ key, name, unit, type }) => {
      const values = filteredHistory
        .map((e) => e[key])
        .filter((v) => v !== null && v !== undefined);

      if (values.length === 0) return { key, name, unit, type, noData: true };

      const t = THRESHOLDS[key];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const safeCount = values.filter(
        (v) => v >= t.safeMin && v <= t.safeMax,
      ).length;
      const pctSafe = (safeCount / values.length) * 100;

      return { key, name, unit, type, min, max, avg, pctSafe, count: values.length };
    });

    // Readings with a faulty water probe can't be judged — report them separately
    const faultCount = filteredHistory.filter((e) => e.release === "fault" || e.release === "unknown").length;
    const judged = filteredHistory.length - faultCount || 1;
    const goReadyCount = filteredHistory.filter((e) => RELEASE_META[e.release].allowed).length;
    const goReadiness = (goReadyCount / judged) * 100;
    const allSafeCount = filteredHistory.filter((e) => e.release === "go").length;
    const pctAllSafe = (allSafeCount / judged) * 100;

    return {
      sensorStats,
      goReadiness,
      pctAllSafe,
      faultCount,
      totalReadings: filteredHistory.length,
    };
  }, [filteredHistory]);

  const valueTone = (key, v) => {
    const t = THRESHOLDS[key];
    if (v < t.cautionMin || v > t.cautionMax) return "text-danger";
    if (v < t.safeMin || v > t.safeMax) return "text-caution";
    return "text-safe";
  };
  const pctTone = (p, kind) =>
    p >= 80 ? `${kind}-safe` : p >= 50 ? `${kind}-caution` : `${kind}-danger`;

  const renderStatsTable = (title, statsArray) => (
    <div className="mt-5">
      <h3 className="text-xs font-bold text-[#1a1714] uppercase tracking-wider mb-2">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-secondary">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-secondary/30 border-b border-secondary">
              <th className="py-2.5 px-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Parameter</th>
              <th className="py-2.5 px-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">Min</th>
              <th className="py-2.5 px-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">Average</th>
              <th className="py-2.5 px-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">Max</th>
              <th className="py-2.5 px-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider min-w-[160px]">% in Safe Range</th>
            </tr>
          </thead>
          <tbody>
            {statsArray.map((s) =>
              s.noData ? (
                <tr key={s.key} className="border-b border-secondary/40 last:border-0">
                  <td className="py-3 px-4 font-medium text-foreground">{s.name}</td>
                  <td colSpan={4} className="py-3 px-4 text-center text-xs text-muted-foreground italic">
                    No valid data in this range
                  </td>
                </tr>
              ) : (
                <tr key={s.key} className="border-b border-secondary/40 last:border-0 hover:bg-secondary/10 transition-colors">
                  <td className="py-3 px-4 font-medium text-foreground">
                    {s.name}
                    <span className="block text-[10px] text-muted-foreground font-normal">{s.count} valid readings</span>
                  </td>
                  <td className={`py-3 px-4 text-center font-mono text-xs ${valueTone(s.key, s.min)}`}>{truncTo2(s.min)} {s.unit}</td>
                  <td className={`py-3 px-4 text-center font-mono text-xs font-bold ${valueTone(s.key, s.avg)}`}>{truncTo2(s.avg)} {s.unit}</td>
                  <td className={`py-3 px-4 text-center font-mono text-xs ${valueTone(s.key, s.max)}`}>{truncTo2(s.max)} {s.unit}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pctTone(s.pctSafe, "bg")}`} style={{ width: `${s.pctSafe}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-10 text-right shrink-0 ${pctTone(s.pctSafe, "text")}`}>{s.pctSafe.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

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
              label={{ value: "Safe Max", position: "right", fontSize: 10, fill: "#9a3412" }}
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
              label={{ value: "Safe Max", position: "right", fontSize: 10, fill: "#9a3412" }}
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
              label={{ value: "Safe Max", position: "right", fontSize: 10, fill: "#9a3412" }}
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
                      % of valid readings fit for release (GO or GO with Caution)
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
                      % of valid readings where all 3 water parameters were safe
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
                      Captured during {TIME_LABELS[timeRange].toLowerCase()}
                      {analytics.faultCount > 0 && (
                        <>
                          {" · "}
                          <span className="font-bold text-[#57534e]">
                            {analytics.faultCount} with a water-sensor fault
                          </span>{" "}
                          (excluded from the % scores)
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Per-Sensor Stats — water (decision) vs environment (context) */}
                {renderStatsTable(
                  "Water Quality — decides GO / NO-GO",
                  analytics.sensorStats.filter((s) => s.type === "water"),
                )}
                {renderStatsTable(
                  "Environmental Context — not used for the decision",
                  analytics.sensorStats.filter((s) => s.type === "environment"),
                )}
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
