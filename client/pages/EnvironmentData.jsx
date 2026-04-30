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
  0:  "Clear Sky",
  1:  "Mainly Clear",
  2:  "Partly Cloudy",
  3:  "Overcast",
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

// Open-Meteo Weather API
function WeatherPanel() {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
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

  useEffect(() => { fetchWeather(); }, []);

  const isReleaseWeatherSafe =
    data &&
    data.current.wind_speed_10m < 20 &&
    data.current.rain === 0 &&
    [0, 1, 2, 3].includes(data.current.weather_code);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
          ⚠ Failed to fetch weather data: {error}
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
            {isReleaseWeatherSafe
              ? <CheckCircle2 className="w-8 h-8 text-safe shrink-0" />
              : <AlertTriangle className="w-8 h-8 text-caution shrink-0" />
            }
            <div>
              <p className={`font-header font-bold text-lg ${
                isReleaseWeatherSafe ? "text-safe" : "text-caution"
              }`}>
                Weather: {isReleaseWeatherSafe
                  ? "Favorable for Turtle Release"
                  : "Adverse Weather — Hold Release"}
              </p>
              <p className="text-sm text-muted-foreground">
                {WMO_CODES[data.current.weather_code] || "Unknown"} ·{" "}
                Wind {data.current.wind_speed_10m} km/h{" "}
                {degToCardinal(data.current.wind_direction_10m)} ·{" "}
                Rain: {data.current.rain} mm
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <p className="text-xl font-header font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-sm font-header font-bold text-foreground mb-3">5-Day Forecast</h4>
            <div className="grid grid-cols-5 gap-2">
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
                  <p className="text-sm font-bold text-danger">{data.daily.temperature_2m_max[i]}°</p>
                  <p className="text-xs text-primary">{data.daily.temperature_2m_min[i]}°</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    🌧 {data.daily.precipitation_sum[i]} mm
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

// CO-OPs Tidal API
function TidalPanel() {
  const [tides, setTides]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [now, setNow]                 = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchTides = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const dateStr =
        String(today.getFullYear()) +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");

      const url =
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
        `?begin_date=${dateStr}` +
        `&end_date=${dateStr}` +
        `&station=1820000` +
        `&product=predictions` +
        `&interval=hilo` +
        `&datum=MLLW` +
        `&time_zone=lst` +
        `&units=metric` +
        `&application=BantayDagat` +
        `&format=json`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);

      const parsed = (json.predictions || []).map((p) => ({
        time:   new Date(p.t),
        height: parseFloat(p.v),
        type:   p.type,
      }));

      setTides(parsed);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTides(); }, []);

  const pastTides   = tides.filter((t) => t.time <= now);
  const futureTides = tides.filter((t) => t.time > now);
  const lastTide    = pastTides[pastTides.length - 1] || null;
  const nextTide    = futureTides[0] || null;
  const isOutgoing  = lastTide?.type === "H";
  const minsToNext  = nextTide ? Math.round((nextTide.time - now) / 60000) : null;
  const isTideSafe  = isOutgoing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              NOAA CO-OPS Tidal Predictions API
            </span>
          </div>
          <h3 className="text-xl font-header font-bold text-foreground">
            Tidal Conditions — Manila Bay / Cavite Coast
          </h3>
          <p className="text-sm text-muted-foreground">
            NOAA Station 1820000 — Manila Harbor · Nearest reference station for
            Brgy. Labac, Naic (~35 km, same tidal basin)
          </p>
        </div>
        <button
          onClick={fetchTides}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-danger text-sm">
          ⚠ Failed to fetch tidal data: {error}
        </div>
      )}

      {loading && tides.length === 0 && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Fetching tidal predictions from NOAA…
        </div>
      )}

      {!loading && tides.length > 0 && (
        <>
          <div
            className={`rounded-xl p-5 border-2 flex items-center gap-4 ${
              isTideSafe
                ? "bg-safe/10 border-safe/40"
                : "bg-danger/10 border-danger/40"
            }`}
          >
            {isTideSafe
              ? <CheckCircle2 className="w-8 h-8 text-safe shrink-0" />
              : <AlertTriangle className="w-8 h-8 text-danger shrink-0" />
            }
            <div>
              <p className={`font-header font-bold text-lg ${
                isTideSafe ? "text-safe" : "text-danger"
              }`}>
                {isTideSafe
                  ? "Outgoing Tide — Safe Release Window"
                  : "Incoming Tide — Hold Release"}
              </p>
              <p className="text-sm text-muted-foreground">
                Currently {isOutgoing ? "falling (outgoing)" : "rising (incoming)"} ·{" "}
                {nextTide && minsToNext !== null
                  ? minsToNext >= 60
                    ? `Next ${nextTide.type === "H" ? "High" : "Low"} tide in ${Math.floor(minsToNext / 60)}h ${minsToNext % 60}m`
                    : `Next ${nextTide.type === "H" ? "High" : "Low"} tide in ${minsToNext} min`
                  : "No further tide data today"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 border border-secondary shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                {lastTide?.type === "H"
                  ? <ArrowUp className="w-5 h-5 text-primary" />
                  : <ArrowDown className="w-5 h-5 text-accent" />
                }
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Most Recent Tide
                </span>
              </div>
              {lastTide ? (
                <>
                  <p className="text-xl font-header font-bold text-foreground">
                    {lastTide.type === "H" ? "High Tide" : "Low Tide"}
                  </p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    {lastTide.height.toFixed(2)} m
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    at {lastTide.time.toLocaleTimeString("en-PH", {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No past tide data yet today</p>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 border border-secondary shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Next Tide
                </span>
              </div>
              {nextTide ? (
                <>
                  <p className="text-xl font-header font-bold text-foreground">
                    {nextTide.type === "H" ? "High Tide" : "Low Tide"}
                  </p>
                  <p className="text-2xl font-bold text-accent mt-1">
                    {nextTide.height.toFixed(2)} m
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    at {nextTide.time.toLocaleTimeString("en-PH", {
                      hour: "2-digit", minute: "2-digit",
                    })}
                    {minsToNext !== null && (
                      <span className="ml-1 text-primary font-medium">
                        ({minsToNext >= 60
                          ? `in ${Math.floor(minsToNext / 60)}h ${minsToNext % 60}m`
                          : `in ${minsToNext} min`})
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No more tides today</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-header font-bold text-foreground mb-3 flex items-center gap-2">
              <Anchor className="w-4 h-4" />
              Today's Full Tide Schedule
            </h4>
            <div className="bg-white rounded-xl border border-secondary shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/30 border-b border-secondary">
                    <th className="px-4 py-3 text-left font-header font-bold text-foreground">Event</th>
                    <th className="px-4 py-3 text-left font-header font-bold text-foreground">Time (PST)</th>
                    <th className="px-4 py-3 text-left font-header font-bold text-foreground">Height (m MLLW)</th>
                    <th className="px-4 py-3 text-left font-header font-bold text-foreground">Release Window</th>
                  </tr>
                </thead>
                <tbody>
                  {tides.map((tide, i) => {
                    const isPast           = tide.time <= now;
                    const isOutgoingWindow = tide.type === "H";
                    return (
                      <tr
                        key={i}
                        className={`border-b border-secondary ${
                          isPast ? "opacity-40" : "hover:bg-secondary/20"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {tide.type === "H"
                              ? <ArrowUp   className="w-4 h-4 text-primary" />
                              : <ArrowDown className="w-4 h-4 text-accent"  />
                            }
                            <span className="font-medium">
                              {tide.type === "H" ? "High Tide" : "Low Tide"}
                            </span>
                            {!isPast && i === futureTides.indexOf(nextTide) && (
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                                Next
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground">
                          {tide.time.toLocaleTimeString("en-PH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {tide.height.toFixed(3)} m
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            isOutgoingWindow
                              ? "bg-safe/20 text-safe"
                              : "bg-danger/20 text-danger"
                          }`}>
                            {isOutgoingWindow ? "↓ Outgoing starts" : "↑ Incoming starts"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-secondary/30 rounded-xl p-4 border border-secondary text-sm">
            <p className="font-semibold text-foreground mb-2">
              Why Tidal Phase Matters for Sea Turtle Release
            </p>
            <div className="grid grid-cols-2 gap-4 text-muted-foreground">
              <div className="flex gap-2">
                <span className="text-safe font-bold shrink-0">✓ Outgoing (Ebb) Tide:</span>
                <span>Water moves away from shore. Released turtles are naturally carried seaward. Recommended release window.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-danger font-bold shrink-0">✗ Incoming (Flood) Tide:</span>
                <span>Water pushes back toward shore. Turtles must swim against the current. Risk of stranding on shallow reefs.</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Source: NOAA CO-OPS · Station 1820000 (Manila, Philippines) · Last updated: {lastFetched}
          </p>
        </>
      )}

      {!loading && !error && tides.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No tidal prediction data returned for today.
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "weather", label: "Weather",          icon: Cloud   },
  { id: "tidal",   label: "Tidal Conditions", icon: Anchor  },
];

export default function EnvironmentData() {
  const [activeTab, setActiveTab] = useState("weather");

  return (
    <Layout userEmail="staff@sanctuary.org">
      <div className="p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-header font-bold text-foreground mb-1">
            Environmental Monitoring
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time environmental data for sea turtle pre-release safety assessment.
          </p>
        </div>

        <div className="flex gap-2 mb-8 bg-secondary/30 rounded-xl p-2 border border-secondary">
          {TABS.map((tab) => {
            const Icon   = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-background rounded-xl">
          {activeTab === "weather" && <WeatherPanel />}
          {activeTab === "tidal"   && <TidalPanel  />}
        </div>
      </div>
    </Layout>
  );
}
