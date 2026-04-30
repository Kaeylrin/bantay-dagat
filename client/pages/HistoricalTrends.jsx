import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { WifiOff, RefreshCw } from "lucide-react";
import { db, ref, onValue, off } from "@/lib/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase path: /sensor_data/history
//
// Each child pushed by the Arduino:
// {
//   timestamp:   1713800000000,
//   temperature: 28.3,
//   humidity:    67.1,
//   ph:          7.1,
//   turbidity:   2.4
// }
//
// "Last 24 Hours" filters entries from the past 86,400,000 ms
// "Last 7 Days"   filters entries from the past 604,800,000 ms
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  temperature: { safeMin: 25, safeMax: 32 },
  humidity:    { safeMin: 50, safeMax: 80 },
  ph:          { safeMin: 6.8, safeMax: 7.4 },
  turbidity:   { safeMin: 0,  safeMax: 5  },
};

const TIME_RANGES = {
  day:  24 * 60 * 60 * 1000,       // 24 hours in ms
  week: 7  * 24 * 60 * 60 * 1000,  // 7 days in ms
};

export default function HistoricalTrends() {
  const [allHistory,      setAllHistory]      = useState([]);
  const [timeRange,       setTimeRange]       = useState("day");
  const [connectionState, setConnectionState] = useState("connecting");
  const [errorMessage,    setErrorMessage]    = useState(null);

  useEffect(() => {
    const historyRef = ref(db, "sensor_data/history");

    onValue(
      historyRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Convert Firebase object to sorted array
          const entries = Object.values(data)
            .filter((e) => e.timestamp)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((entry) => ({
              timestamp:   entry.timestamp,
              time: new Date(entry.timestamp).toLocaleTimeString("en-PH", {
                hour:   "2-digit",
                minute: "2-digit",
              }),
              date: new Date(entry.timestamp).toLocaleDateString("en-PH", {
                month: "short",
                day:   "numeric",
              }),
              temperature: entry.temperature ?? null,
              humidity:    entry.humidity    ?? null,
              ph:          entry.ph          ?? null,
              turbidity:   entry.turbidity   ?? null,
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
      }
    );

    return () => off(historyRef);
  }, []);

  // Filter history entries to the selected time range
  const now = Date.now();
  const filteredHistory = allHistory.filter(
    (entry) => entry.timestamp >= now - TIME_RANGES[timeRange]
  );

  // Use time for day view, date+time for week view
  const chartData = filteredHistory.map((entry) => ({
    ...entry,
    label: timeRange === "day" ? entry.time : `${entry.date} ${entry.time}`,
  }));

  const hasData = chartData.length > 0;

  const chartStyle = {
    contentStyle: {
      backgroundColor: "white",
      border: "1px solid hsl(var(--secondary))",
      borderRadius: "8px",
    },
  };

  return (
    <Layout userEmail="staff@sanctuary.org">
      <div className="p-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-header font-bold text-foreground">
            Historical Water Quality Trends
          </h2>
          <div className="flex gap-2">
            {["day", "week"].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  timeRange === range
                    ? "bg-primary text-white"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {range === "day" ? "Last 24 Hours" : "Last 7 Days"}
              </button>
            ))}
          </div>
        </div>

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
            {errorMessage || "Unable to load historical data from Firebase."}
          </div>
        )}

        {/* ── No Data State ────────────────────────────────────────────────── */}
        {connectionState === "live" && !hasData && (
          <div className="mb-6 bg-secondary/30 border border-secondary rounded-xl px-5 py-8 text-center text-muted-foreground text-sm">
            No sensor history found for the selected time range.
            Data will appear here once the Arduino begins transmitting.
          </div>
        )}

        {/* ── Charts Grid ──────────────────────────────────────────────────── */}
        {hasData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Temperature */}
            <div className="bg-white rounded-xl p-6 border border-secondary shadow-sm">
              <h3 className="text-lg font-header font-bold text-foreground mb-4">
                Temperature (°C)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--secondary))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 40]} />
                  <Tooltip {...chartStyle} />
                  <ReferenceLine y={THRESHOLDS.temperature.safeMin} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Min Safe", position: "right", fontSize: 11 }} />
                  <ReferenceLine y={THRESHOLDS.temperature.safeMax} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Max Safe", position: "right", fontSize: 11 }} />
                  <Line type="monotone" dataKey="temperature" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} name="Temperature" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Humidity */}
            <div className="bg-white rounded-xl p-6 border border-secondary shadow-sm">
              <h3 className="text-lg font-header font-bold text-foreground mb-4">
                Humidity (%)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--secondary))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip {...chartStyle} />
                  <ReferenceLine y={THRESHOLDS.humidity.safeMin} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Min Safe", position: "right", fontSize: 11 }} />
                  <ReferenceLine y={THRESHOLDS.humidity.safeMax} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Max Safe", position: "right", fontSize: 11 }} />
                  <Line type="monotone" dataKey="humidity" stroke="hsl(var(--accent))" dot={false} strokeWidth={2} name="Humidity" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* pH */}
            <div className="bg-white rounded-xl p-6 border border-secondary shadow-sm">
              <h3 className="text-lg font-header font-bold text-foreground mb-4">
                pH Level
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--secondary))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[6, 8]} />
                  <Tooltip {...chartStyle} />
                  <ReferenceLine y={THRESHOLDS.ph.safeMin} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Min Safe", position: "right", fontSize: 11 }} />
                  <ReferenceLine y={THRESHOLDS.ph.safeMax} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Max Safe", position: "right", fontSize: 11 }} />
                  <Line type="monotone" dataKey="ph" stroke="hsl(var(--caution))" dot={false} strokeWidth={2} name="pH" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Turbidity */}
            <div className="bg-white rounded-xl p-6 border border-secondary shadow-sm">
              <h3 className="text-lg font-header font-bold text-foreground mb-4">
                Turbidity (NTU)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--secondary))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip {...chartStyle} />
                  <ReferenceLine y={THRESHOLDS.turbidity.safeMax} stroke="hsl(var(--safe))" strokeDasharray="5 5" label={{ value: "Max Safe", position: "right", fontSize: 11 }} />
                  <Line type="monotone" dataKey="turbidity" stroke="hsl(var(--danger))" dot={false} strokeWidth={2} name="Turbidity" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

        {/* ── Legend ───────────────────────────────────────────────────────── */}
        <div className="mt-6 bg-secondary/30 rounded-xl p-4 border border-secondary">
          <p className="text-sm font-medium text-foreground mb-3">Threshold Legend</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-safe" />
              <span className="text-sm text-muted-foreground">Safe Range</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-caution" />
              <span className="text-sm text-muted-foreground">Caution Range</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-danger" />
              <span className="text-sm text-muted-foreground">Danger Range</span>
            </div>
          </div>
          {connectionState === "live" && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing {chartData.length} readings from Firebase
              {timeRange === "day" ? " (last 24 hours)" : " (last 7 days)"}.
            </p>
          )}
        </div>

      </div>
    </Layout>
  );
}
