import { STALE_AFTER_MS, SENSORS, evaluateReading } from "./sensors";

export function stationState(reading, { now = Date.now(), loaded = false, linkError = null, databaseConnected = null } = {}) {
  const timestamp = Number(reading?.timestamp);
  const lastPacketAt = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  const futureTimestamp = lastPacketAt !== null && lastPacketAt > now + 30_000;
  const ageMs = lastPacketAt === null ? null : Math.max(0, now - lastPacketAt);
  const isStale = lastPacketAt === null || futureTimestamp || ageMs > STALE_AFTER_MS;
  let connection = "connecting";
  if (linkError) connection = "error";
  else if (databaseConnected === false) connection = "offline";
  else if (loaded && !reading) connection = "empty";
  else if (reading) connection = isStale ? "offline" : "live";

  const evaluation = evaluateReading(reading);
  const probes = SENSORS.map((cfg) => {
    const ev = evaluation?.sensors[cfg.key];
    const state = connection !== "live" ? "OFFLINE" : (ev?.health ?? "FAULTY");
    return { key: cfg.key, label: cfg.name, type: cfg.type, state, reason: state === "FAULTY" ? ev?.faultReason : null };
  });
  const faultyCount = probes.filter((probe) => probe.state === "FAULTY").length;
  const workingCount = probes.filter((probe) => probe.state === "WORKING").length;
  const hardware = connection === "live" ? (faultyCount ? "FAULTY" : "WORKING") : connection === "connecting" ? "CONNECTING" : "OFFLINE";
  return { evaluation, connection, hardware, lastPacketAt, ageMs, isStale, probes, faultyCount, workingCount, now };
}
