import type {
  BmkgAdvisory,
  HeatLevel,
  HourlyWeatherPoint,
  PlaceProfile,
  WeatherBundle,
  WeatherLocationReport,
} from "../../shared/types.js";
import { fetchJsonWithTimeout, TtlCache } from "../utils/cache.js";
import { getJakartaNow } from "../utils/time.js";

const WEATHER_TTL_MS = 3 * 60 * 1000; // 3 minutes
const BMKG_TTL_MS = 15 * 60 * 1000; // 15 minutes

const weatherCache = new TtlCache<Omit<WeatherLocationReport, "label">>(WEATHER_TTL_MS);
const bmkgCache = new TtlCache<BmkgAdvisory | null>(BMKG_TTL_MS);

export const weatherUpstreamState = {
  openMeteo: "ok" as "ok" | "degraded",
  bmkg: "ok" as "ok" | "degraded",
  lastSync: null as string | null,
};

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    precipitation?: number;
    rain?: number;
    showers?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    cloud_cover?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation_probability?: number[];
    rain?: number[];
    weather_code?: number[];
  };
}

interface BmkgResponse {
  data?: Array<{
    lokasi?: {
      desa?: string;
      kecamatan?: string;
      kotkab?: string;
    };
    cuaca?: Array<
      Array<{
        t?: number;
        hu?: number;
        weather_desc?: string;
        weather_desc_en?: string;
        local_datetime?: string;
      }>
    >;
  }>;
}

const WMO_LABELS: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Light Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  80: "Light Showers",
  81: "Moderate Showers",
  82: "Violent Showers",
  95: "Thunderstorm",
  96: "Thunderstorm + Hail",
  99: "Severe Thunderstorm",
};

function decodeWmoCode(code: number): string {
  return WMO_LABELS[code] ?? (code >= 60 ? "Rainy" : "Cloudy");
}

function classifyHeat(feelsLikeC: number): HeatLevel {
  if (feelsLikeC < 25) return "Cool";
  if (feelsLikeC < 30) return "Warm";
  if (feelsLikeC < 34) return "Hot";
  if (feelsLikeC < 38) return "Sweltering";
  return "Extreme Heat";
}

function isRainWmo(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

function getJakartaDateHourPrefix(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  const hr = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hr}:00`;
}

export async function fetchWeatherForPoint(
  label: string,
  lat: number,
  lon: number
): Promise<WeatherLocationReport> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;

  const data = await weatherCache.getOrLoad(key, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,wind_speed_10m,cloud_cover` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,rain,weather_code` +
      `&forecast_days=2&timezone=Asia%2FJakarta`;

    try {
      const json = await fetchJsonWithTimeout<OpenMeteoResponse>(url, 8000);
      const cur = json.current ?? {};
      const tempC = Number((cur.temperature_2m ?? 28).toFixed(1));
      const feelsLikeC = Number((cur.apparent_temperature ?? tempC).toFixed(1));
      const precip = Number((cur.precipitation ?? 0).toFixed(2));
      const rain = Number(((cur.rain ?? 0) + (cur.showers ?? 0)).toFixed(2));
      const wmo = cur.weather_code ?? 3;

      const hourlyTimes = json.hourly?.time ?? [];
      const prefix = getJakartaDateHourPrefix();
      let startIdx = hourlyTimes.findIndex((t) => t >= prefix);
      if (startIdx < 0) startIdx = Math.min(getJakartaNow().hour, Math.max(0, hourlyTimes.length - 6));

      const hourlyNext6: HourlyWeatherPoint[] = [];
      for (let i = startIdx; i < Math.min(startIdx + 6, hourlyTimes.length); i++) {
        const timeIso = hourlyTimes[i];
        hourlyNext6.push({
          time: timeIso,
          hourLabel: timeIso.slice(11, 16),
          temperatureC: Number((json.hourly?.temperature_2m?.[i] ?? tempC).toFixed(1)),
          feelsLikeC: Number((json.hourly?.apparent_temperature?.[i] ?? feelsLikeC).toFixed(1)),
          rainProbPct: Math.round(json.hourly?.precipitation_probability?.[i] ?? 0),
          rainMm: Number((json.hourly?.rain?.[i] ?? 0).toFixed(2)),
          weatherCode: json.hourly?.weather_code?.[i] ?? wmo,
        });
      }

      const nowIso = new Date().toISOString();
      weatherUpstreamState.openMeteo = "ok";
      weatherUpstreamState.lastSync = nowIso;

      return {
        lat,
        lon,
        temperatureC: tempC,
        feelsLikeC,
        heatLevel: classifyHeat(feelsLikeC),
        humidityPct: Math.round(cur.relative_humidity_2m ?? 75),
        windKmh: Number((cur.wind_speed_10m ?? 0).toFixed(1)),
        cloudCoverPct: Math.round(cur.cloud_cover ?? 50),
        precipitationMm: precip,
        rainMm: rain,
        weatherCode: wmo,
        weatherLabel: decodeWmoCode(wmo),
        isRaining: rain > 0.05 || precip > 0.05 || isRainWmo(wmo),
        isDay: (cur.is_day ?? 1) === 1,
        hourlyNext6,
        updatedAt: nowIso,
      };
    } catch (err) {
      weatherUpstreamState.openMeteo = "degraded";
      throw err;
    }
  });

  return { label, ...data };
}

export async function fetchBmkgByAdm4(
  adm4: string = "31.71.03.1001"
): Promise<BmkgAdvisory | null> {
  return bmkgCache.getOrLoad(adm4, async () => {
    try {
      const json = await fetchJsonWithTimeout<BmkgResponse>(
        `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(adm4)}`,
        4000
      );
      const root = json.data?.[0];
      const slot = root?.cuaca?.[0]?.[0];
      if (!slot) return null;

      weatherUpstreamState.bmkg = "ok";
      const areaParts = [
        root?.lokasi?.desa,
        root?.lokasi?.kecamatan,
        root?.lokasi?.kotkab,
      ].filter(Boolean);
      return {
        area: areaParts.join(", ") || "Jakarta",
        tempC: slot.t ?? 28,
        humidityPct: slot.hu ?? 75,
        descId: slot.weather_desc ?? "Berawan",
        descEn: slot.weather_desc_en ?? "Cloudy",
        localDatetime: slot.local_datetime ?? "",
      };
    } catch {
      weatherUpstreamState.bmkg = "degraded";
      return null;
    }
  });
}

export async function buildWeatherBundle(
  originPlace: PlaceProfile,
  destPlace: PlaceProfile
): Promise<WeatherBundle> {
  const [originReport, destReport, originBmkg, destBmkg] = await Promise.all([
    fetchWeatherForPoint(
      originPlace.label,
      originPlace.latitude,
      originPlace.longitude
    ),
    fetchWeatherForPoint(
      destPlace.label,
      destPlace.latitude,
      destPlace.longitude
    ),
    originPlace.bmkgAdm4 ? fetchBmkgByAdm4(originPlace.bmkgAdm4) : Promise.resolve(null),
    destPlace.bmkgAdm4 ? fetchBmkgByAdm4(destPlace.bmkgAdm4) : Promise.resolve(null),
  ]);

  const origin: WeatherLocationReport = {
    ...originReport,
    address: originPlace.address,
    bmkg: originBmkg,
  };
  const destination: WeatherLocationReport = {
    ...destReport,
    address: destPlace.address,
    bmkg: destBmkg,
  };
  const bmkg = destBmkg ?? originBmkg ?? null;

  const maxRainProb = Math.max(
    ...origin.hourlyNext6.slice(0, 3).map((h) => h.rainProbPct),
    ...destination.hourlyNext6.slice(0, 3).map((h) => h.rainProbPct),
    0
  );
  const umbrellaRecommended =
    origin.isRaining || destination.isRaining || maxRainProb >= 50;

  const peakFeelsLike = Math.max(origin.feelsLikeC, destination.feelsLikeC);
  const heatAlert = peakFeelsLike >= 34;

  const parts: string[] = [];
  if (origin.isRaining && destination.isRaining) {
    parts.push(
      `Active rain at both ${origin.label} and ${destination.label} — bring umbrella & waterproof gear.`
    );
  } else if (destination.isRaining) {
    parts.push(
      `Dry at ${origin.label}, but currently raining at ${destination.label} (${destination.weatherLabel}). Pack an umbrella!`
    );
  } else if (origin.isRaining) {
    parts.push(
      `Currently raining at ${origin.label} (${origin.weatherLabel}); ${destination.label} is ${destination.weatherLabel.toLowerCase()}.`
    );
  } else if (maxRainProb >= 50) {
    parts.push(
      `High rain probability (${maxRainProb}%) over the next 3 hours along your route — pack an umbrella.`
    );
  } else {
    parts.push(
      `Clear commute conditions (${origin.weatherLabel} → ${destination.weatherLabel}, next 3h rain risk ${maxRainProb}%).`
    );
  }

  if (heatAlert) {
    parts.push(
      `Heat index feels like ${peakFeelsLike.toFixed(1)}°C (${classifyHeat(peakFeelsLike)}) — stay hydrated.`
    );
  }

  return {
    origin,
    destination,
    bmkg,
    advisory: parts.join(" "),
    umbrellaRecommended,
    heatAlert,
  };
}

export function isWeatherCacheStale(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): boolean {
  const k1 = `${originLat.toFixed(3)},${originLon.toFixed(3)}`;
  const k2 = `${destLat.toFixed(3)},${destLon.toFixed(3)}`;
  const c1 = weatherCache.getStale(k1);
  const c2 = weatherCache.getStale(k2);
  return !c1 || c1.isExpired || !c2 || c2.isExpired;
}
