export type OperatorCode = "KCI" | "MRTJ" | "TJ";

export type CommuteDirection = "to-work" | "to-home";

export interface TJBusLive {
  busNo: string;
  routeCode: string;
  routeName: string;
  type: string;
  latitude: number;
  longitude: number;
  speed: number;
  bearing: number;
  nextStop: string | null;
  etaNextStop: string | number | null;
  timestamp: string;
}

export interface RouteModeOption {
  id: string;
  label: string;
  badge: "KRL+MRT" | "LOCAL" | "KRL";
  kind: "SHIORI_TRANSIT" | "LOCAL_DIRECT";
  originStationId?: string;
  destStationId?: string;
  returnDestStationId?: string;
  fareHint?: string;
}

export interface PlaceProfile {
  id: string;
  label: string;
  shortLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  bmkgAdm4?: string;
  stationId: string;
  altStationId?: string;
  primaryRouteLabel?: string;
  altRouteLabel?: string;
  routeOptions?: RouteModeOption[];
  walkWaypoints?: Array<[number, number]>;
  walkMode?: "direct" | "osrm";
}

export interface Station {
  id: string;
  code: string;
  name: string;
  officialName: string;
  operator: OperatorCode;
  lines: string[];
  latitude: number;
  longitude: number;
}

export interface LineInfo {
  code: string;
  operator: OperatorCode;
  name: string;
  colorCode: string;
  mode: string;
}

export interface HourlyWeatherPoint {
  time: string;
  hourLabel: string;
  temperatureC: number;
  feelsLikeC: number;
  rainProbPct: number;
  rainMm: number;
  weatherCode: number;
}

export type HeatLevel =
  | "Cool"
  | "Warm"
  | "Hot"
  | "Sweltering"
  | "Extreme Heat";

export interface WeatherLocationReport {
  label: string;
  address?: string;
  lat: number;
  lon: number;
  temperatureC: number;
  feelsLikeC: number;
  heatLevel: HeatLevel;
  humidityPct: number;
  windKmh: number;
  cloudCoverPct: number;
  precipitationMm: number;
  rainMm: number;
  weatherCode: number;
  weatherLabel: string;
  isRaining: boolean;
  isDay: boolean;
  hourlyNext6: HourlyWeatherPoint[];
  bmkg?: BmkgAdvisory | null;
  updatedAt: string;
}

export interface BmkgAdvisory {
  area: string;
  tempC: number;
  humidityPct: number;
  descId: string;
  descEn: string;
  localDatetime: string;
}

export interface WeatherBundle {
  origin: WeatherLocationReport;
  destination: WeatherLocationReport;
  bmkg: BmkgAdvisory | null;
  advisory: string;
  umbrellaRecommended: boolean;
  heatAlert: boolean;
}

export type DepartureStatus = "BOARDING" | "APPROACHING" | "UPCOMING";

export interface DepartureItem {
  tripNumber: string;
  lineCode: string;
  lineColor: string;
  boundFor: string;
  platformCode: string | null;
  departureTime: string;
  secondsUntil: number;
  status: DepartureStatus;
}

export interface CrowdDensity {
  level: 0 | 1 | 2 | 3 | null;
  label: "Quiet" | "Light" | "Moderate" | "Crowded" | "Unknown";
  hour: number;
}

export interface CommuteLeg {
  type: "RIDE" | "TRANSFER";
  operator?: OperatorCode;
  line?: string;
  lineName?: string;
  lineColor?: string;
  from: Station;
  to: Station;
  headsign?: string;
  platformCode?: string | null;
  stationCount?: number;
  distanceM?: number;
  stops?: Station[];
  path?: [number, number][];
  departures?: DepartureItem[];
  density?: CrowdDensity;
  estimatedMinutes?: number;
  note?: string;
}

export interface FareSegment {
  operator: string;
  fromName: string;
  toName: string;
  fare: number;
}

export interface CommuteRoute {
  from: Station;
  to: Station;
  originPlace?: PlaceProfile;
  destPlace?: PlaceProfile;
  isLocalDirect?: boolean;
  legs: CommuteLeg[];
  segments: FareSegment[];
  totalFare: number;
  totalDistanceM: number;
  transferCount: number;
  estimatedTotalMinutes: number;
  sourceLabel: string;
  updatedAt: string;
}

export interface PinnedStationBoard {
  station: Station;
  operator: OperatorCode;
  departures: DepartureItem[];
  density: CrowdDensity;
  sourceLabel: string;
  updatedAt: string;
}

export interface RelayStatus {
  connectedClients: number;
  uptimeSec: number;
  serverTimeWib: string;
  jakartaHour: number;
  dayType: "WD" | "SAT" | "SUN";
  upstream: {
    shiori: "ok" | "degraded";
    openMeteo: "ok" | "degraded";
    bmkg: "ok" | "degraded";
  };
  lastTransitSync: string | null;
  lastWeatherSync: string | null;
}

export interface SubscribePayload {
  type: "subscribe" | "refresh" | "pause" | "resume";
  direction?: CommuteDirection;
  homeStationId?: string;
  workStationId?: string;
  homePlace?: PlaceProfile;
  workPlace?: PlaceProfile;
  routeOptionId?: string;
  useAltStation?: boolean;
  pinnedStationIds?: string[];
  paused?: boolean;
}

export interface RelaySnapshotPayload {
  direction: CommuteDirection;
  homeStationId: string;
  workStationId: string;
  activeWorkplaceId: string;
  activeRouteOptionId: string;
  useAltStation: boolean;
  route: CommuteRoute | null;
  weather: WeatherBundle | null;
  pinnedBoards: PinnedStationBoard[];
  tjBuses?: TJBusLive[];
  relayStatus: RelayStatus;
}

export interface RelayTickLegUpdate {
  legIndex: number;
  departures?: DepartureItem[];
}

export interface RelayTickBoardUpdate {
  stationId: string;
  departures: DepartureItem[];
}

export interface RelayTickPayload {
  serverTimeWib: string;
  jakartaHour: number;
  uptimeSec: number;
  connectedClients: number;
  legUpdates: RelayTickLegUpdate[];
  boardUpdates: RelayTickBoardUpdate[];
  tjBuses?: TJBusLive[];
}

export type RelayMessage =
  | { type: "snapshot"; data: RelaySnapshotPayload }
  | { type: "tick"; data: RelayTickPayload }
  | { type: "error"; message: string };
