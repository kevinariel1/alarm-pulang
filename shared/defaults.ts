import type { PlaceProfile } from "./types.js";

export const DEFAULT_HOME_PLACE: PlaceProfile = {
  id: "home-bukit-duri",
  label: "Home · Lapangan Ros (Bukit Duri)",
  shortLabel: "Home (Bukit Duri)",
  address:
    "Lapangan Ros Timur 4 No.5, RT.5/RW.5, Bukit Duri, Tebet, Jakarta Selatan 12840",
  latitude: -6.222366,
  longitude: 106.854611,
  bmkgAdm4: "31.74.01.1005",
  stationId: "KCI-TEB",
  walkMode: "direct",
  walkWaypoints: [
    [-6.2245, 106.8565],
    [-6.2258, 106.8576],
  ],
};

export const DEFAULT_WORKPLACES: PlaceProfile[] = [
  {
    id: "work-sahid",
    label: "Grand Sahid Jaya (Sudirman)",
    shortLabel: "Grand Sahid Jaya",
    address:
      "Jl. Jenderal Sudirman No.86, Karet Tengsin, Tanah Abang, Jakarta Pusat 10220",
    latitude: -6.2108,
    longitude: 106.8195,
    bmkgAdm4: "31.71.07.1003",
    stationId: "MRTJ-STB",
    altStationId: "KCI-SUD",
    primaryRouteLabel: "KRL + MRT Setiabudi",
    altRouteLabel: "KRL Sudirman Only",
    routeOptions: [
      {
        id: "krl-mrt-setiabudi",
        label: "KRL + MRT Setiabudi",
        badge: "KRL+MRT",
        kind: "SHIORI_TRANSIT",
        originStationId: "KCI-TEB",
        destStationId: "MRTJ-STB",
        fareHint: "Rp 6.000",
      },
      {
        id: "krl-sudirman",
        label: "KRL Sudirman Only",
        badge: "KRL",
        kind: "SHIORI_TRANSIT",
        originStationId: "KCI-TEB",
        destStationId: "KCI-SUD",
        fareHint: "Rp 3.000",
      },
    ],
  },
  {
    id: "work-tebet",
    label: "Office · Tebet Timur Dalam IV N",
    shortLabel: "Tebet Timur Dalam",
    address:
      "Jl. Tebet Timur Dalam IV N No.6, RT.6/RW.11, Tebet Timur, Jakarta Selatan 12820",
    latitude: -6.2329,
    longitude: 106.8568,
    bmkgAdm4: "31.74.01.1001",
    stationId: "KCI-TEB",
    altStationId: "KCI-CW",
    primaryRouteLabel: "Direct Local (~1.3 km)",
    altRouteLabel: "KRL Tebet ↔ Cawang",
    routeOptions: [
      {
        id: "local-direct",
        label: "Direct Local (~1.3 km)",
        badge: "LOCAL",
        kind: "LOCAL_DIRECT",
        fareHint: "Rp 0",
      },
      {
        id: "krl-cawang",
        label: "KRL Tebet ↔ Cawang",
        badge: "KRL",
        kind: "SHIORI_TRANSIT",
        originStationId: "KCI-TEB",
        destStationId: "KCI-CW",
        fareHint: "Rp 3.000",
      },
    ],
  },
];

export const DEFAULT_PINNED_STATION_IDS = [
  "KCI-TEB",
  "KCI-MRI",
  "KCI-SUD",
  "MRTJ-STB",
];
