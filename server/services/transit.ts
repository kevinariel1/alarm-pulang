import type {
  CommuteLeg,
  CommuteRoute,
  CrowdDensity,
  DepartureItem,
  DepartureStatus,
  FareSegment,
  LineInfo,
  OperatorCode,
  PinnedStationBoard,
  PlaceProfile,
  Station,
} from "../../shared/types.js";
import { fetchJsonWithTimeout, TtlCache } from "../utils/cache.js";
import { getJakartaNow, secondsUntilDeparture } from "../utils/time.js";
import { buildRailLegPath } from "./trackShapes.js";

const SHIORI_BASE = "https://api.commute.shiorilabs.id";
const COMULINE_BASE = "https://api.comuline.com";
const TARGET_OPERATORS: OperatorCode[] = ["KCI", "MRTJ"];

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ROUTE_TTL_MS = 60 * 60 * 1000; // 1 hour
const BOARD_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const transitUpstreamState = {
  shiori: "ok" as "ok" | "degraded",
  lastSync: null as string | null,
};

interface ShioriOperatorsRes {
  data: Array<{
    code: string;
    name: string;
    lines: Array<{
      name: string;
      colorCode: string;
      lineCode: string;
      mode: string;
    }>;
  }>;
}

interface ShioriStationsRes {
  data: Array<{
    id: string;
    code: string;
    name: string;
    officialName: string;
    operator: string;
    lines: string[];
    latitude: number;
    longitude: number;
  }>;
}

interface ShioriGroupedTimetableRes {
  data: Array<{
    line: string;
    timetable: Array<{
      key: string;
      label: string[];
      platformCode: string | null;
      destinations: Array<{
        boundFor: string;
        via: string | null;
        schedules: Array<{
          tripNumber: string;
          estimatedDeparture: string;
          boundFor: string;
          lineCode: string;
        }>;
      }>;
    }>;
  }>;
}

interface ShioriDensityRes {
  data?: {
    day?: string;
    hours?: Array<{
      hour: number;
      level: { min: number; max: number } | null;
    }>;
  };
}

interface ShioriFareRes {
  data?: {
    from: { id: string; name: string };
    to: { id: string; name: string };
    legs: Array<{
      type: "RIDE" | "TRANSFER";
      operator?: string;
      line?: string;
      from: { id: string; name: string };
      to: { id: string; name: string };
      headsign?: string;
      platformCode?: string | null;
      stationCount?: number;
      stops?: Array<{ id: string; name: string }>;
      distanceM?: number;
    }>;
    segments: Array<{
      operator: string;
      from: { id: string; name: string };
      to: { id: string; name: string };
      fare: number;
    }>;
    totalFare: number;
    totalDistanceM: number;
    transferCount: number;
  };
}

interface ComulineScheduleRes {
  data?: Array<{
    train_id: string;
    line: string;
    route: string;
    departs_at: string;
  }>;
}

export interface CatalogData {
  stations: Station[];
  stationMap: Map<string, Station>;
  lines: Map<string, LineInfo>;
}

interface RawBoardCache {
  departures: Array<{
    tripNumber: string;
    lineKey: string;
    lineCode: string;
    lineColor: string;
    boundFor: string;
    branchLabels: string[];
    platformCode: string | null;
    departureTime: string;
  }>;
  densityHours: Array<{ hour: number; level: { min: number; max: number } | null }>;
  sourceLabel: string;
  updatedAt: string;
}

const catalogCache = new TtlCache<CatalogData>(CATALOG_TTL_MS);
const routeCache = new TtlCache<ShioriFareRes["data"] | null>(ROUTE_TTL_MS);
const boardCache = new TtlCache<RawBoardCache>(BOARD_TTL_MS);
const walkPathCache = new TtlCache<{
  distanceM: number;
  path: [number, number][];
} | null>(24 * 60 * 60 * 1000);

interface OsrmRouteRes {
  routes?: Array<{
    distance?: number;
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
  }>;
}

async function fetchWalkingPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  waypoints?: Array<[number, number]>,
  walkMode?: "direct" | "osrm"
): Promise<{ distanceM: number; path: [number, number][] }> {
  // If user explicitly configured direct waypoints or direct mode, build piecewise path
  if (walkMode === "direct" && waypoints && waypoints.length > 0) {
    const fullPoints: Array<[number, number]> = [[lat1, lon1], ...waypoints, [lat2, lon2]];
    let totalMeters = 0;
    for (let i = 0; i < fullPoints.length - 1; i++) {
      totalMeters += haversineMeters(
        fullPoints[i][0],
        fullPoints[i][1],
        fullPoints[i + 1][0],
        fullPoints[i + 1][1]
      );
    }
    return {
      distanceM: Math.round(totalMeters),
      path: fullPoints,
    };
  }

  // If waypoints exist for OSRM routing, chain them through OSRM
  const wpStr =
    waypoints && waypoints.length > 0
      ? waypoints.map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(";")
      : "";
  const routePointsStr = wpStr
    ? `${lon1.toFixed(5)},${lat1.toFixed(5)};${wpStr};${lon2.toFixed(5)},${lat2.toFixed(5)}`
    : `${lon1.toFixed(5)},${lat1.toFixed(5)};${lon2.toFixed(5)},${lat2.toFixed(5)}`;

  const key = `${lat1.toFixed(5)},${lon1.toFixed(5)}->${lat2.toFixed(5)},${lon2.toFixed(5)}[${wpStr}][${walkMode ?? ""}]`;

  const cached = await walkPathCache.getOrLoad(key, async () => {
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${routePointsStr}?overview=full&geometries=geojson`;
      const res = await fetchJsonWithTimeout<OsrmRouteRes>(url, 4000);
      const r = res.routes?.[0];
      const coords = r?.geometry?.coordinates;
      if (!r || !coords || coords.length < 2) return null;
      return {
        distanceM: Math.round(r.distance ?? haversineMeters(lat1, lon1, lat2, lon2)),
        path: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
      };
    } catch {
      return null;
    }
  });

  if (cached) return cached;

  // Fallback if OSRM is offline or no route found
  if (waypoints && waypoints.length > 0) {
    const fullPoints: Array<[number, number]> = [[lat1, lon1], ...waypoints, [lat2, lon2]];
    let totalMeters = 0;
    for (let i = 0; i < fullPoints.length - 1; i++) {
      totalMeters += haversineMeters(
        fullPoints[i][0],
        fullPoints[i][1],
        fullPoints[i + 1][0],
        fullPoints[i + 1][1]
      );
    }
    return {
      distanceM: Math.round(totalMeters),
      path: fullPoints,
    };
  }

  return {
    distanceM: haversineMeters(lat1, lon1, lat2, lon2),
    path: [
      [lat1, lon1],
      [lat2, lon2],
    ],
  };
}

export async function getCatalog(): Promise<CatalogData> {
  return catalogCache.getOrLoad("catalog", async () => {
    try {
      const [opsRes, ...stationLists] = await Promise.all([
        fetchJsonWithTimeout<ShioriOperatorsRes>(`${SHIORI_BASE}/operators`, 10000),
        ...TARGET_OPERATORS.map((op) =>
          fetchJsonWithTimeout<ShioriStationsRes>(`${SHIORI_BASE}/stations/${op}`, 10000)
        ),
      ]);

      const lines = new Map<string, LineInfo>();
      for (const op of opsRes.data ?? []) {
        if (!TARGET_OPERATORS.includes(op.code as OperatorCode)) continue;
        for (const l of op.lines ?? []) {
          const lineKey = `${op.code}:${l.lineCode}`;
          lines.set(lineKey, {
            code: l.lineCode,
            operator: op.code as OperatorCode,
            name: l.name,
            colorCode: l.colorCode,
            mode: l.mode,
          });
        }
      }

      const stations: Station[] = [];
      const stationMap = new Map<string, Station>();
      for (const list of stationLists) {
        for (const s of list.data ?? []) {
          const station: Station = {
            id: s.id,
            code: s.code,
            name: s.name,
            officialName: s.officialName || s.name,
            operator: s.operator as OperatorCode,
            lines: s.lines ?? [],
            latitude: s.latitude,
            longitude: s.longitude,
          };
          stations.push(station);
          stationMap.set(station.id, station);
        }
      }

      transitUpstreamState.shiori = "ok";
      transitUpstreamState.lastSync = new Date().toISOString();
      return { stations, stationMap, lines };
    } catch (err) {
      transitUpstreamState.shiori = "degraded";
      throw err;
    }
  });
}

function getLineColor(lines: Map<string, LineInfo>, lineKey?: string): string {
  if (!lineKey) return "#38BDF8";
  return lines.get(lineKey)?.colorCode ?? "#38BDF8";
}

function getLineName(lines: Map<string, LineInfo>, lineKey?: string): string | undefined {
  if (!lineKey) return undefined;
  return lines.get(lineKey)?.name;
}

function resolveDensity(
  hours: Array<{ hour: number; level: { min: number; max: number } | null }>,
  jakartaHour: number
): CrowdDensity {
  const match = hours.find((h) => h.hour === jakartaHour);
  const rawMax = match?.level?.max ?? null;
  if (rawMax === null || rawMax === undefined) {
    return { level: null, label: "Unknown", hour: jakartaHour };
  }
  const clamped = Math.max(0, Math.min(3, Math.round(rawMax))) as 0 | 1 | 2 | 3;
  const labels: Record<0 | 1 | 2 | 3, CrowdDensity["label"]> = {
    0: "Quiet",
    1: "Light",
    2: "Moderate",
    3: "Crowded",
  };
  return { level: clamped, label: labels[clamped], hour: jakartaHour };
}

function computeStatus(secondsUntil: number): DepartureStatus {
  if (secondsUntil <= 90) return "BOARDING";
  if (secondsUntil <= 300) return "APPROACHING";
  return "UPCOMING";
}

async function fetchComulineFallback(
  stationCode: string,
  lines: Map<string, LineInfo>
): Promise<RawBoardCache["departures"]> {
  const res = await fetchJsonWithTimeout<ComulineScheduleRes>(
    `${COMULINE_BASE}/v1/schedule/${encodeURIComponent(stationCode)}`,
    8000
  );
  const out: RawBoardCache["departures"] = [];
  for (const row of res.data ?? []) {
    const dt = new Date(row.departs_at);
    if (Number.isNaN(dt.getTime())) continue;
    const wibTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(dt);
    const routeParts = (row.route ?? "").split("-");
    const boundFor = routeParts[routeParts.length - 1] || row.route || "Commuter Line";
    const lineCode = row.line.includes("BOGOR")
      ? "B"
      : row.line.includes("CIKARANG")
        ? "C"
        : row.line.includes("RANGKAS")
          ? "R"
          : row.line.includes("TANGERANG")
            ? "T"
            : "TP";
    const lineKey = `KCI:${lineCode}`;
    out.push({
      tripNumber: row.train_id,
      lineKey,
      lineCode,
      lineColor: getLineColor(lines, lineKey),
      boundFor,
      branchLabels: [boundFor],
      platformCode: null,
      departureTime: wibTime,
    });
  }
  return out;
}

async function loadRawStationBoard(
  station: Station,
  lines: Map<string, LineInfo>
): Promise<RawBoardCache> {
  const cacheKey = `${station.operator}:${station.code}`;
  return boardCache.getOrLoad(cacheKey, async () => {
    const densityPromise = fetchJsonWithTimeout<ShioriDensityRes>(
      `${SHIORI_BASE}/stations/${station.operator}/${station.code}/density`,
      8000
    ).catch(() => ({ data: { hours: [] } }));

    let departures: RawBoardCache["departures"] = [];
    const sourceLabel = "Timetable-Synced · Shiori Labs";

    try {
      const [ttRes, densityRes] = await Promise.all([
        fetchJsonWithTimeout<ShioriGroupedTimetableRes>(
          `${SHIORI_BASE}/stations/${station.operator}/${station.code}/timetable/grouped`,
          9000
        ),
        densityPromise,
      ]);

      for (const lineGroup of ttRes.data ?? []) {
        const lineKey = lineGroup.line;
        const lineColor = getLineColor(lines, lineKey);
        for (const branch of lineGroup.timetable ?? []) {
          const branchLabels = branch.label ?? [];
          for (const dest of branch.destinations ?? []) {
            for (const sched of dest.schedules ?? []) {
              departures.push({
                tripNumber: sched.tripNumber,
                lineKey,
                lineCode: sched.lineCode,
                lineColor,
                boundFor: sched.boundFor || dest.boundFor,
                branchLabels,
                platformCode: branch.platformCode ?? null,
                departureTime: sched.estimatedDeparture,
              });
            }
          }
        }
      }

      transitUpstreamState.shiori = "ok";
      transitUpstreamState.lastSync = new Date().toISOString();

      return {
        departures,
        densityHours: densityRes.data?.hours ?? [],
        sourceLabel,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      transitUpstreamState.shiori = "degraded";
      if (station.operator === "KCI") {
        departures = await fetchComulineFallback(station.code, lines);
        const densityRes = await densityPromise;
        return {
          departures,
          densityHours: densityRes.data?.hours ?? [],
          sourceLabel: "Timetable Fallback · Comuline",
          updatedAt: new Date().toISOString(),
        };
      }
      throw err;
    }
  });
}

export function buildUpcomingDepartures(
  rawDepartures: RawBoardCache["departures"],
  nowSec: number,
  options?: { lineFilter?: string; headsignFilter?: string; limit?: number }
): DepartureItem[] {
  let pool = rawDepartures;

  if (options?.lineFilter) {
    const byLine = pool.filter((d) => d.lineKey === options.lineFilter);
    if (byLine.length > 0) pool = byLine;
  }

  if (options?.headsignFilter) {
    const needle = options.headsignFilter.trim().toLowerCase();
    const byHeadsign = pool.filter(
      (d) =>
        d.boundFor.toLowerCase().includes(needle) ||
        d.branchLabels.some((lbl) => lbl.toLowerCase().includes(needle))
    );
    if (byHeadsign.length > 0) pool = byHeadsign;
  }

  const limit = options?.limit ?? 6;
  const computed: DepartureItem[] = pool.map((d) => {
    const sec = secondsUntilDeparture(d.departureTime, nowSec);
    return {
      tripNumber: d.tripNumber,
      lineCode: d.lineCode,
      lineColor: d.lineColor,
      boundFor: d.boundFor,
      platformCode: d.platformCode,
      departureTime: d.departureTime,
      secondsUntil: sec,
      status: computeStatus(sec),
    };
  });

  const seen = new Set<string>();
  const unique: DepartureItem[] = [];
  for (const item of computed.sort((a, b) => a.secondsUntil - b.secondsUntil)) {
    const key = `${item.tripNumber}-${item.departureTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

export async function getStationLiveBoard(
  station: Station,
  options?: { lineFilter?: string; headsignFilter?: string; limit?: number }
): Promise<PinnedStationBoard> {
  const catalog = await getCatalog();
  const raw = await loadRawStationBoard(station, catalog.lines);
  const now = getJakartaNow();

  return {
    station,
    operator: station.operator,
    departures: buildUpcomingDepartures(raw.departures, now.totalSeconds, options),
    density: resolveDensity(raw.densityHours, now.hour),
    sourceLabel: raw.sourceLabel,
    updatedAt: raw.updatedAt,
  };
}

export async function getMultiModalRoute(
  fromId: string,
  toId: string
): Promise<CommuteRoute | null> {
  if (fromId === toId) return null;
  const catalog = await getCatalog();
  const fromStation = catalog.stationMap.get(fromId);
  const toStation = catalog.stationMap.get(toId);
  if (!fromStation || !toStation) return null;

  const fareData = await routeCache.getOrLoad(`${fromId}->${toId}`, async () => {
    try {
      const res = await fetchJsonWithTimeout<ShioriFareRes>(
        `${SHIORI_BASE}/fares/${encodeURIComponent(fromId)}/${encodeURIComponent(toId)}`,
        10000
      );
      transitUpstreamState.shiori = "ok";
      transitUpstreamState.lastSync = new Date().toISOString();
      return res.data ?? null;
    } catch {
      return null;
    }
  });

  if (!fareData) return null;

  const resolveStation = (ref: { id: string; name: string }): Station => {
    const found = catalog.stationMap.get(ref.id);
    if (found) return found;
    const prefix = ref.id.split("-")[0] as OperatorCode;
    return {
      id: ref.id,
      code: ref.id.split("-")[1] ?? ref.id,
      name: ref.name,
      officialName: ref.name,
      operator: TARGET_OPERATORS.includes(prefix) ? prefix : "KCI",
      lines: [],
      latitude: fromStation.latitude,
      longitude: fromStation.longitude,
    };
  };

  const legs: CommuteLeg[] = await Promise.all(
    (fareData.legs ?? []).map(async (leg) => {
      const legFrom = resolveStation(leg.from);
      const legTo = resolveStation(leg.to);

      if (leg.type === "TRANSFER") {
        const walked = await fetchWalkingPath(
          legFrom.latitude,
          legFrom.longitude,
          legTo.latitude,
          legTo.longitude
        );
        const distM = leg.distanceM && leg.distanceM > 0 ? leg.distanceM : walked.distanceM;
        const walkMin = Math.max(2, Math.round(distM / 75));
        return {
          type: "TRANSFER",
          from: legFrom,
          to: legTo,
          distanceM: distM,
          path: walked.path,
          estimatedMinutes: walkMin,
        };
      }

      const op = (leg.operator as OperatorCode) ?? legFrom.operator;
      const lineColor = getLineColor(catalog.lines, leg.line);
      const lineName = getLineName(catalog.lines, leg.line);
      const stops = (leg.stops ?? []).map(resolveStation);
      const railPath = buildRailLegPath(legFrom.id, legTo.id, stops);

      const board = await getStationLiveBoard(legFrom, {
        lineFilter: leg.line,
        headsignFilter: leg.headsign,
        limit: 4,
      }).catch(() => null);

      const avgSpeedMPerMin = op === "KCI" ? 650 : 700;
      const estMin = Math.max(
        3,
        Math.round((leg.distanceM ?? (leg.stationCount ?? 3) * 1200) / avgSpeedMPerMin)
      );

      return {
        type: "RIDE",
        operator: op,
        line: leg.line,
        lineName,
        lineColor,
        from: legFrom,
        to: legTo,
        headsign: leg.headsign,
        platformCode: leg.platformCode ?? board?.departures[0]?.platformCode ?? null,
        stationCount: leg.stationCount,
        distanceM: leg.distanceM,
        stops,
        path: railPath ?? undefined,
        departures: board?.departures ?? [],
        density: board?.density,
        estimatedMinutes: estMin,
      };
    })
  );

  const segments: FareSegment[] = (fareData.segments ?? []).map((s) => ({
    operator: s.operator,
    fromName: s.from.name,
    toName: s.to.name,
    fare: s.fare,
  }));

  const estimatedTotalMinutes = legs.reduce(
    (sum, l) => sum + (l.estimatedMinutes ?? 0),
    0
  );

  return {
    from: fromStation,
    to: toStation,
    legs,
    segments,
    totalFare: fareData.totalFare ?? 0,
    totalDistanceM: fareData.totalDistanceM ?? 0,
    transferCount: fareData.transferCount ?? 0,
    estimatedTotalMinutes,
    sourceLabel: "Rail Multi-Modal · Shiori Labs",
    updatedAt: new Date().toISOString(),
  };
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function placeToSyntheticStation(place: PlaceProfile): Station {
  return {
    id: `PLACE-${place.id}`,
    code: place.shortLabel,
    name: place.shortLabel,
    officialName: place.label,
    operator: "KCI",
    lines: [],
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

export async function buildDoorToDoorRoute(
  originPlace: PlaceProfile,
  destPlace: PlaceProfile,
  originStationId: string,
  destStationId: string
): Promise<CommuteRoute | null> {
  const originPoint = placeToSyntheticStation(originPlace);
  const destPoint = placeToSyntheticStation(destPlace);

  if (originStationId === destStationId) {
    const waypoints = originPlace.walkWaypoints ?? destPlace.walkWaypoints;
    const walkMode = originPlace.walkMode ?? destPlace.walkMode ?? "osrm";
    const walked = await fetchWalkingPath(
      originPlace.latitude,
      originPlace.longitude,
      destPlace.latitude,
      destPlace.longitude,
      waypoints,
      walkMode
    );
    const roadM = walked.distanceM;
    const walkMin = Math.max(4, Math.round(roadM / 75));
    const directLeg: CommuteLeg = {
      type: "TRANSFER",
      from: originPoint,
      to: destPoint,
      distanceM: roadM,
      path: walked.path,
      estimatedMinutes: walkMin,
      note: `Neighborhood route (${(roadM / 1000).toFixed(1)} km) — walk (~${walkMin} min) or ojol (~4 min). Check rain sensor above before walking!`,
    };
    return {
      from: originPoint,
      to: destPoint,
      originPlace,
      destPlace,
      isLocalDirect: true,
      legs: [directLeg],
      segments: [],
      totalFare: 0,
      totalDistanceM: roadM,
      transferCount: 0,
      estimatedTotalMinutes: walkMin,
      sourceLabel:
        walkMode === "direct" && waypoints && waypoints.length > 0
          ? "Door-to-Door Local · Custom Alley Waypoints"
          : "Door-to-Door Local · Road-Routed (OSRM)",
      updatedAt: new Date().toISOString(),
    };
  }

  const baseRoute = await getMultiModalRoute(originStationId, destStationId);
  if (!baseRoute) return null;

  const firstStraight = haversineMeters(
    originPlace.latitude,
    originPlace.longitude,
    baseRoute.from.latitude,
    baseRoute.from.longitude
  );
  const lastStraight = haversineMeters(
    baseRoute.to.latitude,
    baseRoute.to.longitude,
    destPlace.latitude,
    destPlace.longitude
  );

  const originWp = originPlace.walkWaypoints;
  const originMode = originPlace.walkMode ?? "osrm";
  const destWp = destPlace.walkWaypoints
    ? [...destPlace.walkWaypoints].reverse()
    : undefined;
  const destMode = destPlace.walkMode ?? "osrm";

  const [firstWalk, lastWalk] = await Promise.all([
    firstStraight > 40
      ? fetchWalkingPath(
          originPlace.latitude,
          originPlace.longitude,
          baseRoute.from.latitude,
          baseRoute.from.longitude,
          originWp,
          originMode
        )
      : Promise.resolve(null),
    lastStraight > 40
      ? fetchWalkingPath(
          baseRoute.to.latitude,
          baseRoute.to.longitude,
          destPlace.latitude,
          destPlace.longitude,
          destWp,
          destMode
        )
      : Promise.resolve(null),
  ]);

  const enrichedLegs: CommuteLeg[] = [];
  let extraMeters = 0;
  let extraMinutes = 0;

  if (firstWalk) {
    const walkMin = Math.max(2, Math.round(firstWalk.distanceM / 75));
    extraMeters += firstWalk.distanceM;
    extraMinutes += walkMin;
    enrichedLegs.push({
      type: "TRANSFER",
      from: originPoint,
      to: baseRoute.from,
      distanceM: firstWalk.distanceM,
      path: firstWalk.path,
      estimatedMinutes: walkMin,
      note: `First-mile walk from ${originPlace.shortLabel} to ${baseRoute.from.name}`,
    });
  }

  enrichedLegs.push(...baseRoute.legs);

  if (lastWalk) {
    const walkMin = Math.max(2, Math.round(lastWalk.distanceM / 75));
    extraMeters += lastWalk.distanceM;
    extraMinutes += walkMin;
    enrichedLegs.push({
      type: "TRANSFER",
      from: baseRoute.to,
      to: destPoint,
      distanceM: lastWalk.distanceM,
      path: lastWalk.path,
      estimatedMinutes: walkMin,
      note: `Last-mile walk from ${baseRoute.to.name} to ${destPlace.shortLabel}`,
    });
  }

  return {
    ...baseRoute,
    originPlace,
    destPlace,
    isLocalDirect: false,
    legs: enrichedLegs,
    totalDistanceM: baseRoute.totalDistanceM + extraMeters,
    estimatedTotalMinutes: baseRoute.estimatedTotalMinutes + extraMinutes,
  };
}

export function recomputeBoardFromCache(
  station: Station,
  options?: { lineFilter?: string; headsignFilter?: string; limit?: number }
): { departures: DepartureItem[] } | null {
  const cached = boardCache.getStale(`${station.operator}:${station.code}`);
  if (!cached) return null;
  const now = getJakartaNow();
  return {
    departures: buildUpcomingDepartures(cached.value.departures, now.totalSeconds, options),
  };
}

export function isAnyTransitBoardStale(stations: Station[]): boolean {
  for (const s of stations) {
    const entry = boardCache.getStale(`${s.operator}:${s.code}`);
    if (!entry || entry.isExpired) return true;
  }
  return false;
}
