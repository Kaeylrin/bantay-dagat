import { useState, useEffect, useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
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
  ClipboardCheck,
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
// Project-defined change that prompts the ranger to verify the temperature.
const RAPID_TEMP_DELTA = 1.0;

// Shared visual states for sensor cards and labels.
const TONE = {
  safe: { text: "text-safe", bg: "bg-safe/10", border: "border-safe/30", solid: "bg-safe" },
  caution: { text: "text-caution", bg: "bg-caution/10", border: "border-caution/30", solid: "bg-caution" },
  warn: { text: "text-[#c2410c]", bg: "bg-[#c2410c]/10", border: "border-[#c2410c]/30", solid: "bg-[#c2410c]" },
  danger: { text: "text-danger", bg: "bg-danger/10", border: "border-danger/40", solid: "bg-danger" },
  fault: { text: "text-slate-600", bg: "bg-slate-600/10", border: "border-slate-600/30", solid: "bg-slate-600" },
  muted: { text: "text-muted-foreground", bg: "bg-secondary/40", border: "border-border", solid: "bg-muted-foreground" },
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
  improving: { label: "Improving", cls: "text-safe" },
  worsening: { label: "Worsening", cls: "text-danger" },
  watch: { label: "Approaching limit", cls: "text-caution" },
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

function SummaryLabel({ label, explanation }) {
  return (
    <div className="text-sm font-medium text-foreground flex items-center gap-1">
      <span>{label}</span>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Explain ${label.toLowerCase()}`}
            title={explanation}
            className="inline-flex shrink-0 items-center justify-center rounded-full p-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={6}
            collisionPadding={12}
            aria-label={label}
            className="z-[110] w-64 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-card p-3 text-left text-xs leading-relaxed text-foreground shadow-lg"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <p className="mb-1 font-semibold">{label}</p>
            <p>{explanation}</p>
            <Popover.Arrow className="fill-card" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function formatEta(min) {
  if (min === null || min === undefined) return null;
  if (min < 60) return `~${Math.max(1, min)} min`;
  return `~${(min / 60).toFixed(1)} h`;
}

function rangerAdvice(status, factors, trends, consistency, rapidTemp) {
  const names = (level) => factors.filter((f) => f.status === level).map((f) => f.cfg.name).join(", ");
  switch (status) {
    case "offline":
      return ["Current conditions unknown", "Check the station connection or measure the water on site."];
    case "unknown":
      return ["Waiting for water readings", "Check that the station is sending readings."];
    case "fault":
      return ["Check the water sensors", `Verify ${names("fault")} with a handheld meter before using this water check.`];
    case "danger":
      return ["Water check advises against release", `Tell the ranger in charge. Check ${names("danger")} on site.`];
    case "nogo_caution":
      return ["Several readings need attention", `Review ${names("caution")} with the ranger in charge.`];
  }
  const label = status === "go_caution" ? "One reading needs attention" : "All three water readings are in range";
  const watch = factors.filter((f) => ["watch", "worsening"].includes(trends[f.cfg.key]?.impact));
  if (watch.length) return [label, `Recheck ${watch.map((f) => f.cfg.name).join(", ")}. The trend points toward a warning or a worse reading.`];
  if (rapidTemp) return [label, `Water temperature varied by ${rapidTemp.toFixed(1)} °C in the last hour. Confirm it on site.`];
  if (consistency.allowed < consistency.total) return [label, "Some recent checks did not give a GO result. Confirm the water conditions on site."];
  if (status === "go_caution") return [label, `Check ${names("caution")} on site and follow the ranger release protocol.`];
  if (factors.some((f) => trends[f.cfg.key]?.direction === "insufficient"))
    return [label, "There are too few recent readings to tell whether all three are steady. Complete the on-site checks."];
  return [label, "Complete the on-site checks and follow the ranger release protocol."];
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
      <div className="relative h-1.5 rounded-full overflow-hidden bg-danger/25">
        <div className="absolute inset-y-0 bg-caution/30" style={{ left: `${pct(cMin)}%`, width: `${pct(cMax) - pct(cMin)}%` }} />
        <div className="absolute inset-y-0 bg-safe/40" style={{ left: `${pct(sMin)}%`, width: `${pct(sMax) - pct(sMin)}%` }} />
      </div>
      {has && (
        <div className="relative h-0">
          <span
            className={`absolute -top-[9px] w-[3px] h-3 rounded-sm -translate-x-1/2 ring-2 ring-card ${muted ? "bg-muted-foreground" : "bg-foreground"}`}
            style={{ left: `${pct(value)}%` }}
          />
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
        <span>{cMin}</span>
        <span className="text-safe">
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
  const [historyError, setHistoryError] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showDecisionPanel, setShowDecisionPanel] = useState(true);
  const [expandedSensor, setExpandedSensor] = useState(null);

  useEffect(() => {
    // Last 50 readings for trend analysis & sparklines
    const historyQuery = query(ref(db, DB_PATHS.READINGS), limitToLast(50));
    const unsubscribe = onValue(
      historyQuery,
      (snap) => {
        setHistoryError(false);
        const data = snap.val();
        if (!data) return setHistory([]);
        const entries = Object.values(data)
          .map(mapArduinoReading)
          .filter((e) => e?.timestamp > 0 && e.timestamp <= Date.now())
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((e) => ({
            ...evaluateReading(e).clean, // faulty probe values → null
            time: new Date(e.timestamp).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
          }));
        setHistory(entries);
      },
      () => { setHistoryError(true); setHistory([]); },
    );
    return unsubscribe;
  }, []);

  const { reading, evaluation, connection } = buoy;
  const isLive = connection === "live";
  const timestampValid = buoy.lastPacketAt && buoy.lastPacketAt <= buoy.now + 30_000;
  const ageLabel = timestampValid ? formatAge(buoy.ageMs) : "—";

  // ── Decision ────────────────────────────────────────────────────────────
  const lastKnownStatus = computeReleaseStatus(reading);
  const releaseStatus = isLive ? lastKnownStatus : ["offline", "error"].includes(connection) ? "offline" : "unknown";
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
  // Compare current readings only with history from the preceding hour.
  // While offline, show the hour ending at the last saved reading.
  const windowEnd = isLive ? buoy.now : history.at(-1)?.timestamp;
  const trendWindow = useMemo(() => history.filter((r) =>
    r.timestamp >= windowEnd - TREND_WINDOW_MS && r.timestamp <= windowEnd
  ), [history, windowEnd]);

  const trends = useMemo(() => {
    const out = {};
    SENSORS.forEach((cfg) => {
      const current = isLive ? evaluation?.sensors[cfg.key]?.value : trendWindow.at(-1)?.[cfg.key];
      out[cfg.key] = analyzeTrend(trendWindow, cfg.key, current);
    });
    return out;
  }, [trendWindow, evaluation, isLive]);

  const consistency = useMemo(() => recentConsistency(trendWindow, 3), [trendWindow]);

  const rapidTemp = useMemo(() => {
    const temps = trendWindow.map((r) => r.temperature).filter((v) => v !== null);
    if (temps.length < 2) return null;
    const delta = Math.max(...temps) - Math.min(...temps);
    return delta >= RAPID_TEMP_DELTA ? delta : null;
  }, [trendWindow]);

  const [headline, nextStep] = rangerAdvice(releaseStatus, waterFactors, trends, consistency, rapidTemp);
  const historicalStatuses = history.map(computeReleaseStatus).filter((s) => s !== "unknown" && s !== "fault");
  const inRange = historicalStatuses.filter((s) => s === "go").length;
  const knownTrends = WATER_KEYS.filter((k) => trends[k].direction !== "insufficient" && (!isLive || evaluation?.sensors[k]?.value != null));
  const stableCount = knownTrends.filter((k) => trends[k].direction === "stable").length;
  const savedAt = history.at(-1)?.timestamp;

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
        className={`bg-card rounded-xl p-4 border shadow-sm transition-all flex flex-col justify-between ${
          isLive && cfg.type === "water" && ["caution", "danger", "fault"].includes(sensor.status)
            ? t.border
            : "border-border hover:border-primary/40"
        }`}
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Icon className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground font-semibold">{cfg.name}</p>
              <button
                aria-label={`Show ranges for ${cfg.name}`}
                onClick={() => setExpandedSensor(isExpanded ? null : cfg.key)}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Threshold ranges"
                aria-expanded={isExpanded}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${t.bg} ${t.text}`}>
              {displayStatus === "unknown" ? "NO DATA" : displayStatus.toUpperCase()}
            </span>
          </div>

          {isExpanded && (
            <div className="text-xs mb-3 leading-relaxed border-l-2 border-primary pl-2 py-1 bg-muted rounded-r-lg">
              <p className="text-foreground font-medium mb-1">
                Safe {cfg.threshold.safe[0]}–{cfg.threshold.safe[1]} {cfg.unit} · Caution {cfg.threshold.caution[0]}–
                {cfg.threshold.caution[1]} {cfg.unit}
              </p>
            </div>
          )}

          <div className="my-1 flex items-baseline justify-between gap-2">
            <p
              className={`text-2xl font-mono font-bold tracking-tight tabular-nums ${
                isLive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {isFault ? "FAULT" : truncTo2(shownValue)}
              {!isFault && shownValue !== null && (
                <span className="text-xs font-semibold text-muted-foreground ml-1">{cfg.unit}</span>
              )}
            </p>
            {isLive && !isFault && trend.direction !== "insufficient" && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
                <TrendIcon className="w-3 h-3" />
                {TREND_META[trend.direction].label}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground min-h-[14px]">
            {!reading
              ? "Waiting for first reading"
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
                <Line type="monotone" dataKey="value" stroke={isLive ? "#1e3a8a" : "#a8a29e"} dot={false} strokeWidth={1.8} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-xs text-muted-foreground">No saved readings</p>
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
            <h2 className="text-xl font-header font-bold text-foreground tracking-tight">Ranger dashboard</h2>
            <p className="text-xs text-muted-foreground font-medium">Check the water before a pawikan release.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowDecisionPanel(!showDecisionPanel)}
              aria-pressed={showDecisionPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs"
            >
              <Target className="w-3.5 h-3.5 text-primary" />
              {showDecisionPanel ? "Hide history" : "Show history"}
            </button>
            <button
              onClick={() => setShowGuide(!showGuide)}
              aria-pressed={showGuide}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              {showGuide ? "Hide Assessment Guide" : "Assessment Guide"}
            </button>
          </div>
        </div>

        {/* ── Assessment guide ─────────────────────────────────────────── */}
        {showGuide && (
          <div className="bg-card rounded-xl border border-border shadow-sm p-5 sm:p-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <BookOpen className="w-5 h-5" />
              </span>
              <h3 className="text-base font-header font-bold text-foreground">How the GO/NO-GO Assessment Works</h3>
            </div>

            <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">
              The threshold values below match the project paper. Only the three{" "}
              <strong>water</strong> sensors determine the project result. Air temperature and humidity give additional context.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Decision Logic (checked in order)</h4>
                <ol className="space-y-2">
                  {[
                    { s: "offline", rule: "The connection is unavailable or the last reading is more than a minute old. Check conditions on site." },
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
                        <span className={`text-xs font-bold w-4 shrink-0 mt-0.5 ${t.text}`}>{i + 1}</span>
                        <div>
                          <p className={`text-xs font-bold ${t.text}`}>{m.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{rule}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Advisory checks (do not change the verdict): trend projection to the next boundary, agreement of the last 3
                  readings, and a warning when water temperature swings ≥ {RAPID_TEMP_DELTA} °C within an hour (project-defined
                  monitoring prompt).
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Threshold Values</h4>
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted border-b border-border">
                        <th className="p-2 font-bold text-foreground">Parameter</th>
                        <th className="p-2 font-bold text-safe">Safe</th>
                        <th className="p-2 font-bold text-caution">Caution</th>
                        <th className="p-2 font-bold text-danger">Danger</th>
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
                          <tr key={cfg.key} className="border-b border-border last:border-0">
                            <td className="p-2 font-medium text-foreground whitespace-nowrap">
                              {cfg.name}
                              {cfg.type === "environment" && <span className="block text-xs text-muted-foreground">context only</span>}
                            </td>
                            <td className="p-2 text-safe whitespace-nowrap">
                              {n(sMin)}–{n(sMax)} {cfg.unit}
                            </td>
                            <td className="p-2 text-caution">{caution.length ? caution.join(" / ") : "—"}</td>
                            <td className="p-2 text-danger whitespace-nowrap">{danger.length ? danger.join(" / ") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-bold">Local species:</span> Green Sea Turtle · Leatherback · Loggerhead · Hawksbill · Olive Ridley
                </p>
              </div>
            </div>
          </div>
        )}

        {connection === "error" && (
          <div className="flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
            <WifiOff className="w-4 h-4 shrink-0" />
            {buoy.linkError || "Unable to connect to Firebase."}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(16rem,1fr)]">
          <div role="status" aria-live="polite" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone.bg} ${tone.text}`}><BannerIcon /></span>
              <div>
                <p className="text-sm font-semibold">Current water check</p>
                <p className="text-xs text-muted-foreground">{timestampValid ? "Last station update · " + new Date(buoy.lastPacketAt).toLocaleString("en-PH", {dateStyle: "medium", timeStyle: "short"}) : "No station reading available"}</p>
              </div>
            </div>
            <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">{headline}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {isLive ? "Project result · " + meta.label : "A fresh reading is needed to assess the water now."}
            </p>
            {isLive && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {waterFactors.map(({ cfg, status }) => (
                  <li key={cfg.key} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${TONE[SENSOR_STATUS_TONE[status]].bg} ${TONE[SENSOR_STATUS_TONE[status]].text}`}>
                    {cfg.name} · {status === "fault" ? "faulty" : status}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/[.06] p-5 sm:p-7">
            <ClipboardCheck className="mb-3 h-6 w-6 text-primary" />
            <h3 className="text-base font-bold">What to do now</h3>
            <p className="mt-2 text-base leading-relaxed">{nextStep}</p>
          </div>
        </section>

        {showDecisionPanel && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
            <h3 className="text-xl font-bold">What earlier readings show</h3>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              {historyError ? "Saved readings could not be loaded." : savedAt ?
                "Latest saved reading · " + new Date(savedAt).toLocaleString("en-PH", {dateStyle: "medium", timeStyle: "short"}) : "No saved readings available."}
            </p>
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="divide-y rounded-xl border bg-muted/50 px-4">
                {[
                  { label: "All three in range", value: historicalStatuses.length ? Math.round(100 * inRange / historicalStatuses.length) + "%" : "No data",
                    explanation: `${inRange} of ${historicalStatuses.length} usable saved readings had temperature, pH and turbidity in range together. We check up to 50 and skip readings with a faulty water sensor.` },
                  { label: "Recent GO results", value: consistency.total ? consistency.allowed + " of " + consistency.total : "No data",
                    explanation: "We check up to three saved readings in the hour shown. This counts GO and GO with caution under the project rules." },
                  { label: "Steady measurements", value: knownTrends.length ? stableCount + " of " + knownTrends.length : "Too few readings",
                    explanation: "Each measurement needs four usable readings in the hour shown. The count includes only measurements we can assess. A steady value can still be outside its range." }
                ].map(({label, value, explanation}) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-4">
                    <SummaryLabel label={label} explanation={explanation} />
                    <strong className="text-right text-base tabular-nums">{value}</strong>
                  </div>
                ))}
              </div>
              {/* Trends */}
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Changes over one hour</h4>
                <div className="space-y-2">
                  {waterFactors.map(({ cfg, value: liveValue, status: liveStatus }) => {
                    const value = isLive ? liveValue : trendWindow.at(-1)?.[cfg.key];
                    const status = isLive ? liveStatus : value == null ? "unknown" : "saved";
                    const tr = trends[cfg.key];
                    const TrendIcon = TREND_META[tr.direction].icon;
                    const impact = tr.impact === "neutral" ? null : IMPACT_META[tr.impact];
                    const eta = formatEta(tr.etaMinutes);
                    return (
                      <div key={cfg.key} className="flex items-center gap-3 p-3 rounded-lg bg-muted/60 border border-border">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground">{cfg.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {status === "fault" ? (
                              "Probe fault — excluded"
                            ) : (
                              <>
                                {isLive ? "Now" : "Last saved value"} <span className="font-mono">{truncTo2(value)} {cfg.unit}</span>
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
                          <span className="text-xs font-semibold text-slate-600 shrink-0">No trend</span>
                        ) : (
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                            <TrendIcon className="w-3.5 h-3.5 text-primary" />
                            {TREND_META[tr.direction].label}
                          </span>
                          {impact && <span className={`text-xs font-semibold ${impact.cls}`}>
                            {impact.label}
                            {eta && ` · ${eta}`}
                          </span>}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {trendWindow.length < 4 && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    At least 4 readings within an hour are needed to compute trends (currently {trendWindow.length}).
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Sensors ──────────────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-base font-header font-bold text-foreground">Water measurements</h3>
            <span className="text-xs text-muted-foreground">Used in the current water check</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">{waterFactors.map(renderSensorCard)}</div>

          <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-base font-header font-bold text-foreground">Air and humidity</h3>
            <span className="text-xs text-muted-foreground">Shown for context</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">{envFactors.map(renderSensorCard)}</div>
        </div>

        <details className="rounded-xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Station details</summary>
          <div className="mt-3 space-y-2 text-muted-foreground">
            <p>{isLive ? ["caution", "danger", "fault"].map((level) =>
              waterFactors.filter((factor) => factor.status === level).length + " " + (level === "fault" ? "faulty" : level)
            ).join(" · ") : "Current sensor counts are unavailable."}</p>
            {reading?.status && <p>Station’s saved result · {reading.status} ({ageLabel}). The dashboard also checks for faulty water sensors.</p>}
          </div>
        </details>



      </div>
    </Layout>
  );
}
