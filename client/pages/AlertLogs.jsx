import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import {
  ChevronUp,
  ChevronDown,
  WifiOff,
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Search,
  ArrowUpDown,
  FilterX,
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
      <div className="space-y-5">
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

        {/* Filters & Quick 1-Click Chips */}
        <div className="mb-5 space-y-3">
          {/* Quick Preset Filter Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[#7c7366] uppercase tracking-wider mr-1">
              Quick Filter:
            </span>
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-2xs ${
                filterStatus === "all"
                  ? "bg-[#1e3a8a] text-white"
                  : "bg-[#fffaf2] border border-[#ddd4c4] text-[#1a1714] hover:bg-[#f5f0eb]"
              }`}
            >
              All Logs ({readings.length})
            </button>
            <button
              onClick={() => setFilterStatus("danger")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-2xs ${
                filterStatus === "danger"
                  ? "bg-[#9a3412] text-white"
                  : "bg-[#9a3412]/10 border border-[#9a3412]/30 text-[#9a3412] hover:bg-[#9a3412]/20"
              }`}
            >
              Danger (NO-GO) Only
            </button>
            <button
              onClick={() => setFilterStatus("nogo_caution")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-2xs ${
                filterStatus === "nogo_caution"
                  ? "bg-[#b45309] text-white"
                  : "bg-[#b45309]/10 border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/20"
              }`}
            >
              Caution Only
            </button>
            <button
              onClick={() => setFilterStatus("safe")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-2xs ${
                filterStatus === "safe"
                  ? "bg-[#15803d] text-white"
                  : "bg-[#15803d]/10 border border-[#15803d]/30 text-[#15803d] hover:bg-[#15803d]/20"
              }`}
            >
              Safe (GO) Only
            </button>
          </div>

          <div className="flex flex-wrap gap-4 items-center pt-1">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#1a1714]">
                Status Dropdown:
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-[#1a1714] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
              >
                <option value="all">All Statuses</option>
                <option value="safe">GO (All Safe)</option>
                <option value="go_caution">GO (With Caution)</option>
                <option value="nogo_caution">NO-GO (Caution)</option>
                <option value="danger">NO-GO (Danger)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#1a1714]">Sort:</label>
              <button
                onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-xs font-medium text-[#1a1714] hover:bg-[#f5f0eb] transition-colors"
              >
                Timestamp
                {sortDir === "desc" ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#7c7366]" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 text-[#7c7366]" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-xs font-semibold text-[#1a1714] shrink-0">
                Search:
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search timestamps or values…"
                className="flex-1 px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-[#1a1714] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
              />
            </div>
          </div>
        </div>

        {/* ── Mobile Cards (shown < md) ── */}
        <div className="md:hidden space-y-3">
          {connectionState === "connecting" ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading telemetry logs…
            </div>
          ) : sorted.length > 0 ? (
            sorted.map((row) => {
              const overall = overallStatus(row);
              return (
                <div
                  key={row.id}
                  className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#7c7366] font-mono">
                      {fmtTs(row.timestamp)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${statusBadge(overall)}`}
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
                          <span className="text-xs text-[#7c7366]">
                            {m.label}
                          </span>
                          <span
                            className={`text-xs font-semibold ${cellColor(s)}`}
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
            <div className="py-8 text-center text-[#7c7366] text-xs">
              {dataset.length === 0
                ? "No sensor readings found in the database."
                : "No readings match the selected filter."}
            </div>
          )}
        </div>

        {/* ── Desktop Table (shown >= md) ── */}
        <div className="hidden md:block bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#ddd4c4] bg-[#f5f0eb]">
                  <th className="px-4 py-3 text-left font-header font-bold uppercase tracking-[1px] text-[#7c7366] text-[10px] whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left font-header font-bold uppercase tracking-[1px] text-[#7c7366] text-[10px] whitespace-nowrap">
                    Overall Status
                  </th>
                  {sensorKeys.map(([k, m]) => (
                    <th
                      key={k}
                      className="px-4 py-3 text-left font-header font-bold uppercase tracking-[1px] text-[#7c7366] text-[10px] whitespace-nowrap"
                    >
                      {m.label} ({m.unit})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ddd4c4]">
                {connectionState === "connecting" ? (
                  <tr>
                    <td
                      colSpan={2 + sensorKeys.length}
                      className="px-6 py-8 text-center text-[#7c7366]"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#1e3a8a]" /> Loading telemetry dataset…
                      </div>
                    </td>
                  </tr>
                ) : sorted.length > 0 ? (
                  sorted.map((row) => {
                    const overall = overallStatus(row);
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-[#ebe4d4]/40 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-[#1a1714] whitespace-nowrap font-mono text-xs">
                          {fmtTs(row.timestamp)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${statusBadge(overall)}`}
                          >
                            {statusLabel(overall)}
                          </span>
                        </td>
                        {sensorKeys.map(([k, m]) => {
                          const s = deriveStatus(k, row[k]);
                          return (
                            <td
                              key={k}
                              className={`px-4 py-2.5 whitespace-nowrap font-medium ${cellColor(s)}`}
                            >
                              {fmt(row[k], "")}
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
                      className="px-6 py-10 text-center text-[#7c7366]"
                    >
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FilterX className="w-8 h-8 text-[#a8a29e] mb-1" />
                        <p className="text-sm font-bold text-[#1a1714]">
                          No telemetry records match your current filter
                        </p>
                        <p className="text-xs text-[#7c7366] max-w-sm">
                          Try adjusting your status filter chip or clearing your search query.
                        </p>
                        <button
                          onClick={() => {
                            setFilterStatus("all");
                            setSearchQuery("");
                          }}
                          className="mt-2 px-3.5 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#f5f0eb] text-xs font-bold text-[#1e3a8a] hover:bg-[#e8e0ce] transition-colors"
                        >
                          Reset Filters & Search
                        </button>
                      </div>
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
