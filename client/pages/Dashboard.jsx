import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  Thermometer,
  Droplets,
  TestTube,
  Eye,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { db, ref, onValue, off } from "@/lib/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// SENSOR CONFIGURATION
//
// Defines each sensor's display name, Firebase field key, unit, icon, and
// the safe / caution threshold ranges used for status evaluation.
//
// Firebase path expected:  /sensor_data/latest
// Fields expected:         temperature, humidity, ph, turbidity
// ─────────────────────────────────────────────────────────────────────────────
const SENSOR_CONFIG = [
  {
    key:   "temperature",
    name:  "Temperature",
    unit:  "°C",
    icon:  Thermometer,
    threshold: { safe: [25, 32], caution: [20, 35] },
  },
  {
    key:   "humidity",
    name:  "Humidity",
    unit:  "%",
    icon:  Droplets,
    threshold: { safe: [50, 80], caution: [40, 90] },
  },
  {
    key:   "ph",
    name:  "pH Level",
    unit:  "pH",
    icon:  TestTube,
    threshold: { safe: [6.8, 7.4], caution: [6.5, 7.8] },
  },
  {
    key:   "turbidity",
    name:  "Turbidity",
    unit:  "NTU",
    icon:  Eye,
    threshold: { safe: [0, 5], caution: [0, 10] },
  },
];

// Derives safe / caution / danger from a numeric value and its thresholds
function deriveStatus(value, threshold) {
  if (value === null || value === undefined) return "unknown";
  if (value < threshold.caution[0] || value > threshold.caution[1]) return "danger";
  if (value < threshold.safe[0]    || value > threshold.safe[1])    return "caution";
  return "safe";
}

function getStatusColor(status) {
  switch (status) {
    case "safe":    return "text-safe border-safe/20 bg-safe/5";
    case "caution": return "text-caution border-caution/20 bg-caution/5";
    case "danger":  return "text-danger border-danger/20 bg-danger/5";
    default:        return "text-muted-foreground border-secondary bg-secondary/10";
  }
}

function getStatusBadgeColor(status) {
  switch (status) {
    case "safe":    return "bg-safe/20 text-safe";
    case "caution": return "bg-caution/20 text-caution";
    case "danger":  return "bg-danger/20 text-danger";
    default:        return "bg-secondary text-muted-foreground";
  }
}

function getLineColor(status) {
  switch (status) {
    case "safe":    return "hsl(var(--safe))";
    case "caution": return "hsl(var(--caution))";
    case "danger":  return "hsl(var(--danger))";
    default:        return "hsl(var(--muted-foreground))";
  }
}

export default function Dashboard() {
  // latestReading  → the most recent sensor document from Firebase
  // trendHistory   → last N readings used to plot the mini sparkline charts
  // connectionState → "connecting" | "live" | "error"
  // lastUpdated    → timestamp string of the last successful Firebase push
  const [latestReading,  setLatestReading]  = useState(null);
  const [trendHistory,   setTrendHistory]   = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [lastUpdated,    setLastUpdated]    = useState(null);
  const [errorMessage,   setErrorMessage]   = useState(null);

  useEffect(() => {
    // ── LISTENER 1: Latest reading ──────────────────────────────────────────
    // Listens to /sensor_data/latest in Firebase.
    // The Arduino writes its most recent reading to this path after every cycle.
    // onValue fires immediately with the current value, then again on every change.
    const latestRef = ref(db, "sensor_data/latest");

    onValue(
      latestRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setLatestReading(data);
          setConnectionState("live");
          setLastUpdated(
            data.timestamp
              ? new Date(data.timestamp).toLocaleTimeString("en-PH")
              : new Date().toLocaleTimeString("en-PH")
          );
          setErrorMessage(null);
        } else {
          // Path exists but no data has been written yet (Arduino not started)
          setConnectionState("error");
          setErrorMessage("No sensor data found. Waiting for Arduino to transmit.");
        }
      },
      (error) => {
        setConnectionState("error");
        setErrorMessage(error.message);
      }
    );

    // ── LISTENER 2: Trend history ────────────────────────────────────────────
    // Listens to /sensor_data/history for the last 20 readings.
    // The Arduino pushes each reading here via Firebase push().
    // This data feeds the mini sparkline charts on each sensor card.
    const historyRef = ref(db, "sensor_data/history");

    onValue(
      historyRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Firebase push() stores children with auto-generated keys.
          // Convert the object to an array sorted by timestamp.
          const entries = Object.values(data)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .slice(-20) // keep last 20 readings for the sparkline
            .map((entry) => ({
              time: entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--",
              temperature: entry.temperature ?? null,
              humidity:    entry.humidity    ?? null,
              ph:          entry.ph          ?? null,
              turbidity:   entry.turbidity   ?? null,
            }));
          setTrendHistory(entries);
        }
      },
      () => {} // non-fatal: sparklines just stay empty
    );

    // Cleanup: detach both Firebase listeners when component unmounts
    return () => {
      off(latestRef);
      off(historyRef);
    };
  }, []);

  // ── Build sensor display objects from live Firebase data ─────────────────
  const sensors = SENSOR_CONFIG.map((cfg) => {
    const value  = latestReading ? (latestReading[cfg.key] ?? null) : null;
    const status = deriveStatus(value, cfg.threshold);
    return { ...cfg, value, status };
  });

  const cautionCount = sensors.filter((s) => s.status === "caution").length;
  const dangerCount  = sensors.filter((s) => s.status === "danger").length;
  const canRelease   = latestReading && dangerCount === 0 && cautionCount === 0;

  return (
    <Layout userEmail="staff@sanctuary.org">
      <div className="p-8">

        {/* ── Firebase Connection Banner ───────────────────────────────────── */}
        {connectionState === "connecting" && (
          <div className="mb-6 flex items-center gap-3 bg-secondary/40 border border-secondary rounded-xl px-5 py-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Connecting to Firebase Realtime Database...
          </div>
        )}

        {connectionState === "error" && (
          <div className="mb-6 flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {errorMessage || "Unable to connect to Firebase. Check your network."}
          </div>
        )}

        {/* ── Status Summary Bar ───────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 border border-secondary shadow-sm">
            <p className="text-xs text-muted-foreground font-medium mb-2">CAUTION</p>
            <p className="text-3xl font-header font-bold text-caution">{cautionCount}</p>
            <p className="text-xs text-muted-foreground mt-2">Warning level</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-secondary shadow-sm">
            <p className="text-xs text-muted-foreground font-medium mb-2">DANGER</p>
            <p className="text-3xl font-header font-bold text-danger">{dangerCount}</p>
            <p className="text-xs text-muted-foreground mt-2">Critical level</p>
          </div>
        </div>

        {/* ── GO / NO-GO Decision Card ─────────────────────────────────────── */}
        {latestReading ? (
          <div
            className={`mb-8 rounded-xl p-8 border-2 shadow-md transition-all ${
              canRelease
                ? "bg-safe/10 border-safe/40"
                : "bg-danger/10 border-danger/40"
            }`}
          >
            <div className="flex items-start gap-3">
              {canRelease
                ? <CheckCircle2 className="w-8 h-8 text-safe shrink-0 mt-1" />
                : <AlertTriangle className="w-8 h-8 text-danger shrink-0 mt-1" />
              }
              <div>
                <h2 className="text-3xl font-header font-bold mb-2">
                  {canRelease
                    ? <span className="text-safe">SAFE TO RELEASE</span>
                    : <span className="text-danger">DO NOT RELEASE</span>
                  }
                </h2>
                <p className={`text-lg font-medium ${canRelease ? "text-safe" : "text-danger"}`}>
                  {canRelease
                    ? "All water quality parameters are within safe thresholds for sea turtle release."
                    : "Water quality conditions are not suitable for safe release. Review alerts below."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8 rounded-xl p-8 border-2 border-secondary bg-secondary/10 shadow-md">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin shrink-0" />
              <div>
                <h2 className="text-2xl font-header font-bold text-muted-foreground mb-1">
                  Awaiting Sensor Data
                </h2>
                <p className="text-muted-foreground">
                  The release assessment will appear once the Arduino begins transmitting.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Sensor Cards ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h3 className="text-lg font-header font-bold text-foreground mb-4">
            Live Sensor Data
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {sensors.map((sensor) => {
              const Icon = sensor.icon;
              // Extract this sensor's value from history for the sparkline
              const sparkData = trendHistory.map((entry) => ({
                time:  entry.time,
                value: entry[sensor.key],
              }));

              return (
                <div
                  key={sensor.name}
                  className={`bg-white rounded-xl p-6 border-2 shadow-sm hover:shadow-md transition-all ${getStatusColor(sensor.status)}`}
                >
                  {/* Icon and Status Badge */}
                  <div className="flex items-start justify-between mb-4">
                    <Icon className="w-6 h-6 text-foreground" />
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${getStatusBadgeColor(sensor.status)}`}>
                      {sensor.status === "unknown" ? "NO DATA" : sensor.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Parameter Name */}
                  <p className="text-sm text-muted-foreground font-medium mb-3">
                    {sensor.name}
                  </p>

                  {/* Value — shows dash when no data yet */}
                  <div className="mb-4">
                    <p className="text-4xl font-header font-bold text-foreground">
                      {sensor.value !== null ? sensor.value : "--"}
                    </p>
                    <p className="text-sm text-muted-foreground">{sensor.unit}</p>
                  </div>

                  {/* Sparkline Trend Chart — from Firebase history */}
                  <div className="h-12 -mx-2">
                    {sparkData.some((d) => d.value !== null) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkData}>
                          <XAxis dataKey="time" hide />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "white",
                              border: "1px solid hsl(var(--secondary))",
                              borderRadius: "8px",
                              padding: "8px",
                            }}
                            formatter={(value) => [`${value} ${sensor.unit}`, ""]}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={getLineColor(sensor.status)}
                            dot={false}
                            strokeWidth={2}
                            isAnimationActive={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">No history yet</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer Info ──────────────────────────────────────────────────── */}
        <div className="bg-secondary/30 rounded-xl p-4 border border-secondary">
          <p className="text-xs text-muted-foreground">
            {connectionState === "live"
              ? `Live data from Firebase Realtime Database. Last updated: ${lastUpdated}`
              : connectionState === "connecting"
              ? "Connecting to Firebase Realtime Database..."
              : "Firebase connection unavailable. Check network or database rules."}
          </p>
        </div>

      </div>
    </Layout>
  );
}
