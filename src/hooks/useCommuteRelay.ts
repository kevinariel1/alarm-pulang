import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_HOME_PLACE,
  DEFAULT_PINNED_STATION_IDS,
  DEFAULT_WORKPLACES,
} from "../../shared/defaults";
import type {
  CommuteDirection,
  PlaceProfile,
  RelayMessage,
  RelaySnapshotPayload,
  Station,
  SubscribePayload,
} from "../../shared/types";

export interface CommuteConfig {
  home: PlaceProfile;
  workplaces: PlaceProfile[];
  activeWorkplaceId: string;
  routeOptionId: string;
  useAltStation: boolean;
  pinnedStationIds: string[];
}

export type ConnectionState = "connecting" | "live" | "paused" | "reconnecting";

const CONFIG_STORAGE_KEY = "jkt_commute_config_v5";

export const DEFAULT_CONFIG: CommuteConfig = {
  home: DEFAULT_HOME_PLACE,
  workplaces: DEFAULT_WORKPLACES,
  activeWorkplaceId: DEFAULT_WORKPLACES[0].id,
  routeOptionId:
    DEFAULT_WORKPLACES[0].routeOptions?.[0]?.id ?? "krl-mrt-setiabudi",
  useAltStation: false,
  pinnedStationIds: DEFAULT_PINNED_STATION_IDS,
};

function getInitialJakartaDirection(): CommuteDirection {
  try {
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false,
    }).format(new Date());
    const hr = Number.parseInt(hourStr, 10) % 24;
    return hr < 13 ? "to-work" : "to-home";
  } catch {
    return "to-work";
  }
}

function loadStoredConfig(): CommuteConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<CommuteConfig>;
    const workplaces =
      Array.isArray(parsed.workplaces) && parsed.workplaces.length > 0
        ? parsed.workplaces
        : DEFAULT_CONFIG.workplaces;
    const activeWp =
      workplaces.find((w) => w.id === parsed.activeWorkplaceId) ??
      workplaces[0];
    const defaultOpt = activeWp.routeOptions?.[0]?.id ?? "";
    const routeOptionId =
      typeof parsed.routeOptionId === "string" &&
      (!activeWp.routeOptions ||
        activeWp.routeOptions.some((o) => o.id === parsed.routeOptionId))
        ? parsed.routeOptionId
        : defaultOpt;

    return {
      home: parsed.home?.stationId ? parsed.home : DEFAULT_CONFIG.home,
      workplaces,
      activeWorkplaceId: activeWp.id,
      routeOptionId,
      useAltStation: Boolean(parsed.useAltStation),
      pinnedStationIds:
        Array.isArray(parsed.pinnedStationIds) &&
        parsed.pinnedStationIds.length > 0
          ? parsed.pinnedStationIds.slice(0, 6)
          : DEFAULT_CONFIG.pinnedStationIds,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveStoredConfig(next: CommuteConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function useCommuteRelay() {
  const [config, setConfig] = useState<CommuteConfig>(() => loadStoredConfig());
  const [direction, setDirectionState] = useState<CommuteDirection>(() =>
    getInitialJakartaDirection()
  );
  const [paused, setPaused] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [snapshot, setSnapshot] = useState<RelaySnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const activeWorkplace = useMemo(
    () =>
      config.workplaces.find((w) => w.id === config.activeWorkplaceId) ??
      config.workplaces[0],
    [config.workplaces, config.activeWorkplaceId]
  );

  const latestParamsRef = useRef({ config, activeWorkplace, direction, paused });
  latestParamsRef.current = { config, activeWorkplace, direction, paused };

  const sendPayload = useCallback((payload: SubscribePayload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const buildSubscribeMsg = useCallback(
    (
      type: "subscribe" | "refresh",
      nextCfg: CommuteConfig,
      nextDir: CommuteDirection,
      includePaused?: boolean
    ): SubscribePayload => {
      const wp =
        nextCfg.workplaces.find((w) => w.id === nextCfg.activeWorkplaceId) ??
        nextCfg.workplaces[0];
      return {
        type,
        direction: nextDir,
        homePlace: nextCfg.home,
        workPlace: wp,
        routeOptionId: nextCfg.routeOptionId,
        useAltStation: nextCfg.useAltStation,
        pinnedStationIds: nextCfg.pinnedStationIds,
        ...(includePaused !== undefined ? { paused: includePaused } : {}),
      };
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setStationsLoading(true);
    fetch("/api/stations")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: { stations?: Station[] }) => {
        if (!cancelled && Array.isArray(json.stations)) {
          setStations(json.stations);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load station directory"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    const connect = () => {
      if (unmountedRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        const cur = latestParamsRef.current;
        setConnectionState(cur.paused ? "paused" : "live");
        setError(null);
        ws.send(
          JSON.stringify(
            buildSubscribeMsg("subscribe", cur.config, cur.direction, cur.paused)
          )
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as RelayMessage;
          if (msg.type === "snapshot") {
            setSnapshot(msg.data);
            setError(null);
          } else if (msg.type === "tick") {
            setSnapshot((prev) => {
              if (!prev) return prev;
              const legMap = new Map(
                msg.data.legUpdates.map((u) => [u.legIndex, u])
              );
              const boardMap = new Map(
                msg.data.boardUpdates.map((b) => [b.stationId, b])
              );

              const nextRoute = prev.route
                ? {
                    ...prev.route,
                    legs: prev.route.legs.map((leg, idx) => {
                      const upd = legMap.get(idx);
                      if (!upd) return leg;
                      return {
                        ...leg,
                        departures: upd.departures ?? leg.departures,
                      };
                    }),
                  }
                : null;

              const nextBoards = prev.pinnedBoards.map((board) => {
                const upd = boardMap.get(board.station.id);
                if (!upd) return board;
                return {
                  ...board,
                  departures: upd.departures,
                };
              });

              return {
                ...prev,
                route: nextRoute,
                pinnedBoards: nextBoards,
                tjBuses: msg.data.tjBuses ?? prev.tjBuses,
                relayStatus: {
                  ...prev.relayStatus,
                  serverTimeWib: msg.data.serverTimeWib,
                  jakartaHour: msg.data.jakartaHour,
                  uptimeSec: msg.data.uptimeSec,
                  connectedClients: msg.data.connectedClients,
                },
              };
            });
          } else if (msg.type === "error") {
            setError(msg.message);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnectionState("reconnecting");
        const delay = Math.min(15000, 1000 * Math.pow(2, attemptRef.current));
        attemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [buildSubscribeMsg]);

  const setDirection = useCallback(
    (nextDir: CommuteDirection) => {
      setDirectionState(nextDir);
      sendPayload(
        buildSubscribeMsg("subscribe", latestParamsRef.current.config, nextDir)
      );
    },
    [buildSubscribeMsg, sendPayload]
  );

  const updateConfig = useCallback(
    (next: CommuteConfig) => {
      setConfig(next);
      saveStoredConfig(next);
      sendPayload(
        buildSubscribeMsg("subscribe", next, latestParamsRef.current.direction)
      );
    },
    [buildSubscribeMsg, sendPayload]
  );

  const setActiveWorkplaceId = useCallback(
    (workplaceId: string) => {
      const curCfg = latestParamsRef.current.config;
      const targetWp =
        curCfg.workplaces.find((w) => w.id === workplaceId) ??
        curCfg.workplaces[0];
      const next: CommuteConfig = {
        ...curCfg,
        activeWorkplaceId: workplaceId,
        routeOptionId: targetWp.routeOptions?.[0]?.id ?? "",
        useAltStation: false,
      };
      setConfig(next);
      saveStoredConfig(next);
      sendPayload(
        buildSubscribeMsg("subscribe", next, latestParamsRef.current.direction)
      );
    },
    [buildSubscribeMsg, sendPayload]
  );

  const setRouteOptionId = useCallback(
    (routeOptionId: string) => {
      const next: CommuteConfig = {
        ...latestParamsRef.current.config,
        routeOptionId,
        useAltStation: false,
      };
      setConfig(next);
      saveStoredConfig(next);
      sendPayload(
        buildSubscribeMsg("subscribe", next, latestParamsRef.current.direction)
      );
    },
    [buildSubscribeMsg, sendPayload]
  );

  const setUseAltStation = useCallback(
    (val: boolean) => {
      const next: CommuteConfig = {
        ...latestParamsRef.current.config,
        useAltStation: val,
      };
      setConfig(next);
      saveStoredConfig(next);
      sendPayload(
        buildSubscribeMsg("subscribe", next, latestParamsRef.current.direction)
      );
    },
    [buildSubscribeMsg, sendPayload]
  );

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      setConnectionState(
        wsRef.current?.readyState === WebSocket.OPEN
          ? next
            ? "paused"
            : "live"
          : "reconnecting"
      );
      sendPayload({ type: next ? "pause" : "resume" });
      return next;
    });
  }, [sendPayload]);

  const manualRefresh = useCallback(() => {
    const cur = latestParamsRef.current;
    sendPayload(buildSubscribeMsg("refresh", cur.config, cur.direction));
  }, [buildSubscribeMsg, sendPayload]);

  return {
    config,
    activeWorkplace,
    direction,
    paused,
    connectionState,
    snapshot,
    error,
    stations,
    stationsLoading,
    setDirection,
    setActiveWorkplaceId,
    setRouteOptionId,
    setUseAltStation,
    updateConfig,
    togglePause,
    manualRefresh,
  };
}
