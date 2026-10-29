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
  PauseCircle,
  Clock,
  Cpu,
  BookOpen,
  XCircle,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import {
  db,
  ref,
  query,
  limitToLast,
  onValue,
  mapArduinoReading,
  DB_PATHS,
} from "@/lib/firebase";
import { useBuoy } from "@/lib/useBuoy";
import {
  SENSORS,
  RELEASE_META,
  WATER_KEYS,
  evaluateReading,
  releaseStatus as computeReleaseStatus,
  analyzeTrend,
  recentConsistency,
  formatAge,
  truncTo2,
} from "@/lib/sensors";

const ICONS = {
  air_temperature: Wind,
  temperature: Thermometer,
  humidity: Droplets,
  ph: TestTube,
  turbidity: Eye,
};

// Trend window: readings within this span before the newest one
const TREND_WINDOW_MS = 60 * 60 * 1000;
// Water temperature swing within the window that warrants a thermal-shock warning
const RAPID_TEMP_DELTA = 1.0;

// Theme colours used across the page (cream / navy palette)
const TONE = {
  safe: { text: "text-[#15803d]", bg: "bg-[#15803d]/10", border: "border-[#15803d]/30", solid: "bg-[#15803d]" },
  caution: { text: "text-[#b45309]", bg: "bg-[#b45309]/10", border: "border-[#b45309]/30", solid: "bg-[#b45309]" },
  warn: { text: "text-[#c2410c]", bg: "bg-[#c2410c]/10", border: "border-[#c2410c]/30", solid: "bg-[#c2410c]" },
  danger: { text: "text-[#9a3412]", bg: "bg-[#9a3412]/10", border: "border-[#9a3412]/40", solid: "bg-[#9a3412]" },
  fault: { text: "text-[#57534e]", bg: "bg-[#57534e]/10", border: "border-[#57534e]/30", solid: "bg-[#57534e]" },
  muted: { text: "text-[#7c7366]", bg: "bg-secondary/40", border: "border-[#ddd4c4]", solid: "bg-[#a8a29e]" },
};

const SENSOR_STATUS_TONE = {
  safe: "safe",
  caution: "caution",
  danger: "danger",
  fault: "fault",
  unknown: "muted",
  offline: "muted",
};

const TREND_META = {
  rising: { icon: TrendingUp, label: "Rising" },
  falling: { icon: TrendingDown, label: "Falling" },
  stable: { icon: Minus, label: "Stable" },
  insufficient: { icon: Minus, label: "Not enough data" },
};

const IMPACT_META = {
  improving: { label: "Improving", cls: "text-[#15803d]" },
  worsening: { label: "Worsening", cls: "text-[#9a3412]" },
  watch: { label: "Approaching limit", cls: "text-[#b45309]" },
  neutral: { label: "Holding steady", cls: "text-[#7c7366]" },
};

function describeValue(cfg, value, status) {
  const [sMin, sMax] = cfg.threshold.safe;
  const [cMin, cMax] = cfg.threshold.caution;
  if (status === "safe") return `within safe ${sMin}–${sMax} ${cfg.unit}`;
  if (status === "caution")
    return value > sMax ? `above safe max ${sMax} ${cfg.unit}` : `below safe min ${sMin} ${cfg.unit}`;
  if (status === "danger")
    return value > cMax ? `above danger limit ${cMax} ${cfg.unit}` : `below danger limit ${cMin} ${cfg.unit}`;
  return "";
}

function formatEta(min) {
  if (min === null || min === undefined) return null;
  if (min < 60) return `~${Math.max(1, min)} min`;
  return `~${(min / 60).toFixed(1)} h`;
}

// Builds the plain-language recommendation + action list
function buildRecommendation({ status, factors, trends, consistency, rapidTemp, ageLabel }) {
  const names = (list) => list.map((f) => f.cfg.name).join(", ");
  const worsening = factors.filter((f) => trends[f.cfg.key]?.impact === "worsening");
  const improving = factors.filter((f) => trends[f.cfg.key]?.impact === "improving");
  const approaching = factors.filter((f) => trends[f.cfg.key]?.impact === "watch");
  const faulty = factors.filter((f) => f.status === "fault");
  const actions = [];
  let headline;
  let summary;

  switch (status) {
    case "offline":
      headline = "No Decision — Station Offline";
      summary = `The monitoring station has not transmitted for ${ageLabel}. A release decision cannot be made from old data.`;
      actions.push("Check the monitoring station's power supply and network connection.");
      actions.push("Do not release based on the last known values shown below.");
      break;
    case "fault":
      headline = "Hold — Verify Sensors";
      summary = `${names(faulty)} ${faulty.length === 1 ? "is" : "are"} returning invalid readings, so water safety cannot be confirmed.`;
      actions.push(`Inspect / clean the ${names(faulty)} probe${faulty.length === 1 ? "" : "s"}.`);
      actions.push("Take a manual reading (handheld meter) before any release.");
      break;
    case "danger":
      headline = "Do Not Release";
      summary = "At least one water parameter is in its critical danger range.";
      actions.push("Keep turtles in the holding facility.");
      actions.push("Alert the senior ranger / admin immediately.");
      break;
    case "nogo_caution":
      headline = "Hold — Monitor Closely";
      summary =
        improving.length >= 1
          ? `Two or more water parameters are outside safe ranges, but ${names(improving)} ${improving.length === 1 ? "is" : "are"} improving.`
          : "Two or more water parameters are in caution ranges — conditions are suboptimal.";
      actions.push("Postpone release and reassess after the next 2–3 readings.");
      actions.push("Notify the senior ranger if conditions do not improve within the hour.");
      break;
    case "go_caution":
      headline = "Release with Monitoring";
      summary =
        improving.length > 0
          ? `One parameter is in caution range but ${names(improving)} ${improving.length === 1 ? "is" : "are"} trending back to safe — a short wait may improve conditions.`
          : "Release is permissible; one water parameter is in its caution range.";
      actions.push("Ensure a ranger is on-site during and after release.");
      break;
    case "go":
      headline = "Release Recommended";
      summary =
        worsening.length || approaching.length
          ? `All water parameters are safe, but ${names([...worsening, ...approaching])} ${worsening.length + approaching.length === 1 ? "is" : "are"} drifting toward a limit — release soon.`
          : "All water quality parameters are within safe thresholds and holding steady.";
      break;
    default:
      headline = "Awaiting Data";
      summary = "Waiting for the monitoring station to transmit water telemetry.";
  }

  if (RELEASE_META[status]?.allowed) {
    if (consistency.total >= 2 && consistency.allowed < consistency.total)
      actions.push(
        `Only ${consistency.allowed} of the last ${consistency.total} readings allowed release — conditions just changed; confirm with the next reading.`,
      );
    approaching.forEach((f) => {
      const eta = formatEta(trends[f.cfg.key].etaMinutes);
      if (eta) actions.push(`${f.cfg.name} may leave its safe range in ${eta} at the current rate.`);
    });
  }
  if (rapidTemp && status !== "offline")
    actions.push(
      `Water temperature changed by ${rapidTemp.toFixed(1)} °C within the last hour — avoid releasing into rapidly changing water (thermal shock risk).`,
    );

  return { headline, summary, actions };
}

// Horizontal threshold gauge: danger | caution | safe | caution | danger
function RangeGauge({ cfg, value, muted }) {
  const [sMin, sMax] = cfg.threshold.safe;
  const [cMin, cMax] = cfg.threshold.caution;
  const pad = (cMax - cMin) * 0.2;
  // Only draw a danger zone on sides where one exists (caution limit inside the physical range)
  const lo = cMin > cfg.plausible[0] ? cMin - pad : cMin;
  const hi = cMax < cfg.plausible[1] ? cMax + pad : cMax;
  const pct = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const has = value !== null && value !== undefined;
  return (
    <div className="mt-1" aria-hidden="true">
      <div className="relative h-1.5 rounded-full overflow-hidden bg-[#9a3412]/25">
        <div className="absolute inset-y-0 bg-[#b45309]/30" style={{ left: `${pct(cMin)}%`, width: `${pct(cMax) - pct(cMin)}%` }} />
        <div className="absolute inset-y-0 bg-[#15803d]/40" style={{ left: `${pct(sMin)}%`, width: `${pct(sMax) - pct(sMin)}%` }} />
      </div>
      {has && (
        <div className="relative h-0">
          <span
            className={`absolute -top-[9px] w-[3px] h-3 rounded-sm -translate-x-1/2 ring-2 ring-[#fffaf2] ${muted ? "bg-[#a8a29e]" : "bg-[#1a1714]"}`}
            style={{ left: `${pct(value)}%` }}
          />
        </div>
      )}
      <div className="flex justify-between text-[9px] text-[#a8a29e] font-mono mt-1">
        <span>{cMin}</span>
        <span className="text-[#15803d]">
          safe {sMin}–{sMax}
        </span>
        <span>{cMax}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const buoy = useBuoy();
  const [history, setHistory] = useState([]);
  const [showGuide, setShowGuide] = useState(false);
  const [showDecisionPanel, setShowDecisionPanel] = useState(true);
  const [expandedSensor, setExpandedSensor] = useState(null);

  useEffect(() => {
    // Last 50 readings for trend analysis & sparklines
    const historyQuery = query(ref(db, DB_PATHS.READINGS), limitToLast(50));
    const unsubscribe = onValue(
      historyQuery,
      (snap) => {
        const data = snap.val();
        if (!data) return setHistory([]);
        const entries = Object.values(data)
          .map(mapArduinoReading)
          .filter((e) => e && e.timestamp)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((e) => ({
            ...evaluateReading(e).clean, // faulty probe values → null
            time: new Date(e.timestamp).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
          }));
        setHistory(entries);
      },
      () => {},
    );
    return unsubscribe;
  }, []);

  const { reading, evaluation, connection } = buoy;
  const isLive = connection === "live";
  const ageLabel = buoy.lastPacketAt ? formatAge(buoy.ageMs) : "—";

  // ── Decision ────────────────────────────────────────────────────────────
  const lastKnownStatus = computeReleaseStatus(reading);
  const releaseStatus = isLive ? lastKnownStatus : reading ? "offline" : "unknown";
  const meta = RELEASE_META[releaseStatus];
  const tone = TONE[meta.tone];

  const sensors = SENSORS.map((cfg) => {
    const ev = evaluation?.sensors[cfg.key];
    return {
      cfg,
      raw: ev?.raw ?? null,
      value: ev?.value ?? null,
      status: ev?.status ?? "unknown",
      faultReason: ev?.faultReason ?? null,
    };
  });
  const waterFactors = sensors.filter((s) => s.cfg.type === "water");
  const envFactors = sensors.filter((s) => s.cfg.type === "environment");
  const counts = {
    caution: isLive ? waterFactors.filter((s) => s.status === "caution").length : null,
    danger: isLive ? waterFactors.filter((s) => s.status === "danger").length : null,
    fault: isLive ? waterFactors.filter((s) => s.status === "fault").length : null,
  };

  // Trend window anchored at the newest stored reading
  const trendWindow = useMemo(() => {
    if (!history.length) return [];
    const end = history[history.length - 1].timestamp;
    return history.filter((r) => r.timestamp >= end - TREND_WINDOW_MS);
  }, [history]);

  const trends = useMemo(() => {
    const out = {};
    SENSORS.forEach((cfg) => {
      const current = evaluation?.sensors[cfg.key]?.value ?? null;
      out[cfg.key] = analyzeTrend(trendWindow, cfg.key, current);
    });
    return out;
  }, [trendWindow, evaluation]);

  const consistency = useMemo(() => recentConsistency(history, 3), [history]);

  const rapidTemp = useMemo(() => {
    const temps = trendWindow.map((r) => r.temperature).filter((v) => v !== null);
    if (temps.length < 2) return null;
    const delta = Math.max(...temps) - Math.min(...temps);
    return delta >= RAPID_TEMP_DELTA ? delta : null;
  }, [trendWindow]);

  const rec = buildRecommendation({ status: releaseStatus, factors: waterFactors, trends, consistency, rapidTemp, ageLabel });

  // Monitoring station's own on-board verdict (string written by the Arduino)
  const onboard = reading?.status ?? null;
  const onboardAgrees = useMemo(() => {
    if (!onboard || !RELEASE_META[lastKnownStatus]) return null;
    const norm = (s) => String(s).toUpperCase().replace(/\s+/g, " ").trim();
    return norm(onboard) === norm(RELEASE_META[lastKnownStatus].label);
  }, [onboard, lastKnownStatus]);

  const allSafePercent = useMemo(() => {
    const valid = history.filter((r) => !["unknown", "fault"].includes(computeReleaseStatus(r)));
    if (!valid.length) return null;
    return Math.round((valid.filter((r) => computeReleaseStatus(r) === "go").length / valid.length) * 100);
  }, [history]);

  const stableCount = WATER_KEYS.filter((k) => trends[k]?.direction === "stable").length;

  const BannerIcon =
    releaseStatus === "go" || releaseStatus === "go_caution"
      ? CheckCircle2
      : releaseStatus === "offline"
        ? WifiOff
        : releaseStatus === "fault"
          ? PauseCircle
          : releaseStatus === "unknown"
            ? RefreshCw
            : XCircle;

  // ── Sensor card ─────────────────────────────────────────────────────────
  const renderSensorCard = (sensor) => {
    const { cfg } = sensor;
    const Icon = ICONS[cfg.key];
    const isExpanded = expandedSensor === cfg.key;
    const isFault = isLive && sensor.status === "fault";
    const displayStatus = !reading ? "unknown" : isLive ? sensor.status : "offline";
    const t = TONE[SENSOR_STATUS_TONE[displayStatus]];
    // Offline: show the last raw value we received (even if it was flagged)
    const lastRaw = typeof sensor.raw === "number" ? sensor.raw : null;
    const shownValue = isFault ? null : isLive ? sensor.value : lastRaw;
    const sparkData = history.slice(-20).map((e) => ({ time: e.time, value: e[cfg.key] }));
    const trend = trends[cfg.key];
    const TrendIcon = TREND_META[trend.direction].icon;

    return (
      <div
        key={cfg.key}
        className={`bg-[#fffaf2] rounded-xl p-4 border shadow-sm transition-all flex flex-col justify-between ${
          isLive && cfg.type === "water" && ["caution", "danger", "fault"].includes(sensor.status)
            ? t.border
            : "border-[#ddd4c4] hover:border-[#1e3a8a]/40"
        }`}
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Icon className="w-4 h-4 text-[#1e3a8a]" />
              <p className="text-xs text-[#7c7366] font-semibold">{cfg.name}</p>
              <button
                onClick={() => setExpandedSensor(isExpanded ? null : cfg.key)}
                className="text-[#a8a29e] hover:text-[#1e3a8a] transition-colors"
                title="Threshold ranges"
                aria-expanded={isExpanded}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${t.bg} ${t.text}`}>
              {displayStatus === "unknown" ? "NO DATA" : displayStatus.toUpperCase()}
            </span>
          </div>

          {isExpanded && (
            <div className="text-[10px] mb-3 leading-relaxed border-l-2 border-[#1e3a8a] pl-2 py-1 bg-[#f5f0eb] rounded-r-lg">
              <p className="text-[#1a1714] font-medium mb-1">
                Safe {cfg.threshold.safe[0]}–{cfg.threshold.safe[1]} {cfg.unit} · Caution {cfg.threshold.caution[0]}–
                {cfg.threshold.caution[1]} {cfg.unit}
              </p>
            </div>
          )}

          <div className="my-1 flex items-baseline justify-between gap-2">
            <p
              className={`text-2xl font-mono font-bold tracking-tight tabular-nums ${
                isLive ? "text-[#1a1714]" : "text-[#a8a29e]"
              }`}
            >
              {isFault ? "FAULT" : truncTo2(shownValue)}
              {!isFault && shownValue !== null && (
                <span className="text-xs font-semibold text-[#7c7366] ml-1">{cfg.unit}</span>
              )}
            </p>
            {isLive && !isFault && trend.direction !== "insufficient" && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#7c7366]">
                <TrendIcon className="w-3 h-3" />
                {TREND_META[trend.direction].label}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#7c7366] min-h-[14px]">
            {!reading
              ? "Waiting for first packet"
              : !isLive
                ? `Last known value · ${ageLabel}${sensor.status === "fault" ? " · was flagged faulty" : ""}`
                : isFault
                  ? `${sensor.faultReason}${typeof sensor.raw === "number" ? ` (raw ${sensor.raw})` : ""}`
                  : describeValue(cfg, sensor.value, sensor.status)}
          </p>

          {!isFault && <RangeGauge cfg={cfg} value={shownValue} muted={!isLive} />}
        </div>

        <div className="h-10 mt-3 -mx-1">
          {sparkData.some((d) => d.value !== null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <XAxis dataKey="time" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1714", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "11px" }}
                  itemStyle={{ color: "#ffffff" }}
                  labelStyle={{ color: "#a8a29e", fontSize: "10px" }}
                  formatter={(v) => [v != null ? `${truncTo2(v)} ${cfg.unit}` : "—", cfg.name]}
                />
                <Line type="monotone" dataKey="value" stroke={isLive ? "#1e3a8a" : "#a8a29e"} dot={false} strokeWidth={1.8} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-[10px] text-[#a8a29e]">No telemetry history</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header & actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-header font-bold text-[#1a1714] tracking-tight">Live Sea Monitoring Dashboard</h2>
            <p className="text-xs text-[#7c7366] font-medium">Real-time water quality telemetry &amp; pawikan release assessment</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowDecisionPanel(!showDecisionPanel)}
              aria-pressed={showDecisionPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-xs font-semibold text-[#1a1714] hover:bg-[#f5f0eb] transition-colors shadow-2xs"
            >
              <Target className="w-3.5 h-3.5 text-[#1e3a8a]" />
              {showDecisionPanel ? "Hide Decision Support" : "Decision Support"}
            </button>
            <button
              onClick={() => setShowGuide(!showGuide)}
              aria-pressed={showGuide}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ddd4c4] bg-[#fffaf2] text-xs font-semibold text-[#1a1714] hover:bg-[#f5f0eb] transition-colors shadow-2xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#1e3a8a]" />
              {showGuide ? "Hide Assessment Guide" : "Assessment Guide"}
            </button>
          </div>
        </div>

        {connection === "error" && (
          <div className="flex items-center gap-3 bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-xl px-5 py-3 text-sm text-[#9a3412]">
            <WifiOff className="w-4 h-4 shrink-0" />
            {buoy.linkError || "Unable to connect to Firebase."}
          </div>
        )}

        {/* ── Decision hero ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`lg:col-span-2 rounded-xl border-2 p-5 bg-[#fffaf2] shadow-sm ${tone.border}`} role="status" aria-live="polite">
            <div className="flex items-start gap-3.5">
              <div className={`p-2 rounded-lg shrink-0 ${tone.bg}`}>
                <BannerIcon className={`w-6 h-6 ${tone.text} ${releaseStatus === "unknown" ? "animate-spin" : ""}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-base sm:text-lg font-header font-extrabold tracking-tight ${tone.text}`}>{meta.long}</h2>
                <p className="text-xs font-medium text-[#7c7366] leading-relaxed mt-0.5">{rec.summary}</p>
                {releaseStatus === "offline" && RELEASE_META[lastKnownStatus] && lastKnownStatus !== "unknown" && (
                  <p className="text-[11px] text-[#a8a29e] mt-1">
                    Last known verdict ({ageLabel}): <span className="font-semibold">{RELEASE_META[lastKnownStatus].label}</span> — for reference only.
                  </p>
                )}
              </div>
            </div>

            {/* Why this decision — water factor checklist */}
            {reading && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {waterFactors.map((f) => {
                  const st = isLive ? f.status : "offline";
                  const ft = TONE[SENSOR_STATUS_TONE[st]];
                  return (
                    <div key={f.cfg.key} className={`rounded-lg border px-3 py-2 ${ft.border} ${ft.bg}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#1a1714]">{f.cfg.name}</span>
                        <span className={`text-[10px] font-extrabold ${ft.text}`}>{st.toUpperCase()}</span>
                      </div>
                      <p className="text-[10px] text-[#7c7366] font-mono mt-0.5">
                        {st === "fault"
                          ? "invalid reading"
                          : `${truncTo2(isLive ? f.value : typeof f.raw === "number" ? f.raw : null)} ${f.cfg.unit}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Link & counts */}
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-4 flex flex-col justify-between gap-3">
            <div className="grid grid-cols-3 text-center divide-x divide-[#ddd4c4]">
              {[
                { label: "Caution", value: counts.caution, cls: "text-[#b45309]" },
                { label: "Danger", value: counts.danger, cls: "text-[#9a3412]" },
                { label: "Faulty", value: counts.fault, cls: "text-[#57534e]" },
              ].map((c) => (
                <div key={c.label} className="px-1">
                  <p className="text-[10px] text-[#7c7366] font-bold uppercase tracking-[1.2px] mb-1">{c.label}</p>
                  <p className={`text-2xl font-header font-extrabold leading-none ${c.value === null ? "text-[#a8a29e]" : c.cls}`}>
                    {c.value === null ? "–" : c.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-[#ddd4c4] pt-3 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[#7c7366]">
                  <Clock className="w-3.5 h-3.5" /> Last packet
                </span>
                <span className={`font-bold ${isLive ? "text-[#15803d]" : "text-[#9a3412]"}`}>
                  {buoy.lastPacketAt ? ageLabel : "never"}
                </span>
              </div>
              {onboard && (
                <div className="flex items-center justify-between gap-2" title="Verdict computed by the Arduino at the monitoring station">
                  <span className="flex items-center gap-1.5 text-[#7c7366]">
                    <Cpu className="w-3.5 h-3.5" /> Station verdict
                  </span>
                  <span className="font-semibold text-[#1a1714] text-right">
                    {onboard}
                    {onboardAgrees === false && <span className="ml-1 text-[#b45309]">(differs)</span>}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Decision Support ─────────────────────────────────────────── */}
        {showDecisionPanel && (
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-5 sm:p-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 mb-5">
              <span className="p-1.5 rounded-lg bg-[#1e3a8a]/10 text-[#1e3a8a]">
                <Target className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-header font-bold text-[#1a1714]">Decision Support &amp; Outlook</h3>
                <p className="text-xs text-[#7c7366]">
                  Trends from {trendWindow.length} reading{trendWindow.length !== 1 ? "s" : ""} in the latest 60-minute window
                  {!isLive && history.length > 0 && " (station offline — historical)"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recommendation */}
              <div className="flex flex-col gap-4">
                <div className={`rounded-xl p-4 border-2 ${tone.border} ${tone.bg}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <BannerIcon className={`w-5 h-5 shrink-0 ${tone.text} ${releaseStatus === "unknown" ? "animate-spin" : ""}`} />
                    <p className={`text-sm font-bold ${tone.text}`}>{rec.headline}</p>
                  </div>
                  <p className="text-sm text-[#1a1714] leading-relaxed">{rec.summary}</p>
                  {rec.actions.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {rec.actions.map((a) => (
                        <li key={a} className="flex items-start gap-2 text-xs text-[#1a1714]">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${tone.solid}`} />
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[#f5f0eb] border border-[#ddd4c4]">
                  <p className="text-[10px] font-bold text-[#1a1714] uppercase tracking-wider mb-3">Recent Readings Summary</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p
                        className={`text-xl font-header font-bold leading-none ${
                          allSafePercent === null
                            ? "text-[#a8a29e]"
                            : allSafePercent >= 80
                              ? "text-[#15803d]"
                              : allSafePercent >= 50
                                ? "text-[#b45309]"
                                : "text-[#9a3412]"
                        }`}
                      >
                        {allSafePercent !== null ? `${allSafePercent}%` : "--"}
                      </p>
                      <p className="text-[10px] text-[#7c7366] mt-1 leading-tight">Fully-safe water readings</p>
                    </div>
                    <div>
                      <p className="text-xl font-header font-bold text-[#1e3a8a] leading-none">
                        {consistency.total ? `${consistency.allowed}/${consistency.total}` : "--"}
                      </p>
                      <p className="text-[10px] text-[#7c7366] mt-1 leading-tight">Last readings allowing release</p>
                    </div>
                    <div>
                      <p className="text-xl font-header font-bold text-[#1a1714] leading-none">
                        {stableCount}/{WATER_KEYS.length}
                      </p>
                      <p className="text-[10px] text-[#7c7366] mt-1 leading-tight">Stable water params</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trends */}
              <div>
                <h4 className="text-xs font-bold text-[#1a1714] uppercase tracking-wider mb-3">Water Parameter Trends</h4>
                <div className="space-y-2">
                  {waterFactors.map(({ cfg, value, status }) => {
                    const tr = trends[cfg.key];
                    const TrendIcon = TREND_META[tr.direction].icon;
                    const impact = IMPACT_META[tr.impact];
                    const eta = formatEta(tr.etaMinutes);
                    return (
                      <div key={cfg.key} className="flex items-center gap-3 p-3 rounded-lg bg-[#f5f0eb]/60 border border-[#ddd4c4]">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[#1a1714]">{cfg.name}</p>
                          <p className="text-[10px] text-[#7c7366]">
                            {status === "fault" ? (
                              "Probe fault — excluded"
                            ) : (
                              <>
                                Now <span className="font-mono">{truncTo2(value)} {cfg.unit}</span>
                                {tr.ratePerHour !== null && tr.direction !== "stable" && (
                                  <>
                                    {" · "}
                                    <span className="font-mono">
                                      {tr.ratePerHour > 0 ? "+" : ""}
                                      {tr.ratePerHour.toFixed(2)} {cfg.unit}/h
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                          </p>
                        </div>
                        {status === "fault" ? (
                          <span className="text-[10px] font-semibold text-[#57534e] shrink-0">No trend</span>
                        ) : (
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="flex items-center gap-1 text-xs font-medium text-[#1a1714]">
                            <TrendIcon className="w-3.5 h-3.5 text-[#1e3a8a]" />
                            {TREND_META[tr.direction].label}
                          </span>
                          <span className={`text-[10px] font-semibold ${impact.cls}`}>
                            {impact.label}
                            {eta && ` · ${eta}`}
                          </span>
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {trendWindow.length < 4 && (
                  <p className="text-[10px] text-[#7c7366] mt-2 italic">
                    At least 4 readings within an hour are needed to compute trends (currently {trendWindow.length}).
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Sensors ──────────────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-base font-header font-bold text-[#1a1714]">Water Quality Sensors</h3>
            <span className="text-[11px] text-[#7c7366]">Decide GO / NO-GO</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">{waterFactors.map(renderSensorCard)}</div>

          <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-base font-header font-bold text-[#1a1714]">Environmental Context</h3>
            <span className="text-[11px] text-[#7c7366]">Read-only · not used for the decision</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">{envFactors.map(renderSensorCard)}</div>
        </div>

        {/* ── Assessment guide ─────────────────────────────────────────── */}
        {showGuide && (
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-5 sm:p-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-[#1e3a8a]/10 text-[#1e3a8a]">
                <BookOpen className="w-5 h-5" />
              </span>
              <h3 className="text-base font-header font-bold text-[#1a1714]">How the GO/NO-GO Assessment Works</h3>
            </div>

            <p className="text-xs text-[#7c7366] mb-4 leading-relaxed font-medium">
              The threshold values below match the project paper. Only the three{" "}
              <strong>water</strong> sensors decide the outcome; air temperature and humidity are displayed for context.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-bold text-[#1a1714] uppercase tracking-wider mb-2">Decision Logic (checked in order)</h4>
                <ol className="space-y-2">
                  {[
                    { s: "offline", rule: "No packet from the monitoring station for over 60 seconds — no decision is made from old data." },
                    { s: "fault", rule: "A water probe sends no value, an impossible value (e.g. −127 °C, pH 14) or the monitoring station flags it — safety can't be confirmed." },
                    { s: "danger", rule: "1 or more water parameters in its Danger range, with all required probes working." },
                    { s: "nogo_caution", rule: "2 or more water parameters in their Caution ranges." },
                    { s: "go_caution", rule: "Exactly 1 water parameter in its Caution range; the others Safe." },
                    { s: "go", rule: "All 3 water parameters in their Safe ranges." },
                  ].map(({ s, rule }, i) => {
                    const m = RELEASE_META[s];
                    const t = TONE[m.tone];
                    return (
                      <li key={s} className={`flex items-start gap-3 p-3 rounded-lg border ${t.bg} ${t.border}`}>
                        <span className={`text-[10px] font-bold w-4 shrink-0 mt-0.5 ${t.text}`}>{i + 1}</span>
                        <div>
                          <p className={`text-xs font-bold ${t.text}`}>{m.long}</p>
                          <p className="text-xs text-[#7c7366] mt-0.5">{rule}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="text-[10px] text-[#7c7366] mt-3 leading-relaxed">
                  Advisory checks (do not change the verdict): trend projection to the next boundary, agreement of the last 3
                  readings, and a warning when water temperature swings ≥ {RAPID_TEMP_DELTA} °C within an hour (project-defined
                  thermal-shock precaution).
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-[#1a1714] uppercase tracking-wider mb-2">Threshold Values</h4>
                <div className="border border-[#ddd4c4] rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#f5f0eb] border-b border-[#ddd4c4]">
                        <th className="p-2 font-bold text-[#1a1714]">Parameter</th>
                        <th className="p-2 font-bold text-[#15803d]">Safe</th>
                        <th className="p-2 font-bold text-[#b45309]">Caution</th>
                        <th className="p-2 font-bold text-[#9a3412]">Danger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {["air_temperature", "temperature", "humidity", "ph", "turbidity"].map((key) => SENSORS.find((sensor) => sensor.key === key)).map((cfg) => {
                        const [sMin, sMax] = cfg.threshold.safe;
                        const [cMin, cMax] = cfg.threshold.caution;
                        const [pMin, pMax] = cfg.plausible;
                        // pH reads as 7.0, not 7
                        const n = (v) => v.toFixed(2);
                        const lowerCaution = sMin > cMin;
                        const upperCaution = cMax > sMax;
                        // caution limits at/beyond the physical range → no danger band on that side
                        const lowerDanger = cMin > pMin;
                        const upperDanger = cMax < pMax;
                        const caution = [
                          lowerCaution && (lowerDanger ? `${n(cMin)}–${n(sMin - 0.01)}` : `<${n(sMin)}`),
                          upperCaution && (upperDanger ? `${n(sMax + 0.01)}–${n(cMax)}` : `>${n(sMax)}`),
                        ].filter(Boolean);
                        const danger = [lowerDanger && `<${n(cMin)}`, upperDanger && `>${n(cMax)}`].filter(Boolean);
                        return (
                          <tr key={cfg.key} className="border-b border-[#ddd4c4] last:border-0">
                            <td className="p-2 font-medium text-[#1a1714] whitespace-nowrap">
                              {cfg.name}
                              {cfg.type === "environment" && <span className="block text-[9px] text-[#a8a29e]">context only</span>}
                            </td>
                            <td className="p-2 text-[#15803d] whitespace-nowrap">
                              {n(sMin)}–{n(sMax)} {cfg.unit}
                            </td>
                            <td className="p-2 text-[#b45309]">{caution.length ? caution.join(" / ") : "—"}</td>
                            <td className="p-2 text-[#9a3412] whitespace-nowrap">{danger.length ? danger.join(" / ") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-[10px] text-[#7c7366]">
                  <span className="font-bold">Local species:</span> Green Sea Turtle · Leatherback · Loggerhead · Hawksbill · Olive Ridley
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-[#f5f0eb] rounded-xl p-4 border border-[#ddd4c4] flex items-center gap-2 text-xs text-[#7c7366]">
          {connection === "live" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803d] shrink-0" />
          ) : connection === "connecting" ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-[#9a3412] shrink-0" />
          )}
          <span>
            {connection === "live"
              ? `Live · Firebase Realtime Database · Last packet ${new Date(buoy.lastPacketAt).toLocaleTimeString("en-PH")}`
              : connection === "connecting"
                ? "Connecting to Firebase Realtime Database…"
                : connection === "offline"
                  ? `Station offline · last packet ${new Date(buoy.lastPacketAt).toLocaleString("en-PH")} (${ageLabel})`
                  : connection === "empty"
                    ? "Connected — no sensor data found yet. Waiting for the Arduino to transmit."
                    : "Firebase connection unavailable."}
          </span>
        </div>
      </div>
    </Layout>
  );
}
