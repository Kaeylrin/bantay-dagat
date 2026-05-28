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
    threshold: { safe: [25, 32], caution: [22, 35] },
  },
  {
    key: "temperature",
    name: "Water Temp",
    unit: "°C",
    icon: Thermometer,
    threshold: { safe: [26, 31], caution: [24, 33] },
  },
  {
    key: "humidity",
    name: "Humidity",
    unit: "%",
    icon: Droplets,
    threshold: { safe: [65, 85], caution: [55, 90] },
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
    threshold: { safe: [0, 25], caution: [0, 50] },
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
  const [showGuide, setShowGuide] = useState(false);

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

  let releaseStatus = "unknown";
  if (latestReading) {
    if (dangerCount >= 1) {
      releaseStatus = "danger";
    } else if (cautionCount >= 2) {
      releaseStatus = "nogo_caution";
    } else if (cautionCount === 1) {
      releaseStatus = "go_caution";
    } else {
      releaseStatus = "go";
    }
  }

  const getBannerDetails = (status) => {
    switch (status) {
      case "go":
        return {
          bgClass: "bg-safe/10 border-safe/40",
          textClass: "text-safe",
          title: "GO: SAFE TO RELEASE",
          desc: "All environmental parameters are within safe thresholds for sea turtle release.",
          icon: CheckCircle2,
        };
      case "go_caution":
        return {
          bgClass: "bg-caution/10 border-caution/40",
          textClass: "text-caution",
          title: "GO WITH CAUTION: SAFE TO RELEASE",
          desc: "Exactly one parameter is within caution limits. Release is permissible, but proceed with caution.",
          icon: CheckCircle2,
        };
      case "nogo_caution":
        return {
          bgClass: "bg-orange-500/10 border-orange-500/40",
          textClass: "text-orange-600",
          title: "NO-GO: DO NOT RELEASE (CAUTION)",
          desc: "Two or more parameters are within caution limits. Release is not recommended due to suboptimal conditions.",
          icon: AlertTriangle,
        };
      case "danger":
        return {
          bgClass: "bg-danger/10 border-danger/40",
          textClass: "text-danger",
          title: "NO-GO: DO NOT RELEASE (DANGER)",
          desc: "One or more parameters are at critical danger levels. Release is strictly prohibited.",
          icon: AlertTriangle,
        };
      default:
        return null;
    }
  };

  const banner = getBannerDetails(releaseStatus);

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

        {/* Top Summary Row (Alert Banner + Stats) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Banner (GO / NO-GO) - spans 2 cols on desktop */}
          <div className="lg:col-span-2">
            {latestReading && banner ? (
              <div
                className={`h-full flex items-center rounded-xl p-5 sm:p-6 border-2 shadow-sm transition-all ${banner.bgClass}`}
              >
                <div className="flex items-start gap-3">
                  <banner.icon className={`w-8 h-8 ${banner.textClass} shrink-0 mt-0.5`} />
                  <div>
                    <h2 className={`text-lg sm:text-xl font-header font-bold mb-1 ${banner.textClass}`}>
                      {banner.title}
                    </h2>
                    <p className={`text-xs sm:text-sm font-medium ${banner.textClass} opacity-90`}>
                      {banner.desc}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center rounded-xl p-5 sm:p-6 border-2 border-secondary bg-secondary/10 shadow-sm">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin shrink-0" />
                  <div>
                    <h2 className="text-base font-header font-bold text-muted-foreground mb-0.5">
                      Awaiting Sensor Data
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      The release assessment will appear once the Arduino begins transmitting.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats Summary - 1 col on desktop */}
          <div className="bg-white rounded-xl border border-secondary shadow-sm p-4 flex justify-around items-center h-full min-h-[90px]">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">
                Caution
              </p>
              <p className="text-2xl font-header font-bold text-caution leading-none">
                {cautionCount}
              </p>
            </div>
            <div className="w-[1px] h-10 bg-secondary" />
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">
                Danger
              </p>
              <p className="text-2xl font-header font-bold text-danger leading-none">
                {dangerCount}
              </p>
            </div>
          </div>
        </div>

        {/* Collapsible How the GO/NO-GO assessment works */}
        {showGuide && (
          <div className="mb-6 bg-white rounded-xl border border-secondary shadow-sm p-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <TestTube className="w-5 h-5" />
              </span>
              <h3 className="text-lg font-header font-bold text-foreground">
                How the GO/NO-GO Assessment Works
              </h3>
            </div>
            
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Environmental thresholds are calibrated to align with the combined physiological tolerances of the five local sea turtle species nesting in Labac, Naic, Cavite (Green Sea, Leatherback, Loggerhead, Hawksbill, and Olive Ridley). This ensures safe releases under unified local water quality guidelines.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Logic Rules */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">Decision Logic</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-safe/5 border border-safe/10">
                    <CheckCircle2 className="w-5 h-5 text-safe shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-safe">GO: SAFE TO RELEASE</p>
                      <p className="text-xs text-muted-foreground mt-0.5">All 5 environmental parameters are within their <strong>Safe Ranges</strong>.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-caution/5 border border-caution/10">
                    <CheckCircle2 className="w-5 h-5 text-caution shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-caution">GO WITH CAUTION: SAFE TO RELEASE</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Exactly <strong>1 parameter</strong> is within its Caution Range, and the other 4 are Safe.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-orange-600">NO-GO: DO NOT RELEASE (CAUTION)</p>
                      <p className="text-xs text-muted-foreground mt-0.5"><strong>2 or more parameters</strong> are within their Caution Ranges (suboptimal release conditions).</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-danger/5 border border-danger/10">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-danger">NO-GO: DO NOT RELEASE (DANGER)</p>
                      <p className="text-xs text-muted-foreground mt-0.5"><strong>1 or more parameters</strong> are within their critical <strong>Danger Ranges</strong>.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Threshold Ranges Table */}
              <div>
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">Threshold Values</h4>
                <div className="border border-secondary rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-secondary/30 border-b border-secondary">
                        <th className="p-2 font-bold text-foreground">Parameter</th>
                        <th className="p-2 font-bold text-safe">Safe (GO)</th>
                        <th className="p-2 font-bold text-caution">Caution</th>
                        <th className="p-2 font-bold text-danger">Danger</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-secondary">
                        <td className="p-2 font-medium text-foreground">Air Temp</td>
                        <td className="p-2 text-safe">25.00 – 32.00 °C</td>
                        <td className="p-2 text-caution">22.00 – 24.99 / 32.01 – 35.00</td>
                        <td className="p-2 text-danger">&lt; 22.00 / &gt; 35.00</td>
                      </tr>
                      <tr className="border-b border-secondary">
                        <td className="p-2 font-medium text-foreground">Water Temp</td>
                        <td className="p-2 text-safe">26.00 – 31.00 °C</td>
                        <td className="p-2 text-caution">24.00 – 25.99 / 31.01 – 33.00</td>
                        <td className="p-2 text-danger">&lt; 24.00 / &gt; 33.00</td>
                      </tr>
                      <tr className="border-b border-secondary">
                        <td className="p-2 font-medium text-foreground">Humidity</td>
                        <td className="p-2 text-safe">65.00 – 85.00 %</td>
                        <td className="p-2 text-caution">55.00 – 64.99 / 85.01 – 90.00</td>
                        <td className="p-2 text-danger">&lt; 55.00 / &gt; 90.00</td>
                      </tr>
                      <tr className="border-b border-secondary">
                        <td className="p-2 font-medium text-foreground">pH Level</td>
                        <td className="p-2 text-safe">7.80 – 8.30</td>
                        <td className="p-2 text-caution">7.50 – 7.79 / 8.31 – 8.50</td>
                        <td className="p-2 text-danger">&lt; 7.50 / &gt; 8.50</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-foreground">Turbidity</td>
                        <td className="p-2 text-safe">0.00 – 25.00 NTU</td>
                        <td className="p-2 text-caution">25.01 – 50.00 NTU</td>
                        <td className="p-2 text-danger">&gt; 50.00 NTU</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="font-bold">Supported local species:</span>
                  <span>Green Sea Turtle · Leatherback · Loggerhead · Hawksbill · Olive Ridley</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Sensor Data */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-header font-bold text-foreground">
              Live Sensor Data
            </h3>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-secondary bg-white text-xs font-semibold text-muted-foreground hover:bg-secondary/40 transition-colors shadow-sm"
            >
              <TestTube className="w-3.5 h-3.5 text-primary" />
              {showGuide ? "Hide Assessment Guide" : "Show Assessment Guide"}
            </button>
          </div>
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
