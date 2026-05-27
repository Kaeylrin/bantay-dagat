import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  Thermometer,
  Wind,
  Droplets,
  TestTube,
  Eye,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  db,
  ref,
  onValue,
  off,
  mapArduinoReading,
  DB_PATHS,
} from "@/lib/firebase";

// Truncates to exactly 2 decimal places WITHOUT rounding
// e.g. 27.456 → "27.45", 27.999 → "27.99"
function truncTo2(value) {
  if (value === null || value === undefined) return "--";
  return (Math.floor(Number(value) * 100) / 100).toFixed(2);
}

const SENSOR_CONFIG = [
  {
    key: "air_temperature",
    name: "Air Temp",
    unit: "°C",
    icon: Wind,
    threshold: { safe: [25, 33], caution: [22, 36] },
  },
  {
    key: "temperature",
    name: "Water Temp",
    unit: "°C",
    icon: Thermometer,
    threshold: { safe: [26, 32], caution: [24, 34] },
  },
  {
    key: "humidity",
    name: "Humidity",
    unit: "%",
    icon: Droplets,
    threshold: { safe: [60, 85], caution: [50, 90] },
  },
  {
    key: "ph",
    name: "pH Level",
    unit: "pH",
    icon: TestTube,
    threshold: { safe: [7.8, 8.3], caution: [7.5, 8.5] },
  },
  {
    key: "turbidity",
    name: "Turbidity",
    unit: "NTU",
    icon: Eye,
    threshold: { safe: [0, 10], caution: [0, 20] },
  },
];

function deriveStatus(value, threshold) {
  if (value === null || value === undefined) return "unknown";
  if (value < threshold.caution[0] || value > threshold.caution[1])
    return "danger";
  if (value < threshold.safe[0] || value > threshold.safe[1]) return "caution";
  return "safe";
}

const statusCard = (s) =>
  ({
    safe: "text-safe border-safe/20 bg-safe/5",
    caution: "text-caution border-caution/20 bg-caution/5",
    danger: "text-danger border-danger/20 bg-danger/5",
  })[s] ?? "text-muted-foreground border-secondary bg-secondary/10";
const statusBadge = (s) =>
  ({
    safe: "bg-safe/20 text-safe",
    caution: "bg-caution/20 text-caution",
    danger: "bg-danger/20 text-danger",
  })[s] ?? "bg-secondary text-muted-foreground";
const lineColor = (s) =>
  ({
    safe: "hsl(var(--safe))",
    caution: "hsl(var(--caution))",
    danger: "hsl(var(--danger))",
  })[s] ?? "hsl(var(--muted-foreground))";

export default function Dashboard() {
  const [latestReading, setLatestReading] = useState(null);
  const [trendHistory, setTrendHistory] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const latestRef = ref(db, DB_PATHS.LATEST);

    const historyRef = ref(db, DB_PATHS.READINGS);

    onValue(
      latestRef,
      (snap) => {
        const raw = snap.val();
        if (raw) {
          const mapped = mapArduinoReading(raw);
          setLatestReading(mapped);
          setConnectionState("live");
          setLastUpdated(
            mapped.timestamp
              ? new Date(mapped.timestamp).toLocaleTimeString("en-PH")
              : new Date().toLocaleTimeString("en-PH"),
          );
          setErrorMessage(null);
        } else {
          setConnectionState("error");
          setErrorMessage(
            "No sensor data found. Waiting for Arduino to transmit.",
          );
        }
      },
      (err) => {
        setConnectionState("error");
        setErrorMessage(err.message);
      },
    );

    onValue(
      historyRef,
      (snap) => {
        const data = snap.val();
        if (data) {
          const entries = Object.values(data)
            .map(mapArduinoReading)
            .filter(Boolean)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .slice(-20)
            .map((e) => ({
              time: e.timestamp
                ? new Date(e.timestamp).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--",
              air_temperature: e.air_temperature ?? null,
              temperature: e.temperature ?? null,
              humidity: e.humidity ?? null,
              ph: e.ph ?? null,
              turbidity: e.turbidity ?? null,
            }));
          setTrendHistory(entries);
        }
      },
      () => {},
    );

    return () => {
      off(latestRef);
      off(historyRef);
    };
  }, []);

  const sensors = SENSOR_CONFIG.map((cfg) => {
    const value = latestReading ? (latestReading[cfg.key] ?? null) : null;
    const status = deriveStatus(value, cfg.threshold);
    return { ...cfg, value, status };
  });

  const cautionCount = sensors.filter((s) => s.status === "caution").length;
  const dangerCount = sensors.filter((s) => s.status === "danger").length;
  const canRelease = latestReading && dangerCount === 0 && cautionCount === 0;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8">
        {connectionState === "connecting" && (
          <div className="mb-6 flex items-center gap-3 bg-secondary/40 border border-secondary rounded-xl px-5 py-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Connecting to Firebase Realtime Database…
          </div>
        )}
        {connectionState === "error" && (
          <div className="mb-6 flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {errorMessage || "Unable to connect to Firebase."}
          </div>
        )}

        {/* Status Summary */}
        <div className="mb-6 sm:mb-8 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl p-4 border border-secondary shadow-sm">
            <p className="text-xs text-muted-foreground font-medium mb-2">
              CAUTION
            </p>
            <p className="text-3xl font-header font-bold text-caution">
              {cautionCount}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Warning level</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-secondary shadow-sm">
            <p className="text-xs text-muted-foreground font-medium mb-2">
              DANGER
            </p>
            <p className="text-3xl font-header font-bold text-danger">
              {dangerCount}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Critical level</p>
          </div>
        </div>

        {/* GO / NO-GO */}
        {latestReading ? (
          <div
            className={`mb-6 sm:mb-8 rounded-xl p-5 sm:p-8 border-2 shadow-md transition-all ${canRelease ? "bg-safe/10 border-safe/40" : "bg-danger/10 border-danger/40"}`}
          >
            <div className="flex items-start gap-3">
              {canRelease ? (
                <CheckCircle2 className="w-8 h-8 text-safe shrink-0 mt-1" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-danger shrink-0 mt-1" />
              )}
              <div>
                <h2 className="text-xl sm:text-3xl font-header font-bold mb-2">
                  {canRelease ? (
                    <span className="text-safe">SAFE TO RELEASE</span>
                  ) : (
                    <span className="text-danger">DO NOT RELEASE</span>
                  )}
                </h2>
                <p
                  className={`text-sm sm:text-lg font-medium ${canRelease ? "text-safe" : "text-danger"}`}
                >
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
                  The release assessment will appear once the Arduino begins
                  transmitting.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sensor Cards */}
        <div className="mb-8">
          <h3 className="text-lg font-header font-bold text-foreground mb-4">
            Live Sensor Data
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            {sensors.map((sensor) => {
              const Icon = sensor.icon;
              const sparkData = trendHistory.map((e) => ({
                time: e.time,
                value: e[sensor.key],
              }));
              return (
                <div
                  key={sensor.key}
                  className={`bg-white rounded-xl p-5 border-2 shadow-sm hover:shadow-md transition-all ${statusCard(sensor.status)}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <Icon className="w-5 h-5 text-foreground" />
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(sensor.status)}`}
                    >
                      {sensor.status === "unknown"
                        ? "NO DATA"
                        : sensor.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    {sensor.name}
                  </p>
                  <div className="mb-3">
                    <p className="text-3xl font-header font-bold text-foreground">
                      {truncTo2(sensor.value)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sensor.unit}
                    </p>
                  </div>
                  <div className="h-10 -mx-1">
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
                              padding: "6px",
                              fontSize: "12px",
                            }}
                            formatter={(v) => [`${truncTo2(v)} ${sensor.unit}`, ""]}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={lineColor(sensor.status)}
                            dot={false}
                            strokeWidth={2}
                            isAnimationActive={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">
                          No history
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-secondary/30 rounded-xl p-4 border border-secondary">
          <p className="text-xs text-muted-foreground">
            {connectionState === "live"
              ? `Live data · Firebase Realtime Database · Last updated: ${lastUpdated}`
              : connectionState === "connecting"
                ? "Connecting to Firebase Realtime Database…"
                : "Firebase connection unavailable."}
          </p>
        </div>
      </div>
    </Layout>
  );
}
