// Single source of truth for sensor thresholds, probe-fault detection and the
// GO / NO-GO release decision. Pure functions only (no Firebase) so the logic
// can be unit-tested and shared by every page.

// A monitoring station packet older than this is treated as "offline": no release decision.
export const STALE_AFTER_MS = 60_000;

// threshold.safe     → inside = "safe"
// threshold.caution  → inside caution but outside safe = "caution"; outside = "danger"
//                      (a caution range equal to the plausible range = no danger band)
// plausible          → values outside this range are physically impossible for
//                      the probe/site and are treated as a SENSOR FAULT, not as
//                      a water condition (e.g. DS18B20 returns -127 °C when
//                      disconnected; a pH probe reading 0 or >14 is broken).
// alertCodes         → tokens the Arduino puts in `sensorAlert`, e.g. "DHT WTMP pH TURB ERR"
//                      or "NONE" (DHT11 = air temp + humidity; DS18B20 = WTMP).
//
// Project threshold bands supplied in the approved paper.
export const SENSORS = [
  {
    key: "temperature",
    name: "Water Temp",
    unit: "°C",
    type: "water",
    threshold: { safe: [26, 31], caution: [24, 33] },
    plausible: [5, 45],
    alertCodes: ["WTMP"],
  },
  {
    key: "ph",
    name: "pH Level",
    unit: "pH",
    type: "water",
    threshold: { safe: [7.8, 8.3], caution: [7.5, 8.5] },
    plausible: [4, 10],
    alertCodes: ["PH"],
  },
  {
    key: "turbidity",
    name: "Turbidity",
    unit: "NTU",
    type: "water",
    threshold: { safe: [0, 25], caution: [0, 50] },
    plausible: [0, 3000],
    alertCodes: ["TURB"],
  },
  {
    key: "air_temperature",
    name: "Air Temp",
    unit: "°C",
    type: "environment",
    threshold: { safe: [25, 32], caution: [22, 35] },
    plausible: [5, 55],
    alertCodes: ["DHT"],
  },
  {
    key: "humidity",
    name: "Humidity",
    unit: "%",
    type: "environment",
    threshold: { safe: [65, 85], caution: [55, 90] },
    plausible: [5, 100],
    alertCodes: ["DHT"],
  },
];

export const SENSOR_BY_KEY = Object.fromEntries(SENSORS.map((s) => [s.key, s]));
export const WATER_SENSORS = SENSORS.filter((s) => s.type === "water");
export const ENV_SENSORS = SENSORS.filter((s) => s.type === "environment");
export const WATER_KEYS = WATER_SENSORS.map((s) => s.key);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Truncates to exactly 2 decimal places WITHOUT rounding (27.999 → "27.99")
export function truncTo2(value) {
  if (value === null || value === undefined || value === "" || !isNum(Number(value))) return "--";
  const scaled = Number(value) * 100;
  return (Math.trunc(scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled)) / 100).toFixed(2);
}

export function isPlausible(key, value) {
  const cfg = SENSOR_BY_KEY[key];
  if (!cfg || !isNum(value)) return false;
  return value >= cfg.plausible[0] && value <= cfg.plausible[1];
}

// "WTMP pH ERR" → Set{"temperature","ph"}
export function parseSensorAlert(alert) {
  const faulty = new Set();
  if (!alert || typeof alert !== "string") return faulty;
  const tokens = alert.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const s of SENSORS) {
    if (tokens.some((t) => s.alertCodes.includes(t))) faulty.add(s.key);
  }
  return faulty;
}

// Status of a value against its thresholds: safe | caution | danger | unknown
export function deriveStatus(key, value) {
  const cfg = SENSOR_BY_KEY[key];
  if (!cfg || !isNum(value)) return "unknown";
  const { safe, caution } = cfg.threshold;
  if (value < caution[0] || value > caution[1]) return "danger";
  if (value < safe[0] || value > safe[1]) return "caution";
  return "safe";
}

// Per-probe health for one reading: WORKING | FAULTY (with a reason)
export function probeHealth(key, value, alertKeys = new Set()) {
  if (value === null || value === undefined || value === -999)
    return { state: "FAULTY", reason: "No value received" };
  if (!isNum(value)) return { state: "FAULTY", reason: "Non-numeric value" };
  if (alertKeys.has(key))
    return { state: "FAULTY", reason: "Monitoring station reported a probe error" };
  if (!isPlausible(key, value))
    return { state: "FAULTY", reason: "Physically impossible reading" };
  return { state: "WORKING", reason: null };
}

// Takes a mapped reading and returns per-sensor evaluation. Faulty values are
// replaced by null in `clean` so they never pollute charts, stats or decisions.
export function evaluateReading(reading) {
  if (!reading) return null;
  const alertKeys = parseSensorAlert(reading.sensorAlert);
  const sensors = {};
  const clean = { ...reading };
  for (const cfg of SENSORS) {
    const raw = reading[cfg.key];
    const health = probeHealth(cfg.key, raw, alertKeys);
    const ok = health.state === "WORKING";
    clean[cfg.key] = ok ? raw : null;
    sensors[cfg.key] = {
      raw,
      value: ok ? raw : null,
      health: health.state,
      faultReason: health.reason,
      status: ok ? deriveStatus(cfg.key, raw) : "fault",
    };
  }
  return { sensors, clean };
}

// Core GO / NO-GO rule — uses ONLY the 3 water-quality sensors.
//   fault        → a water probe is faulty: cannot certify safety (hold)
//   danger       → ≥1 water parameter in danger range
//   nogo_caution → ≥2 water parameters in caution range
//   go_caution   → exactly 1 water parameter in caution range
//   go           → all 3 water parameters safe
export function releaseStatus(reading) {
  const ev = evaluateReading(reading);
  if (!ev) return "unknown";
  const statuses = WATER_KEYS.map((k) => ev.sensors[k].status);
  if (statuses.every((s) => s === "fault") && !reading.timestamp && !reading.sensorAlert && WATER_KEYS.every((key) => reading[key] == null)) return "unknown";
  if (statuses.includes("fault")) return "fault";
  if (statuses.includes("danger")) return "danger";
  const cautionCount = statuses.filter((s) => s === "caution").length;
  if (cautionCount >= 2) return "nogo_caution";
  if (cautionCount === 1) return "go_caution";
  return "go";
}

export const RELEASE_META = {
  go: { label: "GO", long: "GO: SAFE TO RELEASE", tone: "safe", allowed: true },
  go_caution: {
    label: "GO (CAUTION)",
    long: "GO WITH CAUTION: SAFE TO RELEASE",
    tone: "caution",
    allowed: true,
  },
  nogo_caution: {
    label: "NO-GO (CAUTION)",
    long: "NO-GO: DO NOT RELEASE (CAUTION)",
    tone: "warn",
    allowed: false,
  },
  danger: {
    label: "NO-GO (DANGER)",
    long: "NO-GO: DO NOT RELEASE (DANGER)",
    tone: "danger",
    allowed: false,
  },
  fault: {
    label: "HOLD (SENSOR FAULT)",
    long: "HOLD: WATER SENSOR FAULT",
    tone: "fault",
    allowed: false,
  },
  offline: {
    label: "NO DECISION (OFFLINE)",
    long: "NO DECISION: STATION OFFLINE",
    tone: "fault",
    allowed: false,
  },
  unknown: { label: "NO DATA", long: "AWAITING DATA", tone: "muted", allowed: false },
};

// Least-squares slope of value vs time, in units per hour.
export function slopePerHour(points) {
  const pts = points.filter((p) => isNum(p.v) && isNum(p.t));
  if (pts.length < 2) return null;
  const t0 = pts[0].t;
  const xs = pts.map((p) => (p.t - t0) / 3_600_000);
  const ys = pts.map((p) => p.v);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

// Trend analysis for one sensor over a window of clean readings
// ({timestamp, [key]}). Returns direction, rate and — when heading out of the
// safe band — an estimate of minutes until the caution boundary is crossed.
export function analyzeTrend(history, key, current) {
  const cfg = SENSOR_BY_KEY[key];
  const pts = history
    .map((r) => ({ t: r.timestamp, v: r[key] }))
    .filter((p) => isNum(p.v) && isNum(p.t));
  if (!cfg || pts.length < 4)
    return { direction: "insufficient", ratePerHour: null, impact: "neutral", etaMinutes: null, samples: pts.length };

  const rate = slopePerHour(pts);
  const [sMin, sMax] = cfg.threshold.safe;
  const spanHours = (pts[pts.length - 1].t - pts[0].t) / 3_600_000 || 1 / 60;
  // "Stable" when the projected drift over the window is < 5% of the safe band
  const band = sMax - sMin || 1;
  const drift = Math.abs((rate ?? 0) * spanHours);
  const direction = rate === null || drift < band * 0.05 ? "stable" : rate > 0 ? "rising" : "falling";

  let impact = "neutral";
  let etaMinutes = null;
  if (isNum(current) && direction !== "stable") {
    if (current < sMin) impact = direction === "rising" ? "improving" : "worsening";
    else if (current > sMax) impact = direction === "falling" ? "improving" : "worsening";
    else {
      // Inside safe band — estimate time to reach the edge it's heading toward
      const edge = direction === "rising" ? sMax : sMin;
      const hours = (edge - current) / rate;
      if (hours > 0 && hours < 6) {
        etaMinutes = Math.round(hours * 60);
        impact = "watch";
      }
      // turbidity's lower edge is 0 — falling turbidity is never a risk
      if (key === "turbidity" && direction === "falling") {
        impact = "neutral";
        etaMinutes = null;
      }
    }
  }
  return { direction, ratePerHour: rate, impact, etaMinutes, samples: pts.length };
}

// How many of the most recent readings agree that release is allowed.
export function recentConsistency(history, n = 3) {
  const recent = history.slice(-n);
  const allowed = recent.filter((r) => RELEASE_META[releaseStatus(r)]?.allowed).length;
  return { allowed, total: recent.length };
}

// "41d ago", "3m ago", "12s ago"
export function formatAge(ms) {
  if (!isNum(ms) || ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
