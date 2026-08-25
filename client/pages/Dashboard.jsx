import { useState, useEffect, useMemo } from "react";
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
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
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
  query,
  limitToLast,
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
    description:
      "Ambient temperature above the water surface. Affects the turtle's thermal regulation immediately upon release. The ideal range ensures pawikans are neither heat-stressed nor chilled during the transition to open water.",
  },
  {
    key: "temperature",
    name: "Water Temp",
    unit: "°C",
    icon: Thermometer,
    threshold: { safe: [26, 31], caution: [24, 33] },
    description:
      "Sea surface temperature — the most critical parameter for pawikan survival. All five local species require warm, stable water for metabolic function, immune response, and successful navigation post-release.",
  },
  {
    key: "humidity",
    name: "Humidity",
    unit: "%",
    icon: Droplets,
    threshold: { safe: [65, 85], caution: [55, 90] },
    description:
      "Relative atmospheric humidity at the release site. Optimal levels prevent dehydration during the critical transition from the holding facility to open water, supporting healthy mucous membrane function.",
  },
  {
    key: "ph",
    name: "pH Level",
    unit: "pH",
    icon: TestTube,
    threshold: { safe: [7.8, 8.3], caution: [7.5, 8.5] },
    description:
      "Seawater acidity/alkalinity level. Values outside the safe range (slightly alkaline) cause physiological stress, impair immune function, and can disrupt a pawikan's magnetoreception-based navigation instinct.",
  },
  {
    key: "turbidity",
    name: "Turbidity",
    unit: "NTU",
    icon: Eye,
    threshold: { safe: [0, 25], caution: [0, 50] },
    description:
      "Water clarity measured in NTU (Nephelometric Turbidity Units). High turbidity from suspended sediment or algal blooms can disorient turtles, mask underwater hazards, and reduce post-release feeding success.",
  },
];

function deriveStatus(value, threshold) {
  if (value === null || value === undefined) return "unknown";
  if (value < threshold.caution[0] || value > threshold.caution[1])
    return "danger";
  if (value < threshold.safe[0] || value > threshold.safe[1]) return "caution";
  return "safe";
}

// Compute trend from session history: rising / falling / stable / insufficient
function computeTrend(data, key) {
  const values = data
    .map((d) => d[key])
    .filter((v) => v !== null && v !== undefined);
  if (values.length < 4) return "insufficient";
  const half = Math.floor(values.length / 2);
  const firstAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondSlice = values.slice(half);
  const secondAvg = secondSlice.reduce((a, b) => a + b, 0) / secondSlice.length;
  const relChange = Math.abs(secondAvg - firstAvg) / (Math.abs(firstAvg) || 1);
  if (relChange < 0.008) return "stable"; // < 0.8% relative change → stable
  return secondAvg > firstAvg ? "rising" : "falling";
}

// Determines if a trend is improving (toward safe) or worsening (away from safe)
function trendImpact(threshold, value, trend) {
  if (!trend || trend === "stable" || trend === "insufficient" || value === null)
    return "neutral";
  const [sMin, sMax] = threshold.safe;
  if (value < sMin) return trend === "rising" ? "improving" : "worsening";
  if (value > sMax) return trend === "falling" ? "improving" : "worsening";
  // Inside safe range — flag if trending toward the boundary edge
  const midpoint = (sMin + sMax) / 2;
  if (trend === "rising" && value > midpoint) return "watch";
  if (trend === "falling" && value < midpoint) return "watch";
  return "neutral";
}

// Plain-language release recommendation based on status + trends
function generateRecommendation(sensors, trends, releaseStatus) {
  const enriched = sensors.map((s) => ({
    ...s,
    trend: trends[s.key],
    impact: trendImpact(s.threshold, s.value, trends[s.key]),
  }));
  const worsening = enriched.filter((s) => s.impact === "worsening");
  const improving = enriched.filter((s) => s.impact === "improving");

  if (releaseStatus === "go") {
    if (worsening.length === 0)
      return "All parameters are within safe thresholds and holding steady. Conditions are currently optimal — pawikan release is recommended.";
    return `Safe conditions confirmed, but ${worsening.map((s) => s.name).join(", ")} ${worsening.length === 1 ? "is" : "are"} drifting toward caution levels. Consider initiating release soon before conditions shift.`;
  }
  if (releaseStatus === "go_caution") {
    if (improving.length > 0)
      return `One parameter is in caution range, but ${improving.map((s) => s.name).join(", ")} ${improving.length === 1 ? "is" : "are"} trending back toward safe levels. A brief wait may improve conditions before release.`;
    return "Release is permissible but proceed with caution. One parameter is near its caution boundary — ensure a ranger is on-site for monitoring during and after release.";
  }
  if (releaseStatus === "nogo_caution") {
    if (improving.length >= 2)
      return "Multiple parameters are outside safe thresholds but trending toward improvement. Hold release and reassess after the next 2–3 readings.";
    return "Two or more parameters are in suboptimal ranges. Postpone release and continue monitoring. Notify the senior ranger if conditions do not improve within the hour.";
  }
  if (releaseStatus === "danger")
    return "Critical sensor values detected. Release is strictly prohibited. Ensure the holding facility remains stable and immediately alert senior staff.";
  return "Awaiting sufficient sensor data to generate a release recommendation. Ensure the Arduino is transmitting readings to Firebase.";
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

// Trend display metadata
const TREND_META = {
  rising: { icon: TrendingUp, label: "Rising", color: "text-blue-500" },
  falling: { icon: TrendingDown, label: "Falling", color: "text-indigo-400" },
  stable: { icon: Minus, label: "Stable", color: "text-muted-foreground" },
  insufficient: {
    icon: Minus,
    label: "Not enough data",
    color: "text-muted-foreground",
  },
};

const IMPACT_META = {
  improving: { label: "Improving ↗", color: "text-safe" },
  worsening: { label: "Worsening ↘", color: "text-danger" },
  watch: { label: "Watch", color: "text-caution" },
  neutral: { label: "Holding steady", color: "text-muted-foreground" },
};

// Per-sensor alert contribution label (individual sensor → release implication)
function sensorAlertLabel(status) {
  if (status === "safe")
    return { text: "Supports GO", cls: "text-safe" };
  if (status === "caution")
    return { text: "Contributes to Caution", cls: "text-caution" };
  if (status === "danger")
    return { text: "Triggers NO-GO", cls: "text-danger" };
  return { text: "No Data", cls: "text-muted-foreground" };
}

export default function Dashboard() {
  const [latestReading, setLatestReading] = useState(null);
  const [trendHistory, setTrendHistory] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showDecisionPanel, setShowDecisionPanel] = useState(true);
  const [expandedSensor, setExpandedSensor] = useState(null);

  useEffect(() => {
    const latestRef = ref(db, DB_PATHS.LATEST);
    // Query only the last 50 readings for session trend analysis & sparklines
    const historyQuery = query(ref(db, DB_PATHS.READINGS), limitToLast(50));

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
      historyQuery,
      (snap) => {
        const data = snap.val();
        if (data) {
          const entries = Object.values(data)
            .map(mapArduinoReading)
            .filter(Boolean)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
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
      off(historyQuery);
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
    if (dangerCount >= 1) releaseStatus = "danger";
    else if (cautionCount >= 2) releaseStatus = "nogo_caution";
    else if (cautionCount === 1) releaseStatus = "go_caution";
    else releaseStatus = "go";
  }

  // Compute trends using the full session history (not capped at 20)
  const trends = useMemo(() => {
    const result = {};
    SENSOR_CONFIG.forEach((cfg) => {
      result[cfg.key] = computeTrend(trendHistory, cfg.key);
    });
    return result;
  }, [trendHistory]);

  const recommendation = useMemo(
    () => generateRecommendation(sensors, trends, releaseStatus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(sensors.map((s) => ({ k: s.key, v: s.value, st: s.status }))), trends, releaseStatus],
  );

  // % of readings where ALL sensors are in safe range this session
  const allSafePercent = useMemo(() => {
    if (trendHistory.length === 0) return null;
    const allSafeCount = trendHistory.filter((r) =>
      SENSOR_CONFIG.every((cfg) => {
        const v = r[cfg.key];
        return (
          v === null ||
          (v >= cfg.threshold.safe[0] && v <= cfg.threshold.safe[1])
        );
      }),
    ).length;
    return Math.round((allSafeCount / trendHistory.length) * 100);
  }, [trendHistory]);

  const stableCount = SENSOR_CONFIG.filter(
    (cfg) => trends[cfg.key] === "stable",
  ).length;

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
      <div className="space-y-5">
        {/* Fixed Dashboard Header & Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-header font-bold text-[#1a1714] tracking-tight">
              Live Sea Monitoring Dashboard
            </h2>
            <p className="text-xs text-[#7c7366] font-medium">
              Real-time water quality telemetry & turtle release assessment
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowDecisionPanel(!showDecisionPanel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-xs font-semibold text-[#1a1714] hover:bg-[#f5f0eb] transition-colors shadow-2xs"
            >
              <Target className="w-3.5 h-3.5 text-[#1e3a8a]" />
              {showDecisionPanel ? "Hide Decision Support" : "Decision Support"}
            </button>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-xs font-semibold text-[#1a1714] hover:bg-[#f5f0eb] transition-colors shadow-2xs"
            >
              <TestTube className="w-3.5 h-3.5 text-[#1e3a8a]" />
              {showGuide ? "Hide Assessment Guide" : "Assessment Guide"}
            </button>
          </div>
        </div>

        {connectionState === "connecting" && (
          <div className="flex items-center gap-3 bg-secondary/40 border border-secondary rounded-xl px-5 py-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Connecting to Firebase Realtime Database…
          </div>
        )}
        {connectionState === "error" && (
          <div className="flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {errorMessage || "Unable to connect to Firebase."}
          </div>
        )}

        {/* Top Summary Row (Alert Banner + Quick Metric Panels) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Banner (GO / NO-GO) - 2 cols on md+ */}
          <div className="md:col-span-2">
            {latestReading && banner ? (
              <div
                className={`h-full flex items-center rounded-xl p-5 border bg-[#fffaf2] border-[#ddd4c4] shadow-sm transition-all ${banner.bgClass}`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-[#1e3a8a]/10 shrink-0 mt-0.5">
                    <banner.icon
                      className={`w-6 h-6 ${banner.textClass}`}
                    />
                  </div>
                  <div>
                    <h2
                      className={`text-base font-header font-bold tracking-tight mb-1 ${banner.textClass}`}
                    >
                      {banner.title}
                    </h2>
                    <p
                      className="text-xs font-medium text-[#7c7366] leading-relaxed"
                    >
                      {banner.desc}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center rounded-xl p-5 border border-[#ddd4c4] bg-[#fffaf2] shadow-sm">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-[#a8a29e] animate-spin shrink-0" />
                  <div>
                    <h2 className="text-sm font-header font-bold text-[#1a1714] mb-0.5">
                      Awaiting Live Telemetry Stream
                    </h2>
                    <p className="text-xs text-[#7c7366]">
                      The release assessment will populate automatically once the sensor buoy transmits.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Metric Summary Card */}
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-4 flex justify-around items-center h-full min-h-[90px]">
            <div className="text-center px-2">
              <p className="text-[10px] text-[#7c7366] font-bold uppercase tracking-[1.2px] mb-1">
                Caution Level
              </p>
              <p className="text-2xl font-header font-extrabold text-[#b45309] leading-none">
                {cautionCount}
              </p>
            </div>
            <div className="w-[1px] h-10 bg-[#ddd4c4]" />
            <div className="text-center px-2">
              <p className="text-[10px] text-[#7c7366] font-bold uppercase tracking-[1.2px] mb-1">
                Danger Level
              </p>
              <p className="text-2xl font-header font-extrabold text-[#9a3412] leading-none">
                {dangerCount}
              </p>
            </div>
          </div>
        </div>

        {/* Live Sensor Data (Primary Focus) */}
        <div>
          <div className="mb-3">
            <h3 className="text-base font-header font-bold text-[#1a1714]">
              Live Sensor Data
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            {sensors.map((sensor) => {
              const Icon = sensor.icon;
              const sparkData = trendHistory.slice(-20).map((e) => ({
                time: e.time,
                value: e[sensor.key],
              }));
              const alert = sensorAlertLabel(sensor.status);
              const isExpanded = expandedSensor === sensor.key;

              // Compute hardware probe health
              const isDisconnected = connectionState !== "live";
              const isFaulty =
                !isDisconnected &&
                (sensor.value === null ||
                  sensor.value === undefined ||
                  sensor.value === -999);
              const probeHealthState = isDisconnected
                ? "DISCONNECTED"
                : isFaulty
                  ? "FAULTY"
                  : "WORKING";

              return (
                <div
                  key={sensor.key}
                  className="bg-[#fffaf2] rounded-xl p-4 border border-[#ddd4c4] shadow-sm hover:border-[#1e3a8a]/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-4 h-4 text-[#1e3a8a]" />
                        <p className="text-xs text-[#7c7366] font-semibold">
                          {sensor.name}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          sensor.status === "safe"
                            ? "bg-[#15803d]/10 text-[#15803d]"
                            : sensor.status === "caution"
                              ? "bg-[#b45309]/10 text-[#b45309]"
                              : sensor.status === "danger"
                                ? "bg-[#9a3412]/10 text-[#9a3412]"
                                : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {sensor.status === "unknown"
                          ? "NO DATA"
                          : sensor.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Hardware Probe Health Badge */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
                      <div className="flex items-center gap-1">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            probeHealthState === "WORKING"
                              ? "bg-[#15803d]"
                              : probeHealthState === "FAULTY"
                                ? "bg-[#b45309]"
                                : "bg-[#9a3412]"
                          }`}
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#7c7366]">
                          {probeHealthState}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setExpandedSensor(isExpanded ? null : sensor.key)
                        }
                        className="text-[#a8a29e] hover:text-[#1e3a8a] transition-colors"
                        title="View Habitat Target"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Expandable description */}
                    {isExpanded && (
                      <div className="text-[10px] mb-3 leading-relaxed border-l-2 border-[#1e3a8a] pl-2 py-1 bg-[#f5f0eb] rounded-r-lg">
                        <p className="text-[#1a1714] font-medium mb-1">
                          Target: {sensor.threshold.safe[0]}–{sensor.threshold.safe[1]} {sensor.unit}
                        </p>
                        <p className="text-[#7c7366]">
                          {sensor.description}
                        </p>
                      </div>
                    )}

                    {/* Big KPI Value */}
                    <div className="my-2 flex items-baseline justify-between">
                      <p className="text-2xl font-mono font-bold tracking-tight text-[#1a1714] tabular-nums">
                        {isFaulty ? "FAULT" : isDisconnected ? "OFFLINE" : truncTo2(sensor.value)}
                      </p>
                      <span className={`text-[10px] font-bold ${alert.cls}`}>
                        {alert.text}
                      </span>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="h-10 mt-2 -mx-1">
                    {sparkData.some((d) => d.value !== null) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkData}>
                          <XAxis dataKey="time" hide />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1a1714",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              fontSize: "11px",
                            }}
                            itemStyle={{ color: "#ffffff" }}
                            labelStyle={{ color: "#a8a29e", fontSize: "10px" }}
                            formatter={(v) => [
                              v != null ? `${truncTo2(v)} ${sensor.unit}` : "—",
                              sensor.name,
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#1e3a8a"
                            dot={false}
                            strokeWidth={1.8}
                            isAnimationActive={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-[10px] text-[#a8a29e]">
                          No telemetry history
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible How the GO/NO-GO assessment works (Bottom Secondary) */}
        {showGuide && (
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-[#1e3a8a]/10 text-[#1e3a8a]">
                <TestTube className="w-5 h-5" />
              </span>
              <h3 className="text-base font-header font-bold text-[#1a1714]">
                How the GO/NO-GO Assessment Works
              </h3>
            </div>

            <p className="text-xs text-[#7c7366] mb-4 leading-relaxed font-medium">
              Environmental thresholds are calibrated to align with the combined
              physiological tolerances of the five local sea turtle species
              nesting in Labac, Naic, Cavite (Green Sea, Leatherback,
              Loggerhead, Hawksbill, and Olive Ridley). This ensures safe
              releases under unified local water quality guidelines.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Logic Rules */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-[#1a1714] uppercase tracking-wider mb-2">
                  Decision Logic
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#15803d]/10 border border-[#15803d]/20">
                    <CheckCircle2 className="w-4 h-4 text-[#15803d] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[#15803d]">
                        GO: SAFE TO RELEASE
                      </p>
                      <p className="text-xs text-[#7c7366] mt-0.5">
                        All 5 environmental parameters are within their{" "}
                        <strong>Safe Ranges</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#b45309]/10 border border-[#b45309]/20">
                    <CheckCircle2 className="w-4 h-4 text-[#b45309] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[#b45309]">
                        GO WITH CAUTION: SAFE TO RELEASE
                      </p>
                      <p className="text-xs text-[#7c7366] mt-0.5">
                        Exactly <strong>1 parameter</strong> is within its
                        Caution Range, and the other 4 are Safe.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#9a3412]/10 border border-[#9a3412]/20">
                    <AlertTriangle className="w-4 h-4 text-[#9a3412] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[#9a3412]">
                        NO-GO: DO NOT RELEASE (CAUTION)
                      </p>
                      <p className="text-xs text-[#7c7366] mt-0.5">
                        <strong>2 or more parameters</strong> are within their
                        Caution Ranges (suboptimal release conditions).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#9a3412]/15 border border-[#9a3412]/30">
                    <AlertTriangle className="w-4 h-4 text-[#9a3412] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[#9a3412]">
                        NO-GO: DO NOT RELEASE (DANGER)
                      </p>
                      <p className="text-xs text-[#7c7366] mt-0.5">
                        <strong>1 or more parameters</strong> are within their
                        critical <strong>Danger Ranges</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Threshold Ranges Table */}
              <div>
                <h4 className="text-xs font-bold text-[#1a1714] uppercase tracking-wider mb-2">
                  Threshold Values
                </h4>
                <div className="border border-[#ddd4c4] rounded-lg overflow-hidden bg-[#fffaf2]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#f5f0eb] border-b border-[#ddd4c4]">
                        <th className="p-2 font-bold text-[#1a1714]">
                          Parameter
                        </th>
                        <th className="p-2 font-bold text-[#15803d]">Safe (GO)</th>
                        <th className="p-2 font-bold text-[#b45309]">Caution</th>
                        <th className="p-2 font-bold text-[#9a3412]">Danger</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#ddd4c4]">
                        <td className="p-2 font-medium text-[#1a1714]">
                          Air Temp
                        </td>
                        <td className="p-2 text-[#15803d]">25.00 – 32.00 °C</td>
                        <td className="p-2 text-[#b45309]">
                          22.00 – 24.99 / 32.01 – 35.00
                        </td>
                        <td className="p-2 text-[#9a3412]">
                          &lt; 22.00 / &gt; 35.00
                        </td>
                      </tr>
                      <tr className="border-b border-[#ddd4c4]">
                        <td className="p-2 font-medium text-[#1a1714]">
                          Water Temp
                        </td>
                        <td className="p-2 text-[#15803d]">26.00 – 31.00 °C</td>
                        <td className="p-2 text-[#b45309]">
                          24.00 – 25.99 / 31.01 – 33.00
                        </td>
                        <td className="p-2 text-[#9a3412]">
                          &lt; 24.00 / &gt; 33.00
                        </td>
                      </tr>
                      <tr className="border-b border-[#ddd4c4]">
                        <td className="p-2 font-medium text-[#1a1714]">
                          Humidity
                        </td>
                        <td className="p-2 text-[#15803d]">65.00 – 85.00 %</td>
                        <td className="p-2 text-[#b45309]">
                          55.00 – 64.99 / 85.01 – 90.00
                        </td>
                        <td className="p-2 text-[#9a3412]">
                          &lt; 55.00 / &gt; 90.00
                        </td>
                      </tr>
                      <tr className="border-b border-[#ddd4c4]">
                        <td className="p-2 font-medium text-[#1a1714]">
                          pH Level
                        </td>
                        <td className="p-2 text-[#15803d]">7.80 – 8.30</td>
                        <td className="p-2 text-[#b45309]">
                          7.50 – 7.79 / 8.31 – 8.50
                        </td>
                        <td className="p-2 text-[#9a3412]">
                          &lt; 7.50 / &gt; 8.50
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-[#1a1714]">
                          Turbidity
                        </td>
                        <td className="p-2 text-[#15803d]">0.00 – 25.00 NTU</td>
                        <td className="p-2 text-[#b45309]">25.01 – 50.00 NTU</td>
                        <td className="p-2 text-[#9a3412]">&gt; 50.00 NTU</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#7c7366]">
                  <span className="font-bold">Supported local species:</span>
                  <span>
                    Green Sea Turtle · Leatherback · Loggerhead · Hawksbill ·
                    Olive Ridley
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Decision Support & Future Outlook Panel */}
        {showDecisionPanel && (
          <div className="mb-6 bg-white rounded-xl border border-secondary shadow-sm p-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 mb-5">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Target className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-lg font-header font-bold text-foreground">
                  Decision Support &amp; Future Outlook
                </h3>
                <p className="text-xs text-muted-foreground">
                  Based on {trendHistory.length} reading
                  {trendHistory.length !== 1 ? "s" : ""} from the current
                  session
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── Left: Parameter Trends ─────────────────────────────── */}
              <div>
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
                  Parameter Trends
                </h4>
                <div className="space-y-2">
                  {sensors.map((sensor) => {
                    const trend = trends[sensor.key];
                    const trendMeta =
                      TREND_META[trend] || TREND_META.insufficient;
                    const TrendIcon = trendMeta.icon;
                    const impact = trendImpact(
                      sensor.threshold,
                      sensor.value,
                      trend,
                    );
                    const impactMeta =
                      IMPACT_META[impact] || IMPACT_META.neutral;
                    return (
                      <div
                        key={sensor.key}
                        className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-secondary/40"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground">
                            {sensor.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Current:{" "}
                            <span className="font-mono">
                              {truncTo2(sensor.value)} {sensor.unit}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <div
                            className={`flex items-center gap-1 ${trendMeta.color}`}
                          >
                            <TrendIcon className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">
                              {trendMeta.label}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-semibold ${impactMeta.color}`}
                          >
                            {impactMeta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {trendHistory.length < 4 && (
                  <p className="text-[10px] text-muted-foreground mt-2 italic">
                    At least 4 readings are needed to compute trend
                    directions. Currently have {trendHistory.length}.
                  </p>
                )}
              </div>

              {/* ── Right: Recommendation + Session Stats ──────────────── */}
              <div className="flex flex-col gap-4">
                {/* Release Recommendation */}
                <div>
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
                    Release Recommendation
                  </h4>
                  <div
                    className={`rounded-xl p-4 border-2 ${
                      releaseStatus === "go"
                        ? "bg-safe/5 border-safe/20"
                        : releaseStatus === "go_caution"
                          ? "bg-caution/5 border-caution/20"
                          : releaseStatus === "nogo_caution"
                            ? "bg-orange-500/5 border-orange-500/20"
                            : releaseStatus === "danger"
                              ? "bg-danger/5 border-danger/20"
                              : "bg-secondary/20 border-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {releaseStatus === "go" ||
                      releaseStatus === "go_caution" ? (
                        <CheckCircle2
                          className={`w-5 h-5 shrink-0 ${releaseStatus === "go" ? "text-safe" : "text-caution"}`}
                        />
                      ) : (
                        <AlertTriangle
                          className={`w-5 h-5 shrink-0 ${releaseStatus === "danger" ? "text-danger" : "text-orange-600"}`}
                        />
                      )}
                      <p
                        className={`text-sm font-bold ${
                          releaseStatus === "go"
                            ? "text-safe"
                            : releaseStatus === "go_caution"
                              ? "text-caution"
                              : releaseStatus === "nogo_caution"
                                ? "text-orange-600"
                                : releaseStatus === "danger"
                                  ? "text-danger"
                                  : "text-muted-foreground"
                        }`}
                      >
                        {releaseStatus === "go"
                          ? "Release Now"
                          : releaseStatus === "go_caution"
                            ? "Release with Monitoring"
                            : releaseStatus === "nogo_caution"
                              ? "Hold — Monitor Closely"
                              : releaseStatus === "danger"
                                ? "Do Not Release"
                                : "Awaiting Data"}
                      </p>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">
                      {recommendation}
                    </p>
                  </div>
                </div>

                {/* Session Stats */}
                <div className="p-4 rounded-xl bg-secondary/20 border border-secondary/40">
                  <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-3">
                    Session Summary
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p
                        className={`text-xl font-header font-bold leading-none ${
                          allSafePercent === null
                            ? "text-muted-foreground"
                            : allSafePercent >= 80
                              ? "text-safe"
                              : allSafePercent >= 50
                                ? "text-caution"
                                : "text-danger"
                        }`}
                      >
                        {allSafePercent !== null ? `${allSafePercent}%` : "--"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        All-Safe Readings
                      </p>
                    </div>
                    <div>
                      <p className="text-xl font-header font-bold text-primary leading-none">
                        {trendHistory.length}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        Total Readings
                      </p>
                    </div>
                    <div>
                      <p className="text-xl font-header font-bold text-foreground leading-none">
                        {stableCount}/5
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        Stable Params
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
