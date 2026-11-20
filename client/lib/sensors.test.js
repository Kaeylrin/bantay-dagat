import { describe, it, expect } from "vitest";
import {
  releaseStatus,
  deriveStatus,
  evaluateReading,
  parseSensorAlert,
  analyzeTrend,
  recentConsistency,
  formatAge,
  truncTo2,
} from "./sensors";

const base = { temperature: 28, ph: 8.1, turbidity: 10, air_temperature: 29, humidity: 75 };

describe("releaseStatus (water sensors only)", () => {
  it("GO when all water parameters are safe", () => {
    expect(releaseStatus(base)).toBe("go");
  });

  it("ignores environmental sensors", () => {
    expect(releaseStatus({ ...base, air_temperature: 40, humidity: 30 })).toBe("go");
  });

  it("GO (CAUTION) with exactly one caution parameter", () => {
    expect(releaseStatus({ ...base, temperature: 31.5 })).toBe("go_caution");
  });

  it("NO-GO (CAUTION) with two caution parameters", () => {
    expect(releaseStatus({ ...base, temperature: 31.5, ph: 7.5 })).toBe("nogo_caution");
  });

  it("NO-GO (DANGER) with any danger parameter", () => {
    expect(releaseStatus({ ...base, turbidity: 60 })).toBe("danger");
    expect(releaseStatus({ ...base, ph: 6.9 })).toBe("danger");
    expect(releaseStatus({ ...base, ph: 8.6 })).toBe("danger");
    expect(releaseStatus({ ...base, temperature: 33.1 })).toBe("danger");
    expect(releaseStatus({ ...base, temperature: 23.9 })).toBe("danger");
  });

  it("treats boundary values as inside the range", () => {
    expect(releaseStatus({ ...base, temperature: 31, ph: 7.8, turbidity: 25 })).toBe("go");
    expect(releaseStatus({ ...base, temperature: 26, ph: 8.3 })).toBe("go");
    expect(releaseStatus({ ...base, temperature: 33 })).toBe("go_caution");
    expect(releaseStatus({ ...base, temperature: 24 })).toBe("go_caution");
    expect(releaseStatus({ ...base, ph: 7.5 })).toBe("go_caution");
    expect(releaseStatus({ ...base, ph: 8.5 })).toBe("go_caution");
    expect(releaseStatus({ ...base, turbidity: 50 })).toBe("go_caution");
  });

  it("HOLD (fault) — DS18B20 disconnected value -127 °C is not 'danger'", () => {
    expect(releaseStatus({ ...base, temperature: -127 })).toBe("fault");
  });

  it("HOLD (fault) — impossible pH values from a broken probe", () => {
    expect(releaseStatus({ ...base, ph: 14 })).toBe("fault");
    expect(releaseStatus({ ...base, ph: 23.1 })).toBe("fault");
    expect(releaseStatus({ ...base, ph: 0 })).toBe("fault");
  });

  it("HOLD (fault) when a water value is missing", () => {
    expect(releaseStatus({ ...base, ph: null })).toBe("fault");
  });

  it("HOLD when a received packet reports all critical probes broken", () => {
    expect(releaseStatus({ ...base, sensorAlert: "WTMP pH TURB ERR" })).toBe("fault");
    expect(releaseStatus({ timestamp: 123, sensorAlert: "WTMP pH TURB ERR" })).toBe("fault");
  });

  it("a critical probe fault blocks the assessment even with another danger reading", () => {
    expect(releaseStatus({ ...base, turbidity: 80, ph: 14 })).toBe("fault");
  });

  it("honours the Arduino sensorAlert flags", () => {
    // Real packet from bantaydagat/latest
    const latest = { temperature: 32, ph: 8, turbidity: 17, air_temperature: 28, humidity: 70.3, sensorAlert: "WTMP pH ERR" };
    expect(releaseStatus(latest)).toBe("fault");
    expect(releaseStatus({ ...latest, sensorAlert: null })).toBe("go_caution"); // 32 °C is inside the paper caution range.
  });

  it("unknown when there is no reading", () => {
    expect(releaseStatus(null)).toBe("unknown");
    expect(releaseStatus({})).toBe("unknown");
  });
});

describe("parseSensorAlert", () => {
  it("maps alert tokens to sensor keys", () => {
    expect([...parseSensorAlert("WTMP pH ERR")].sort()).toEqual(["ph", "temperature"]);
    expect([...parseSensorAlert("TURB ERR")]).toEqual(["turbidity"]);
    expect([...parseSensorAlert("DHT ERR")].sort()).toEqual(["air_temperature", "humidity"]);
    expect(parseSensorAlert("NONE").size).toBe(0);
    expect(parseSensorAlert("").size).toBe(0);
    expect(parseSensorAlert(null).size).toBe(0);
  });
});

describe("evaluateReading", () => {
  it("nulls faulty values in the clean copy and keeps raw", () => {
    const ev = evaluateReading({ ...base, temperature: -127 });
    expect(ev.clean.temperature).toBeNull();
    expect(ev.sensors.temperature.raw).toBe(-127);
    expect(ev.sensors.temperature.health).toBe("FAULTY");
    expect(ev.clean.ph).toBe(8.1);
  });
});

describe("analyzeTrend", () => {
  const mk = (vals, stepMin = 5) => vals.map((v, i) => ({ timestamp: i * stepMin * 60_000, ph: v }));

  it("needs at least 4 points", () => {
    expect(analyzeTrend(mk([8, 8.1, 8.2]), "ph", 8.2).direction).toBe("insufficient");
  });

  it("detects stable values", () => {
    expect(analyzeTrend(mk([8.1, 8.1, 8.11, 8.1]), "ph", 8.1).direction).toBe("stable");
  });

  it("projects time to the safe boundary when rising inside the safe band", () => {
    // +0.05 pH per 5 min = 0.6/h; from 8.15 to 8.3 → 15 min
    const tr = analyzeTrend(mk([8.0, 8.05, 8.1, 8.15]), "ph", 8.15);
    expect(tr.direction).toBe("rising");
    expect(tr.impact).toBe("watch");
    expect(tr.etaMinutes).toBe(15);
  });

  it("flags improving when moving back toward safe", () => {
    const tr = analyzeTrend(mk([7.5, 7.55, 7.6, 7.65]), "ph", 7.65);
    expect(tr.direction).toBe("rising");
    expect(tr.impact).toBe("improving");
  });

  it("does not flag falling turbidity as a risk", () => {
    const pts = [20, 15, 10, 5].map((v, i) => ({ timestamp: i * 300_000, turbidity: v }));
    expect(analyzeTrend(pts, "turbidity", 5).impact).toBe("neutral");
  });
});

describe("helpers", () => {
  it("recentConsistency counts readings that allow release", () => {
    const h = [{ ...base, turbidity: 60 }, base, { ...base, temperature: 31.5 }];
    expect(recentConsistency(h, 3)).toEqual({ allowed: 2, total: 3 });
  });

  it("formatAge", () => {
    expect(formatAge(12_000)).toBe("12s ago");
    expect(formatAge(5 * 60_000)).toBe("5m ago");
    expect(formatAge(41 * 86_400_000)).toBe("41d ago");
  });

  it("truncTo2 truncates without rounding", () => {
    expect(truncTo2(27.999)).toBe("27.99");
    expect(truncTo2(null)).toBe("--");
  });
});
