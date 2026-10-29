import { describe, expect, it } from "vitest";
import { mapArduinoReading } from "./telemetry";
import { evaluateReading } from "./sensors";
import { escapeHtml, printDocument } from "./printExport";
import { vi } from "vitest";

describe("Arduino packet mapping", () => {
  it("preserves zero, missing values, fault flags and timestamp", () => {
    const mapped = mapArduinoReading({ waterTemp: 28, pH: 8.2, turbidity: 0, airTemp: 0, sensorAlert: "DHT ERR", timestamp: 123 });
    expect(mapped.turbidity).toBe(0);
    expect(mapped.humidity).toBeNull();
    expect(mapped.timestamp).toBe(123);
    const result = evaluateReading(mapped);
    expect(result.sensors.turbidity.health).toBe("WORKING");
    expect(result.sensors.air_temperature.health).toBe("FAULTY");
    expect(result.sensors.humidity.health).toBe("FAULTY");
  });
  it.each([null, false, "invalid", 123, []])("rejects malformed packet %s", (packet) => {
    expect(mapArduinoReading(packet)).toBeNull();
  });
});

describe("print export", () => {
  it("escapes untrusted raw values in HTML exports", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  it("shows an actionable message if the browser blocks the popup", () => {
    const alert = vi.fn();
    vi.stubGlobal("window", { open: () => null, alert });
    try {
      expect(() => printDocument("test")).not.toThrow();
      expect(alert).toHaveBeenCalledWith(expect.stringContaining("Allow pop-ups"));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
