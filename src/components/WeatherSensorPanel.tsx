import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  Droplets,
  Flame,
  Sun,
  Thermometer,
  Umbrella,
  Wind,
} from "lucide-react";
import type {
  HeatLevel,
  WeatherBundle,
  WeatherLocationReport,
} from "../../shared/types";

interface WeatherSensorPanelProps {
  weather: WeatherBundle | null;
}

function WeatherConditionIcon({
  code,
  isRaining,
  className = "h-6 w-6",
}: {
  code: number;
  isRaining: boolean;
  className?: string;
}) {
  if (code >= 95)
    return <CloudLightning className={`${className} text-amber-300`} aria-hidden="true" />;
  if (code >= 61 || code >= 80)
    return <CloudRain className={`${className} text-sky-400`} aria-hidden="true" />;
  if (isRaining || (code >= 51 && code <= 57))
    return <CloudDrizzle className={`${className} text-sky-300`} aria-hidden="true" />;
  if (code === 0 || code === 1)
    return <Sun className={`${className} text-amber-300`} aria-hidden="true" />;
  return <Cloud className={`${className} text-slate-300`} aria-hidden="true" />;
}

function getHeatBadgeClass(level: HeatLevel): string {
  switch (level) {
    case "Cool":
      return "border-sky-500/40 bg-sky-500/15 text-sky-300";
    case "Warm":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    case "Hot":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300";
    case "Sweltering":
      return "border-orange-500/40 bg-orange-500/15 text-orange-300";
    case "Extreme Heat":
      return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
}

function WeatherLocationCard({
  report,
  roleLabel,
}: {
  report: WeatherLocationReport;
  roleLabel: "Origin" | "Destination";
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              {roleLabel}
            </span>
            <span className="text-[11px] text-slate-400">
              Live Sensor · Open-Meteo
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-slate-100">
            {report.label}
          </h3>
          {report.address && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400" title={report.address}>
              {report.address}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-300">
              {report.weatherLabel}
            </span>
            {report.bmkg && (
              <span className="rounded-md border border-slate-700/80 bg-slate-950/70 px-2 py-0.5 text-[10px] text-slate-300">
                <span className="font-semibold text-emerald-300">
                  BMKG {report.bmkg.area.split(",")[0]}:
                </span>{" "}
                {report.bmkg.descId} ·{" "}
                <span className="font-mono-num">{report.bmkg.tempC}°C</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <div className="flex items-center gap-2">
            <WeatherConditionIcon
              code={report.weatherCode}
              isRaining={report.isRaining}
              className="h-6 w-6"
            />
            <span className="font-mono-num text-2xl font-bold text-slate-50">
              {report.temperatureC.toFixed(1)}°C
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Feels like</span>
            <span className="font-mono-num text-xs font-semibold text-amber-300">
              {report.feelsLikeC.toFixed(1)}°C
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getHeatBadgeClass(
                report.heatLevel
              )}`}
            >
              {report.heatLevel}
            </span>
          </div>
        </div>
      </div>

      {/* Live rain & atmospheric metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div
          className={`rounded-lg border px-2.5 py-2 ${
            report.isRaining
              ? "border-sky-500/50 bg-sky-500/15"
              : "border-slate-700/50 bg-slate-800/40"
          }`}
        >
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <CloudRain className="h-3 w-3 text-sky-400" aria-hidden="true" />
            Rain Sensor
          </div>
          <div className="font-mono-num mt-0.5 text-xs font-semibold text-slate-100">
            {report.isRaining
              ? `${report.rainMm.toFixed(1)} mm`
              : "Dry (0.0 mm)"}
          </div>
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-2">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Droplets className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            Humidity
          </div>
          <div className="font-mono-num mt-0.5 text-xs font-semibold text-slate-100">
            {report.humidityPct}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-2">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Wind className="h-3 w-3 text-slate-300" aria-hidden="true" />
            Wind
          </div>
          <div className="font-mono-num mt-0.5 text-xs font-semibold text-slate-100">
            {report.windKmh} km/h
          </div>
        </div>
      </div>

      {/* Next 6 Hours Rain Probability & Heat Strip */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Next 6h Rain Probability & Temp</span>
          <span className="font-mono-num">
            Updated{" "}
            {new Date(report.updatedAt).toLocaleTimeString("en-GB", {
              timeZone: "Asia/Jakarta",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            WIB
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {report.hourlyNext6.map((slot) => (
            <div
              key={slot.time}
              className="flex flex-col items-center rounded-lg border border-slate-800 bg-slate-950/50 px-1 py-1.5"
            >
              <span className="font-mono-num text-[10px] text-slate-400">
                {slot.hourLabel}
              </span>
              <div className="my-1 flex h-7 w-2.5 items-end overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`w-full rounded-full ${
                    slot.rainProbPct >= 60
                      ? "bg-sky-400"
                      : slot.rainProbPct >= 30
                        ? "bg-cyan-500/80"
                        : "bg-slate-600"
                  }`}
                  style={{ height: `${Math.max(8, slot.rainProbPct)}%` }}
                />
              </div>
              <span className="font-mono-num text-[10px] font-medium text-sky-300">
                {slot.rainProbPct}%
              </span>
              <span className="font-mono-num text-[10px] text-slate-300">
                {Math.round(slot.temperatureC)}°
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeatherSensorPanel({ weather }: WeatherSensorPanelProps) {
  if (!weather) {
    return (
      <section className="glass-card rounded-2xl p-4">
        <div className="h-32 animate-pulse rounded-xl bg-slate-800/60" />
      </section>
    );
  }

  return (
    <section
      aria-label="Live weather, rain and heat sensors"
      className="glass-card rounded-2xl p-4"
    >
      {/* Commute Rain & Heat Advisory Banner */}
      <div
        className={`mb-4 flex flex-col gap-2 rounded-xl border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
          weather.umbrellaRecommended
            ? "border-sky-500/50 bg-sky-500/12"
            : weather.heatAlert
              ? "border-amber-500/50 bg-amber-500/12"
              : "border-emerald-500/40 bg-emerald-500/10"
        }`}
      >
        <div className="flex items-start gap-2.5 sm:items-center">
          {weather.umbrellaRecommended ? (
            <Umbrella
              className="mt-0.5 h-4 w-4 shrink-0 text-sky-400 sm:mt-0"
              aria-hidden="true"
            />
          ) : weather.heatAlert ? (
            <Flame
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400 sm:mt-0"
              aria-hidden="true"
            />
          ) : (
            <Thermometer
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 sm:mt-0"
              aria-hidden="true"
            />
          )}
          <p className="text-xs font-medium text-slate-100 sm:text-sm">
            {weather.advisory}
          </p>
        </div>

        {weather.bmkg && (
          <div className="shrink-0 rounded-lg border border-slate-700/70 bg-slate-900/75 px-2.5 py-1 text-[11px] text-slate-300">
            <span className="font-semibold text-emerald-300">
              BMKG ({weather.bmkg.area.split(",")[0]}):
            </span>{" "}
            {weather.bmkg.descId} ·{" "}
            <span className="font-mono-num">{weather.bmkg.tempC}°C</span> (
            {weather.bmkg.humidityPct}% RH)
          </div>
        )}
      </div>

      {/* Origin + Destination Weather Sensor Cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <WeatherLocationCard report={weather.origin} roleLabel="Origin" />
        <WeatherLocationCard
          report={weather.destination}
          roleLabel="Destination"
        />
      </div>
    </section>
  );
}
