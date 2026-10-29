import { describe, expect, it } from "vitest";
import { stationState } from "./stationState";
import { deriveStatus, truncTo2 } from "./sensors";

const now = 1_800_000_000_000;
const packet = { timestamp: now, temperature: 28, ph: 8.1, turbidity: 10, air_temperature: 29, humidity: 75 };
const options = { now, loaded: true, databaseConnected: true };

describe("monitoring station connection and probe health", () => {
  it("starts connecting, then distinguishes empty data from a working packet", () => {
    expect(stationState(null).hardware).toBe("CONNECTING");
    expect(stationState(null, options).connection).toBe("empty");
    const result = stationState(packet, options);
    expect(result.hardware).toBe("WORKING");
    expect(result.workingCount).toBe(5);
  });
  it("ages out without receiving any new packet", () => {
    expect(stationState(packet, { ...options, now: now + 60_000 }).connection).toBe("live");
    const result = stationState(packet, { ...options, now: now + 60_001 });
    expect(result.connection).toBe("offline");
    expect(result.probes.every((p) => p.state === "OFFLINE")).toBe(true);
    expect(stationState({ ...packet, timestamp: now + 60_001 }, { ...options, now: now + 60_001 }).hardware).toBe("WORKING");
  });
  it("does not report live for a disconnected database or permission error", () => {
    expect(stationState(packet, { ...options, databaseConnected: false }).hardware).toBe("OFFLINE");
    expect(stationState(packet, { ...options, linkError: "Permission denied" }).connection).toBe("error");
  });
  it.each([null, 0, "invalid", Infinity, now + 60_000])("rejects invalid or future timestamps: %s", (timestamp) => {
    expect(stationState({ ...packet, timestamp }, options).connection).toBe("offline");
  });
  it("marks explicit errors and missing/invalid measurements faulty without hiding working probes", () => {
    const result = stationState({ ...packet, sensorAlert: "WTMP pH ERR", humidity: null }, options);
    expect(result.hardware).toBe("FAULTY");
    expect(result.faultyCount).toBe(3);
    expect(result.workingCount).toBe(2);
    expect(result.probes.find((p) => p.key === "turbidity").state).toBe("WORKING");
  });
});

describe("paper threshold boundaries", () => {
  it.each([
    ["air_temperature", 22, 25, 32, 35],
    ["temperature", 24, 26, 31, 33],
    ["humidity", 55, 65, 85, 90],
    ["ph", 7.5, 7.8, 8.3, 8.5],
  ])("classifies both sides of every %s boundary", (key, cautionMin, safeMin, safeMax, cautionMax) => {
    expect(deriveStatus(key, cautionMin - 0.01)).toBe("danger");
    expect(deriveStatus(key, cautionMin)).toBe("caution");
    expect(deriveStatus(key, safeMin - 0.01)).toBe("caution");
    expect(deriveStatus(key, safeMin)).toBe("safe");
    expect(deriveStatus(key, safeMax)).toBe("safe");
    expect(deriveStatus(key, safeMax + 0.01)).toBe("caution");
    expect(deriveStatus(key, cautionMax)).toBe("caution");
    expect(deriveStatus(key, cautionMax + 0.01)).toBe("danger");
  });
  it("classifies the NTU boundaries", () => {
    expect(deriveStatus("turbidity", 0)).toBe("safe");
    expect(deriveStatus("turbidity", 25)).toBe("safe");
    expect(deriveStatus("turbidity", 25.01)).toBe("caution");
    expect(deriveStatus("turbidity", 50)).toBe("caution");
    expect(deriveStatus("turbidity", 50.01)).toBe("danger");
  });
  it("formats decimals without binary rounding artifacts or rounding up", () => {
    expect(truncTo2(8.2)).toBe("8.20");
    expect(truncTo2(27.999)).toBe("27.99");
    expect(truncTo2(-1.239)).toBe("-1.23");
    expect(truncTo2(NaN)).toBe("--");
  });
});
