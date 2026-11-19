import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  DEFAULT_HOME_PLACE,
  DEFAULT_PINNED_STATION_IDS,
  DEFAULT_WORKPLACES,
} from "../shared/defaults.js";
import type {
  CommuteDirection,
  CommuteRoute,
  PinnedStationBoard,
  PlaceProfile,
  RelayMessage,
  RelaySnapshotPayload,
  RelayStatus,
  RelayTickBoardUpdate,
  RelayTickLegUpdate,
  RouteModeOption,
  Station,
  SubscribePayload,
  WeatherBundle,
} from "../shared/types.js";
import {
  buildDoorToDoorRoute,
  getCatalog,
  getStationLiveBoard,
  isAnyTransitBoardStale,
  recomputeBoardFromCache,
  transitUpstreamState,
} from "./services/transit.js";
import {
  buildWeatherBundle,
  isWeatherCacheStale,
  weatherUpstreamState,
} from "./services/weather.js";
import { transJakartaService } from "./services/transjakarta.js";
import { getJakartaNow } from "./utils/time.js";

interface ClientState {
  ws: WebSocket;
  direction: CommuteDirection;
  homePlace: PlaceProfile;
  workPlace: PlaceProfile;
  routeOptionId: string;
  useAltStation: boolean;
  pinnedStationIds: string[];
  paused: boolean;
  lastOriginPlace: PlaceProfile | null;
  lastDestPlace: PlaceProfile | null;
  lastRoute: CommuteRoute | null;
  lastPinnedStations: Station[];
  isRefreshing: boolean;
}

const startedAtMs = Date.now();
const clients = new Set<ClientState>();

export function getConnectedClientsCount(): number {
  return clients.size;
}

export function getRelayUptimeSec(): number {
  return Math.floor((Date.now() - startedAtMs) / 1000);
}

function sendJson(ws: WebSocket, msg: RelayMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function buildRelayStatus(): RelayStatus {
  const now = getJakartaNow();
  return {
    connectedClients: clients.size,
    uptimeSec: getRelayUptimeSec(),
    serverTimeWib: now.formattedTime,
    jakartaHour: now.hour,
    dayType: now.dayType,
    upstream: {
      shiori: transitUpstreamState.shiori,
      openMeteo: weatherUpstreamState.openMeteo,
      bmkg: weatherUpstreamState.bmkg,
    },
    lastTransitSync: transitUpstreamState.lastSync,
    lastWeatherSync: weatherUpstreamState.lastSync,
  };
}

function resolveRouteOption(client: ClientState): RouteModeOption | null {
  const options = client.workPlace.routeOptions;
  if (!options || options.length === 0) return null;
  const byId = options.find((o) => o.id === client.routeOptionId);
  if (byId) return byId;
  if (client.useAltStation && options.length > 1) return options[1];
  return options[0];
}

async function buildAndSendSnapshot(client: ClientState): Promise<void> {
  if (client.isRefreshing) return;
  client.isRefreshing = true;

  try {
    const catalog = await getCatalog();
    const resolvedOption = resolveRouteOption(client);
    const activeRouteOptionId = resolvedOption?.id ?? client.routeOptionId;

    const originPlace =
      client.direction === "to-work" ? client.homePlace : client.workPlace;
    const destPlace =
      client.direction === "to-work" ? client.workPlace : client.homePlace;

    let homeStationId = catalog.stationMap.has(client.homePlace.stationId)
      ? client.homePlace.stationId
      : DEFAULT_HOME_PLACE.stationId;
    let workStationId = catalog.stationMap.has(client.workPlace.stationId)
      ? client.workPlace.stationId
      : DEFAULT_WORKPLACES[0].stationId;

    let routePromise: Promise<CommuteRoute | null>;
    if (resolvedOption?.kind === "LOCAL_DIRECT") {
      routePromise = buildDoorToDoorRoute(
        originPlace,
        destPlace,
        homeStationId,
        homeStationId
      ).catch(() => null);
    } else if (
      resolvedOption?.kind === "SHIORI_TRANSIT" &&
      resolvedOption.originStationId &&
      resolvedOption.destStationId
    ) {
      homeStationId = resolvedOption.originStationId;
      workStationId = resolvedOption.destStationId;
      const originStId =
        client.direction === "to-work"
          ? resolvedOption.originStationId
          : resolvedOption.destStationId;
      const destStId =
        client.direction === "to-work"
          ? resolvedOption.destStationId
          : (resolvedOption.returnDestStationId ??
            resolvedOption.originStationId);

      routePromise = buildDoorToDoorRoute(
        originPlace,
        destPlace,
        originStId,
        destStId
      ).catch(() => null);
    } else {
      const activeWorkStationId =
        client.useAltStation && client.workPlace.altStationId
          ? client.workPlace.altStationId
          : client.workPlace.stationId;
      workStationId = catalog.stationMap.has(activeWorkStationId)
        ? activeWorkStationId
        : DEFAULT_WORKPLACES[0].stationId;

      const originStId =
        client.direction === "to-work" ? homeStationId : workStationId;
      const destStId =
        client.direction === "to-work" ? workStationId : homeStationId;

      routePromise = buildDoorToDoorRoute(
        originPlace,
        destPlace,
        originStId,
        destStId
      ).catch(() => null);
    }

    const pinnedStations = client.pinnedStationIds
      .map((id) => catalog.stationMap.get(id))
      .filter((s): s is Station => Boolean(s));

    const [route, weather, pinnedBoards, tjBuses] = await Promise.all([
      routePromise,
      buildWeatherBundle(originPlace, destPlace).catch(
        (): WeatherBundle | null => null
      ),
      Promise.all(
        pinnedStations.map((st) =>
          getStationLiveBoard(st, { limit: 4 }).catch((): PinnedStationBoard => ({
            station: st,
            operator: st.operator,
            departures: [],
            density: { level: null, label: "Unknown", hour: getJakartaNow().hour },
            sourceLabel: "Unavailable",
            updatedAt: new Date().toISOString(),
          }))
        )
      ),
      transJakartaService.getRoute6DBuses().catch(() => []),
    ]);

    client.lastOriginPlace = originPlace;
    client.lastDestPlace = destPlace;
    client.lastRoute = route;
    client.lastPinnedStations = pinnedStations;

    const payload: RelaySnapshotPayload = {
      direction: client.direction,
      homeStationId,
      workStationId,
      activeWorkplaceId: client.workPlace.id,
      activeRouteOptionId,
      useAltStation: client.useAltStation,
      route,
      weather,
      pinnedBoards,
      tjBuses,
      relayStatus: buildRelayStatus(),
    };

    sendJson(client.ws, { type: "snapshot", data: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Relay snapshot failed";
    sendJson(client.ws, { type: "error", message });
  } finally {
    client.isRefreshing = false;
  }
}

async function sendTick(client: ClientState): Promise<void> {
  const now = getJakartaNow();
  const legUpdates: RelayTickLegUpdate[] = [];

  if (client.lastRoute) {
    client.lastRoute.legs.forEach((leg, legIndex) => {
      if (leg.type !== "RIDE") return;
      const recomputed = recomputeBoardFromCache(leg.from, {
        lineFilter: leg.line,
        headsignFilter: leg.headsign,
        limit: 4,
      });
      if (recomputed) {
        legUpdates.push({
          legIndex,
          departures: recomputed.departures,
        });
      }
    });
  }

  const boardUpdates: RelayTickBoardUpdate[] = [];
  for (const st of client.lastPinnedStations) {
    const recomputed = recomputeBoardFromCache(st, { limit: 4 });
    if (recomputed) {
      boardUpdates.push({
        stationId: st.id,
        departures: recomputed.departures,
      });
    }
  }

  const tjBuses = await transJakartaService.getRoute6DBuses().catch(() => []);

  sendJson(client.ws, {
    type: "tick",
    data: {
      serverTimeWib: now.formattedTime,
      jakartaHour: now.hour,
      uptimeSec: getRelayUptimeSec(),
      connectedClients: clients.size,
      legUpdates,
      boardUpdates,
      tjBuses,
    },
  });
}

let tickTimer: NodeJS.Timeout | null = null;

function ensureTickLoop(): void {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (clients.size === 0) {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      return;
    }

    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN || client.paused) continue;

      sendTick(client);

      if (!client.isRefreshing && client.lastOriginPlace && client.lastDestPlace) {
        const watchedStations: Station[] = [...client.lastPinnedStations];
        if (client.lastRoute) {
          for (const leg of client.lastRoute.legs) {
            if (leg.type === "RIDE") watchedStations.push(leg.from);
          }
        }
        const weatherExpired = isWeatherCacheStale(
          client.lastOriginPlace.latitude,
          client.lastOriginPlace.longitude,
          client.lastDestPlace.latitude,
          client.lastDestPlace.longitude
        );
        const transitExpired =
          watchedStations.length > 0 && isAnyTransitBoardStale(watchedStations);

        if (weatherExpired || transitExpired) {
          void buildAndSendSnapshot(client);
        }
      }
    }
  }, 1000);
}

function isValidPlaceProfile(p: unknown): p is PlaceProfile {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.label === "string" &&
    typeof obj.stationId === "string" &&
    typeof obj.latitude === "number" &&
    typeof obj.longitude === "number"
  );
}

export function attachRelay(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const now = getJakartaNow();
    const defaultWork = DEFAULT_WORKPLACES[0];
    const client: ClientState = {
      ws,
      direction: now.hour < 13 ? "to-work" : "to-home",
      homePlace: { ...DEFAULT_HOME_PLACE },
      workPlace: { ...defaultWork },
      routeOptionId: defaultWork.routeOptions?.[0]?.id ?? "krl-mrt-setiabudi",
      useAltStation: false,
      pinnedStationIds: [...DEFAULT_PINNED_STATION_IDS],
      paused: false,
      lastOriginPlace: null,
      lastDestPlace: null,
      lastRoute: null,
      lastPinnedStations: [],
      isRefreshing: false,
    };

    clients.add(client);
    ensureTickLoop();

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as SubscribePayload;
        if (msg.direction === "to-work" || msg.direction === "to-home") {
          client.direction = msg.direction;
        }
        if (isValidPlaceProfile(msg.homePlace)) {
          client.homePlace = msg.homePlace;
        } else if (typeof msg.homeStationId === "string" && msg.homeStationId.trim()) {
          client.homePlace = {
            ...client.homePlace,
            stationId: msg.homeStationId.trim(),
          };
        }

        if (isValidPlaceProfile(msg.workPlace)) {
          client.workPlace = msg.workPlace;
        } else if (typeof msg.workStationId === "string" && msg.workStationId.trim()) {
          client.workPlace = {
            ...client.workPlace,
            stationId: msg.workStationId.trim(),
          };
        }

        if (typeof msg.routeOptionId === "string" && msg.routeOptionId.trim()) {
          client.routeOptionId = msg.routeOptionId.trim();
        }
        if (typeof msg.useAltStation === "boolean") {
          client.useAltStation = msg.useAltStation;
        }

        if (Array.isArray(msg.pinnedStationIds)) {
          client.pinnedStationIds = msg.pinnedStationIds
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
            .slice(0, 6);
        }

        if (msg.type === "pause") {
          client.paused = true;
          return;
        }
        if (msg.type === "resume") {
          client.paused = false;
          sendTick(client);
          return;
        }
        if (typeof msg.paused === "boolean") {
          client.paused = msg.paused;
        }

        if (msg.type === "subscribe" || msg.type === "refresh") {
          void buildAndSendSnapshot(client);
        }
      } catch {
        sendJson(ws, { type: "error", message: "Invalid relay command payload" });
      }
    });

    ws.on("close", () => {
      clients.delete(client);
    });

    ws.on("error", () => {
      clients.delete(client);
    });
  });

  return wss;
}
