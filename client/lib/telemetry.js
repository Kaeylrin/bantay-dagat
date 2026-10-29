export function mapArduinoReading(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return {
    air_temperature: raw.airTemp ?? null,
    temperature: raw.waterTemp ?? null,
    humidity: raw.humidity ?? null,
    ph: raw.pH ?? null,
    turbidity: raw.turbidity ?? null,
    status: raw.status ?? null,
    sensorAlert: raw.sensorAlert ?? null,
    timestamp: raw.timestamp ?? null,
  };
}
