import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import {
  ChevronUp,
  ChevronDown,
  WifiOff,
  RefreshCw,
  Database,
  AlertTriangle,
  Download,
  FileText,
} from "lucide-react";
import {
  db,
  ref,
  onValue,
  off,
  mapArduinoReading,
  DB_PATHS,
} from "@/lib/firebase";

const THRESHOLDS = {
  air_temperature: { safe: [25, 32], caution: [22, 35] },
  temperature: { safe: [26, 31], caution: [24, 33] },
  humidity: { safe: [65, 85], caution: [55, 90] },
  ph: { safe: [7.8, 8.3], caution: [7.5, 8.5] },
  turbidity: { safe: [0, 25], caution: [0, 50] },
};

const SENSOR_META = {
  air_temperature: { label: "Air Temp", unit: "°C" },
  temperature: { label: "Water Temp", unit: "°C" },
  humidity: { label: "Humidity", unit: "%" },
  ph: { label: "pH Level", unit: "pH" },
  turbidity: { label: "Turbidity", unit: "NTU" },
};

function deriveStatus(key, value) {
  if (value === null || value === undefined) return "unknown";
  const t = THRESHOLDS[key];
  if (!t) return "unknown";
  if (value < t.caution[0] || value > t.caution[1]) return "danger";
  if (value < t.safe[0] || value > t.safe[1]) return "caution";
  return "safe";
}

function overallStatus(reading) {
  const keys = Object.keys(SENSOR_META);
  const statuses = keys.map((k) => deriveStatus(k, reading[k]));
  const dangerCount = statuses.filter((s) => s === "danger").length;
  const cautionCount = statuses.filter((s) => s === "caution").length;
  const unknownCount = statuses.filter((s) => s === "unknown").length;

  if (dangerCount >= 1) return "danger";
  if (cautionCount >= 2) return "nogo_caution";
  if (cautionCount === 1) return "go_caution";
  if (unknownCount === keys.length) return "unknown";
  return "safe";
}

const statusBadge = (s) =>
  ({
    safe: "bg-safe/20 text-safe",
    go_caution: "bg-caution/20 text-caution",
    nogo_caution: "bg-orange-500/20 text-orange-600",
    danger: "bg-danger/20 text-danger",
  })[s] ?? "bg-secondary text-muted-foreground";

const statusLabel = (s) =>
  ({
    safe: "GO",
    go_caution: "GO (CAUTION)",
    nogo_caution: "NO-GO (CAUTION)",
    danger: "NO-GO (DANGER)",
  })[s] ?? String(s).toUpperCase();

const cellColor = (s) =>
  ({
    safe: "text-safe",
    caution: "text-caution font-semibold",
    danger: "text-danger font-bold",
  })[s] ?? "text-muted-foreground";

// Truncates to exactly 2 decimal places WITHOUT rounding
const fmt = (v, unit) =>
  v !== null && v !== undefined ? `${(Math.floor(Number(v) * 100) / 100).toFixed(2)} ${unit}` : "\u2014";

const fmtTs = (ts) =>
  ts
    ? new Date(ts).toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "\u2014";

// ── Export helpers ────────────────────────────────────────────────────────
function exportLogsCSV(data) {
  const sensorHeaders = Object.entries(SENSOR_META).map(([, m]) => `${m.label} (${m.unit})`);
  const headers = ["Timestamp", "Overall Status", ...sensorHeaders];
  const rows = data.map((r) => [
    fmtTs(r.timestamp),
    statusLabel(overallStatus(r)),
    ...Object.entries(SENSOR_META).map(([k, m]) =>
      r[k] != null ? (Math.floor(Number(r[k]) * 100) / 100).toFixed(2) : ""
    ),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bantay-dagat-alert-logs-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportLogsPDF(data) {
  const sensorMeta = Object.entries(SENSOR_META);
  const statusColors = { safe: "#16a34a", go_caution: "#d97706", nogo_caution: "#ea580c", danger: "#dc2626" };
  const sensorRows = sensorMeta.map(([, m]) => `<th>${m.label}<br/><span style="font-weight:normal;font-size:10px">(${m.unit})</span></th>`).join("");

  const bodyRows = data.map((row) => {
    const overall = overallStatus(row);
    const color = statusColors[overall] ?? "#666";
    const cells = sensorMeta.map(([k, m]) => {
      const s = deriveStatus(k, row[k]);
      const cellCol = s === "danger" ? "#dc2626" : s === "caution" ? "#d97706" : "#16a34a";
      const val = row[k] != null ? (Math.floor(Number(row[k]) * 100) / 100).toFixed(2) : "\u2014";
      return `<td style="color:${cellCol}">${val}</td>`;
    }).join("");
    return `<tr>
      <td style="font-size:11px;white-space:nowrap">${fmtTs(row.timestamp)}</td>
      <td style="color:${color};font-weight:bold;white-space:nowrap">${statusLabel(overall)}</td>
      ${cells}
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Bantay Dagat – Alert Logs</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    p.meta { font-size: 12px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f0f4f8; padding: 8px 10px; text-align: left; border: 1px solid #cdd5e0; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
    td { padding: 6px 10px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <h1>Bantay Dagat – Alert Logs</h1>
  <p class="meta">Exported: ${new Date().toLocaleString("en-PH")} &nbsp;·&nbsp; ${data.length} readings shown</p>
  <table>
    <thead><tr><th>Timestamp</th><th>Overall Status</th>${sensorRows}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

export default function AlertLogs() {
  const [readings, setReadings] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const histRef = ref(db, DB_PATHS.READINGS);

    onValue(
      histRef,
      (snap) => {
        const data = snap.val();
        if (data) {
          const parsed = Object.entries(data).map(([key, raw]) => ({
            id: key,
            ...mapArduinoReading(raw),
          }));
          setReadings(parsed);
          setConnectionState("live");
          setErrorMessage(null);
        } else {
          setReadings([]);
          setConnectionState("live");
        }
      },
      (err) => {
        setConnectionState("error");
        setErrorMessage(err.message);
      },
    );

    return () => {
      off(histRef);
    };
  }, []);

  const dataset = readings;

  const sorted = useMemo(() => {
    let list = [...dataset];

    if (filterStatus !== "all") {
      list = list.filter((r) => overallStatus(r) === filterStatus);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => {
        const tsStr = r.timestamp ? fmtTs(r.timestamp).toLowerCase() : "";
        const statusStr = (r.status || overallStatus(r)).toLowerCase();
        const valStr = Object.keys(SENSOR_META)
          .map((k) => String(r[k] ?? ""))
          .join(" ");
        return tsStr.includes(q) || statusStr.includes(q) || valStr.includes(q);
      });
    }

    return list.sort((a, b) => {
      const av = a.timestamp ?? 0;
      const bv = b.timestamp ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [dataset, filterStatus, sortDir, searchQuery]);

  const sensorKeys = Object.entries(SENSOR_META);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h2 className="text-2xl font-header font-bold text-foreground">
            Alert Logs
          </h2>
          <div className="flex items-center gap-3">
            {sorted.length > 0 && (
              <>
                <button
                  onClick={() => exportLogsCSV(sorted)}
                  title="Export visible data as CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-safe/10 text-safe border border-safe/30 hover:bg-safe/20 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  onClick={() => exportLogsPDF(sorted)}
                  title="Export visible data as PDF"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </button>
              </>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/40 px-3 py-1.5 rounded-full">
              <Database className="w-3 h-3" />
              {readings.length} readings
            </div>
          </div>
        </div>

        {connectionState === "connecting" && (
          <div className="mb-6 flex items-center gap-3 bg-secondary/40 border border-secondary rounded-xl px-5 py-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Connecting to Firebase…
          </div>
        )}
        {connectionState === "error" && (
          <div className="mb-6 flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {errorMessage || "Unable to load from Firebase."}
          </div>
        )}

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">
              Status:
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-secondary bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="safe">GO (All Safe)</option>
              <option value="go_caution">GO (With Caution)</option>
              <option value="nogo_caution">NO-GO (Caution)</option>
              <option value="danger">NO-GO (Danger)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">Sort:</label>
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-secondary bg-background text-sm hover:bg-secondary/40 transition-colors"
            >
              Timestamp
              {sortDir === "desc" ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <label className="text-sm font-medium text-foreground shrink-0">
              Search:
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs…"
              className="flex-1 px-3 py-1.5 rounded-lg border border-secondary bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* ── Mobile Cards (shown < md) ── */}
        <div className="md:hidden space-y-3">
          {connectionState === "connecting" ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : sorted.length > 0 ? (
            sorted.map((row) => {
              const overall = overallStatus(row);
              return (
                <div
                  key={row.id}
                  className="bg-white rounded-xl border border-secondary shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground font-mono">
                      {fmtTs(row.timestamp)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge(overall)}`}
                    >
                      {statusLabel(overall)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {sensorKeys.map(([k, m]) => {
                      const s = deriveStatus(k, row[k]);
                      return (
                        <div
                          key={k}
                          className="flex items-center justify-between"
                        >
                          <span className="text-xs text-muted-foreground">
                            {m.label}
                          </span>
                          <span
                            className={`text-sm font-medium ${cellColor(s)}`}
                          >
                            {fmt(row[k], m.unit)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {dataset.length === 0
                ? activeTab === "alerts"
                  ? "No NO-GO alerts found in the database."
                  : "No sensor readings found in the database."
                : "No readings match the selected filter."}
            </div>
          )}
        </div>

        {/* ── Desktop Table (shown >= md) ── */}
        <div className="hidden md:block bg-white rounded-xl border border-secondary shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-secondary bg-secondary/30">
                  <th className="px-5 py-3 text-left font-header font-bold text-foreground whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="px-5 py-3 text-left font-header font-bold text-foreground whitespace-nowrap">
                    Overall
                  </th>
                  {sensorKeys.map(([k, m]) => (
                    <th
                      key={k}
                      className="px-5 py-3 text-left font-header font-bold text-foreground whitespace-nowrap"
                    >
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {connectionState === "connecting" ? (
                  <tr>
                    <td
                      colSpan={2 + sensorKeys.length}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                      </div>
                    </td>
                  </tr>
                ) : sorted.length > 0 ? (
                  sorted.map((row) => {
                    const overall = overallStatus(row);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-secondary hover:bg-secondary/20 transition-colors"
                      >
                        <td className="px-5 py-3 text-foreground whitespace-nowrap font-mono text-xs">
                          {fmtTs(row.timestamp)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge(overall)}`}
                          >
                            {statusLabel(overall)}
                          </span>
                        </td>
                        {sensorKeys.map(([k, m]) => {
                          const s = deriveStatus(k, row[k]);
                          return (
                            <td
                              key={k}
                              className={`px-5 py-3 whitespace-nowrap ${cellColor(s)}`}
                            >
                              {fmt(row[k], m.unit)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={2 + sensorKeys.length}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      {dataset.length === 0
                        ? "No sensor readings found in the database."
                        : "No readings match the selected filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 bg-secondary/30 rounded-xl p-4 border border-secondary">
          <p className="text-sm text-muted-foreground">
            {connectionState === "live"
              ? `Showing ${sorted.length} of ${dataset.length} readings — live from ${DB_PATHS.READINGS}`
              : connectionState === "connecting"
                ? "Loading from Firebase Realtime Database…"
                : "Firebase connection unavailable."}
          </p>
        </div>
      </div>
    </Layout>
  );
}
