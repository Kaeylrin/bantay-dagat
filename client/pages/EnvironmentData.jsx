import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  Cloud,
  Thermometer,
  Droplets,
  Wind,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Anchor,
  Clock,
} from "lucide-react";

const SANCTUARY_LAT = 14.3025;
const SANCTUARY_LNG = 120.7617;

const WMO_CODES = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Icy Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Slight Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  71: "Slight Snowfall",
  73: "Moderate Snowfall",
  75: "Heavy Snowfall",
  80: "Slight Showers",
  81: "Moderate Showers",
  82: "Violent Showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ Hail",
  99: "Thunderstorm w/ Heavy Hail",
};

function degToCardinal(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function WeatherPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${SANCTUARY_LAT}` +
        `&longitude=${SANCTUARY_LNG}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
        `rain,wind_speed_10m,wind_direction_10m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
        `&timezone=Asia%2FManila` +
        `&forecast_days=5`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, []);

  const isReleaseWeatherSafe =
    data &&
    data.current.wind_speed_10m < 20 &&
    data.current.rain === 0 &&
    [0, 1, 2, 3].includes(data.current.weather_code);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Open-Meteo Weather Forecast API
            </span>
          </div>
          <h3 className="text-xl font-header font-bold text-foreground">
            Current Weather Conditions
          </h3>
          <p className="text-sm text-muted-foreground">
            Brgy. Labac, Naic, Cavite · {SANCTUARY_LAT}°N, {SANCTUARY_LNG}°E
          </p>
        </div>
        <button
          onClick={fetchWeather}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-danger text-sm">
          Failed to fetch weather data: {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Fetching live weather from Open-Meteo…
        </div>
      )}

      {data && (
        <>
          <div
            className={`rounded-xl p-5 border-2 flex items-center gap-4 ${
              isReleaseWeatherSafe
                ? "bg-safe/10 border-safe/40"
                : "bg-caution/10 border-caution/40"
            }`}
          >
            {isReleaseWeatherSafe ? (
              <CheckCircle2 className="w-8 h-8 text-safe shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-caution shrink-0" />
            )}
            <div>
              <p
                className={`font-header font-bold text-lg ${
                  isReleaseWeatherSafe ? "text-safe" : "text-caution"
                }`}
              >
                Weather:{" "}
                {isReleaseWeatherSafe
                  ? "Favorable for Turtle Release"
                  : "Adverse Weather — Hold Release"}
              </p>
              <p className="text-sm text-muted-foreground">
                {WMO_CODES[data.current.weather_code] || "Unknown"} · Wind{" "}
                {data.current.wind_speed_10m} km/h{" "}
                {degToCardinal(data.current.wind_direction_10m)} · Rain:{" "}
                {data.current.rain} mm
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[
              {
                icon: <Thermometer className="w-5 h-5 text-danger" />,
                label: "Air Temperature",
                value: `${data.current.temperature_2m}°C`,
                sub: `Feels like ${data.current.apparent_temperature}°C`,
              },
              {
                icon: <Droplets className="w-5 h-5 text-primary" />,
                label: "Humidity",
                value: `${data.current.relative_humidity_2m}%`,
                sub: "Relative humidity at 2m",
              },
              {
                icon: <Wind className="w-5 h-5 text-accent" />,
                label: "Wind Speed",
                value: `${data.current.wind_speed_10m} km/h`,
                sub: `Direction: ${degToCardinal(data.current.wind_direction_10m)}`,
              },
              {
                icon: <Cloud className="w-5 h-5 text-muted-foreground" />,
                label: "Condition",
                value: WMO_CODES[data.current.weather_code] || "—",
                sub: `Rain: ${data.current.rain} mm`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl p-4 border border-secondary shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  {stat.icon}
                  <span className="text-xs text-muted-foreground font-medium">
                    {stat.label}
                  </span>
                </div>
                <p className="text-xl font-header font-bold text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-sm font-header font-bold text-foreground mb-3">
              5-Day Forecast
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {data.daily.time.map((date, i) => (
                <div
                  key={date}
                  className="bg-white rounded-xl p-3 border border-secondary shadow-sm text-center"
                >
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    {new Date(date).toLocaleDateString("en-PH", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs font-medium text-foreground mb-1">
                    {WMO_CODES[data.daily.weather_code[i]] || "—"}
                  </p>
                  <p className="text-sm font-bold text-danger">
                    {data.daily.temperature_2m_max[i]}°
                  </p>
                  <p className="text-xs text-primary">
                    {data.daily.temperature_2m_min[i]}°
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.daily.precipitation_sum[i]} mm
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Source: open-meteo.com · Last updated: {lastFetched}
          </p>
        </>
      )}
    </div>
  );
}

const TABS = [{ id: "weather", label: "Weather", icon: Cloud }];

export default function EnvironmentData() {
  return (
    <Layout userEmail="staff@sanctuary.org">
      <div className="space-y-4">
        <div className="mb-2">
          <h2 className="text-xl font-header font-bold text-foreground tracking-tight">
            Environmental Monitoring
          </h2>
          <p className="text-xs text-muted-foreground">
            Real-time environmental data for sea turtle pre-release safety assessment.
          </p>
        </div>

        <div className="bg-background rounded-xl">
          <WeatherPanel />
        </div>
      </div>
    </Layout>
  );
}
