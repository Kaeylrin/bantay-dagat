import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { ChevronUp, ChevronDown, WifiOff, RefreshCw } from "lucide-react";
import { db, ref, onValue, off } from "@/lib/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase path: /alert_logs
//
// Expected structure of each alert document pushed by the Arduino:
// {
//   timestamp:   1713800000000,   (Unix ms — Date.now() from Arduino/Firebase)
//   parameter:   "temperature",   (string key matching sensor name)
//   value:       34.2,            (numeric reading that triggered the alert)
//   unit:        "°C",
//   status:      "danger",        ("danger" or "caution")
//   description: "Exceeded safe upper threshold"
// }
//
// The Arduino (or a Firebase Cloud Function) pushes a new child to
// /alert_logs whenever a reading crosses a threshold.
// ─────────────────────────────────────────────────────────────────────────────

export default function AlertLogs() {
  const [alerts,          setAlerts]          = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [errorMessage,    setErrorMessage]    = useState(null);
  const [sortBy,          setSortBy]          = useState("timestamp");
  const [sortDirection,   setSortDirection]   = useState("desc");
  const [filterParameter, setFilterParameter] = useState("all");
  const [filterStatus,    setFilterStatus]    = useState("all");

  useEffect(() => {
    // Listen to /alert_logs in Firebase.
    // onValue fires with the full snapshot whenever any child changes.
    // This means the table updates in real time as new alerts arrive.
    const alertsRef = ref(db, "alert_logs");

    onValue(
      alertsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Firebase push() stores children with auto-generated string keys.
          // We extract the key as the alert's id, then normalise each entry.
          const parsed = Object.entries(data).map(([key, entry]) => ({
            id:          key,
            timestamp:   entry.timestamp   ?? null,
            parameter:   entry.parameter   ?? "Unknown",
            value:       entry.value       ?? null,
            unit:        entry.unit        ?? "",
            status:      entry.status      ?? "caution",
            description: entry.description ?? "Threshold exceeded",
          }));
          setAlerts(parsed);
          setConnectionState("live");
          setErrorMessage(null);
        } else {
          // Path exists but no alerts have been logged yet
          setAlerts([]);
          setConnectionState("live");
        }
      },
      (error) => {
        setConnectionState("error");
        setErrorMessage(error.message);
      }
    );

    return () => off(alertsRef);
  }, []);

  // ── Unique parameter list for filter dropdown ────────────────────────────
  const parameters = useMemo(
    () => [...new Set(alerts.map((a) => a.parameter))].sort(),
    [alerts]
  );

  // ── Filtered and sorted alerts ───────────────────────────────────────────
  const sortedAndFiltered = useMemo(() => {
    let filtered = alerts.filter((alert) => {
      const paramMatch  = filterParameter === "all" || alert.parameter === filterParameter;
      const statusMatch = filterStatus    === "all" || alert.status    === filterStatus;
      return paramMatch && statusMatch;
    });

    return filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Timestamps are stored as Unix ms numbers — compare numerically
      if (sortBy === "timestamp") {
        aVal = a.timestamp ?? 0;
        bVal = b.timestamp ?? 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ?  1 : -1;
      return 0;
    });
  }, [alerts, filterParameter, filterStatus, sortBy, sortDirection]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortDirection === "asc"
      ? <ChevronUp   className="w-4 h-4" />
      : <ChevronDown className="w-4 h-4" />;
  };

  const getStatusColor = (status) =>
    status === "danger"
      ? "bg-danger/10 text-danger"
      : "bg-caution/10 text-caution";

  // Format a Unix ms timestamp into a readable date-time string
  const formatTimestamp = (ts) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-PH", {
      year:   "numeric",
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Layout userEmail="staff@sanctuary.org">
      <div className="p-8">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <h2 className="text-2xl font-header font-bold text-foreground mb-6">
          Alert Logs
        </h2>

        {/* ── Firebase Connection Banner ───────────────────────────────────── */}
        {connectionState === "connecting" && (
          <div className="mb-6 flex items-center gap-3 bg-secondary/40 border border-secondary rounded-xl px-5 py-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Connecting to Firebase...
          </div>
        )}

        {connectionState === "error" && (
          <div className="mb-6 flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {errorMessage || "Unable to load alert logs from Firebase."}
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Filter by Parameter
            </label>
            <select
              value={filterParameter}
              onChange={(e) => setFilterParameter(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-secondary bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Parameters</option>
              {parameters.map((param) => (
                <option key={param} value={param}>
                  {param}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Filter by Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-secondary bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="danger">Danger</option>
              <option value="caution">Caution</option>
            </select>
          </div>
        </div>

        {/* ── Alerts Table ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-secondary shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary/30">
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={() => handleSort("timestamp")}
                      className="flex items-center gap-2 font-header font-bold text-sm text-foreground hover:text-primary transition-colors"
                    >
                      Timestamp <SortIcon field="timestamp" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={() => handleSort("parameter")}
                      className="flex items-center gap-2 font-header font-bold text-sm text-foreground hover:text-primary transition-colors"
                    >
                      Parameter <SortIcon field="parameter" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <span className="font-header font-bold text-sm text-foreground">
                      Value
                    </span>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={() => handleSort("status")}
                      className="flex items-center gap-2 font-header font-bold text-sm text-foreground hover:text-primary transition-colors"
                    >
                      Status <SortIcon field="status" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <span className="font-header font-bold text-sm text-foreground">
                      Description
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {connectionState === "connecting" ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Loading alert logs from Firebase...
                      </div>
                    </td>
                  </tr>
                ) : sortedAndFiltered.length > 0 ? (
                  sortedAndFiltered.map((alert) => (
                    <tr
                      key={alert.id}
                      className="border-b border-secondary hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatTimestamp(alert.timestamp)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">
                        {alert.parameter}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {alert.value !== null
                          ? `${Number(alert.value).toFixed(2)} ${alert.unit}`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(alert.status)}`}>
                          {alert.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {alert.description}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                      {alerts.length === 0
                        ? "No alert logs found in the database."
                        : "No alerts match the selected filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary Footer ───────────────────────────────────────────────── */}
        <div className="mt-6 bg-secondary/30 rounded-xl p-4 border border-secondary">
          <p className="text-sm text-muted-foreground">
            {connectionState === "live"
              ? `Showing ${sortedAndFiltered.length} of ${alerts.length} alerts — live from Firebase`
              : connectionState === "connecting"
              ? "Loading from Firebase Realtime Database..."
              : "Firebase connection unavailable."}
          </p>
        </div>

      </div>
    </Layout>
  );
}
