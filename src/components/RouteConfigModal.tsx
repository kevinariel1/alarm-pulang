import { Check, Footprints, MapPin, Pin, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_HOME_PLACE,
  DEFAULT_WORKPLACES,
} from "../../shared/defaults";
import type { OperatorCode, PlaceProfile, Station } from "../../shared/types";
import type { CommuteConfig } from "../hooks/useCommuteRelay";
import { OPERATOR_BADGE } from "../utils/format";

interface RouteConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CommuteConfig;
  stations: Station[];
  stationsLoading: boolean;
  onSave: (next: CommuteConfig) => void;
}

type TargetSlot = "home" | "work1" | "work2" | "pinned";
type ModeFilter = "ALL" | OperatorCode;

interface PresetOption {
  label: string;
  homeStationId: string;
  activeWorkplaceId: string;
  routeOptionId: string;
  pinned: string[];
}

const PRESETS: PresetOption[] = [
  {
    label: "Home (Bukit Duri) → Grand Sahid Jaya (KRL + MRT Setiabudi)",
    homeStationId: "KCI-TEB",
    activeWorkplaceId: "work-sahid",
    routeOptionId: "krl-mrt-setiabudi",
    pinned: ["KCI-TEB", "KCI-MRI", "KCI-SUD", "MRTJ-STB"],
  },
  {
    label: "Home (Bukit Duri) → Grand Sahid Jaya (KRL Sudirman Only)",
    homeStationId: "KCI-TEB",
    activeWorkplaceId: "work-sahid",
    routeOptionId: "krl-sudirman",
    pinned: ["KCI-TEB", "KCI-MRI", "KCI-SUD", "MRTJ-STB"],
  },
  {
    label: "Home (Bukit Duri) → Tebet Timur Dalam (Local)",
    homeStationId: "KCI-TEB",
    activeWorkplaceId: "work-tebet",
    routeOptionId: "local-direct",
    pinned: ["KCI-TEB", "KCI-CW", "KCI-MRI"],
  },
];

export function RouteConfigModal({
  isOpen,
  onClose,
  config,
  stations,
  stationsLoading,
  onSave,
}: RouteConfigModalProps) {
  const [draftHome, setDraftHome] = useState<PlaceProfile>(config.home);
  const [draftWorkplaces, setDraftWorkplaces] = useState<PlaceProfile[]>(
    config.workplaces
  );
  const [draftActiveWorkId, setDraftActiveWorkId] = useState(
    config.activeWorkplaceId
  );
  const [draftRouteOptionId, setDraftRouteOptionId] = useState(
    config.routeOptionId
  );
  const [draftUseAlt, setDraftUseAlt] = useState(config.useAltStation);
  const [draftPinned, setDraftPinned] = useState<string[]>(
    config.pinnedStationIds
  );
  const [activeSlot, setActiveSlot] = useState<TargetSlot>("home");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [showWalkSettings, setShowWalkSettings] = useState(false);
  const [newWpLat, setNewWpLat] = useState("");
  const [newWpLon, setNewWpLon] = useState("");

  useEffect(() => {
    if (isOpen) {
      setDraftHome(config.home);
      setDraftWorkplaces(config.workplaces);
      setDraftActiveWorkId(config.activeWorkplaceId);
      setDraftRouteOptionId(config.routeOptionId);
      setDraftUseAlt(config.useAltStation);
      setDraftPinned(config.pinnedStationIds);
      setSearch("");
      setShowWalkSettings(false);
      setNewWpLat("");
      setNewWpLon("");
    }
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const stationMap = useMemo(
    () => new Map(stations.map((s) => [s.id, s])),
    [stations]
  );

  const filteredStations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations
      .filter((s) => (modeFilter === "ALL" ? true : s.operator === modeFilter))
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.officialName.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [stations, modeFilter, search]);

  if (!isOpen) return null;

  const work1 = draftWorkplaces[0] ?? DEFAULT_WORKPLACES[0];
  const work2 = draftWorkplaces[1] ?? DEFAULT_WORKPLACES[1];

  const handleSelectStation = (stationId: string) => {
    if (activeSlot === "home") {
      setDraftHome((prev) => ({ ...prev, stationId }));
    } else if (activeSlot === "work1") {
      setDraftWorkplaces((prev) =>
        prev.map((w, i) =>
          i === 0 ? { ...w, stationId, routeOptions: undefined } : w
        )
      );
      setDraftRouteOptionId("");
    } else if (activeSlot === "work2") {
      setDraftWorkplaces((prev) =>
        prev.map((w, i) =>
          i === 1 ? { ...w, stationId, routeOptions: undefined } : w
        )
      );
      setDraftRouteOptionId("");
    } else {
      setDraftPinned((prev) => {
        if (prev.includes(stationId)) {
          return prev.filter((id) => id !== stationId);
        }
        if (prev.length >= 6) {
          return [...prev.slice(1), stationId];
        }
        return [...prev, stationId];
      });
    }
  };

  const applyPreset = (p: PresetOption) => {
    setDraftHome({
      ...DEFAULT_HOME_PLACE,
      stationId: p.homeStationId,
      latitude: draftHome.latitude || DEFAULT_HOME_PLACE.latitude,
      longitude: draftHome.longitude || DEFAULT_HOME_PLACE.longitude,
      walkMode: draftHome.walkMode ?? DEFAULT_HOME_PLACE.walkMode,
      walkWaypoints: draftHome.walkWaypoints ?? DEFAULT_HOME_PLACE.walkWaypoints,
    });
    setDraftWorkplaces(DEFAULT_WORKPLACES);
    setDraftActiveWorkId(p.activeWorkplaceId);
    setDraftRouteOptionId(p.routeOptionId);
    setDraftUseAlt(false);
    setDraftPinned(p.pinned);
  };

  const addWaypoint = () => {
    const lat = Number.parseFloat(newWpLat.trim());
    const lon = Number.parseFloat(newWpLon.trim());
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setDraftHome((prev) => ({
        ...prev,
        walkWaypoints: [...(prev.walkWaypoints ?? []), [lat, lon]],
      }));
      setNewWpLat("");
      setNewWpLon("");
    }
  };

  const removeWaypoint = (index: number) => {
    setDraftHome((prev) => ({
      ...prev,
      walkWaypoints: (prev.walkWaypoints ?? []).filter((_, i) => i !== index),
    }));
  };

  const applySave = () => {
    onSave({
      home: draftHome,
      workplaces: draftWorkplaces,
      activeWorkplaceId: draftActiveWorkId,
      routeOptionId: draftRouteOptionId,
      useAltStation: draftUseAlt,
      pinnedStationIds: draftPinned,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-config-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div>
            <h2
              id="route-config-title"
              className="text-lg font-semibold text-slate-50"
            >
              Configure Your Home, 2 Workplaces & Pinned Stations
            </h2>
            <p className="text-xs text-slate-400">
              Pick from {stations.length || 125} KRL and MRT stations
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close configuration"
            className="cursor-pointer rounded-lg border border-slate-700/70 bg-slate-800/70 p-2 text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Quick Presets */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Your Personalized Commute Presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="cursor-pointer rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-200 transition-colors hover:border-emerald-500/50 hover:bg-slate-800"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Slot Selector Cards */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setActiveSlot("home")}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                activeSlot === "home"
                  ? "border-emerald-500 bg-emerald-500/12"
                  : "border-slate-700/70 bg-slate-900/60 hover:border-slate-600"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                1. Home (Bukit Duri)
              </div>
              <div className="mt-1 truncate text-sm font-medium text-slate-100">
                {stationMap.get(draftHome.stationId)?.name ?? draftHome.stationId}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSlot("work1")}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                activeSlot === "work1"
                  ? "border-sky-500 bg-sky-500/12"
                  : "border-slate-700/70 bg-slate-900/60 hover:border-slate-600"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                2. {work1.shortLabel}
              </div>
              <div className="mt-1 truncate text-sm font-medium text-slate-100">
                {stationMap.get(work1.stationId)?.name ?? work1.stationId}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSlot("work2")}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                activeSlot === "work2"
                  ? "border-cyan-500 bg-cyan-500/12"
                  : "border-slate-700/70 bg-slate-900/60 hover:border-slate-600"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                3. {work2.shortLabel}
              </div>
              <div className="mt-1 truncate text-sm font-medium text-slate-100">
                {stationMap.get(work2.stationId)?.name ?? work2.stationId}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSlot("pinned")}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                activeSlot === "pinned"
                  ? "border-amber-500 bg-amber-500/12"
                  : "border-slate-700/70 bg-slate-900/60 hover:border-slate-600"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                <span>4. Pinned ({draftPinned.length}/6)</span>
                <Pin className="h-3 w-3" aria-hidden="true" />
              </div>
              <div className="mt-1 truncate text-xs text-slate-300">
                {draftPinned
                  .map((id) => stationMap.get(id)?.name ?? id)
                  .join(", ") || "None"}
              </div>
            </button>
          </div>

          {/* Toggle Custom Coordinates & Walk Waypoints Editor */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Footprints className="h-4 w-4 text-amber-400" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-200">
                  Custom Walk Waypoints & Pin Location
                </span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  Anti Muter-muter
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowWalkSettings((v) => !v)}
                className="cursor-pointer text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                {showWalkSettings ? "Hide Editor ▲" : "Edit Pin & Waypoints ▼"}
              </button>
            </div>

            {showWalkSettings && (
              <div className="mt-3.5 space-y-3 border-t border-slate-700/60 pt-3">
                {/* Pin Coordinate */}
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                    Home Pin Coordinate (Lat, Lon):
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] uppercase text-slate-400">Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={draftHome.latitude}
                        onChange={(e) =>
                          setDraftHome((prev) => ({
                            ...prev,
                            latitude: Number.parseFloat(e.target.value) || prev.latitude,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-400">Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={draftHome.longitude}
                        onChange={(e) =>
                          setDraftHome((prev) => ({
                            ...prev,
                            longitude: Number.parseFloat(e.target.value) || prev.longitude,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Routing Mode */}
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-300">
                    Walking Routing Mode:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftHome((prev) => ({ ...prev, walkMode: "direct" }))}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        (draftHome.walkMode ?? "direct") === "direct"
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                          : "border-slate-700 bg-slate-950/50 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      ✓ Direct / Custom Alley Waypoints (Rekomendasi - Tidak Muter)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftHome((prev) => ({ ...prev, walkMode: "osrm" }))}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        draftHome.walkMode === "osrm"
                          ? "border-sky-500 bg-sky-500/20 text-sky-200"
                          : "border-slate-700 bg-slate-950/50 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      OSRM Auto-Follow Roads
                    </button>
                  </div>
                </div>

                {/* Waypoints list */}
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-300">
                    Waypoints Jalur Jalan Kaki ({draftHome.walkWaypoints?.length ?? 0}):
                  </div>
                  <div className="space-y-1.5">
                    {(draftHome.walkWaypoints ?? []).map(([lat, lon], idx) => (
                      <div
                        key={`wp-${idx}-${lat}`}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-300"
                      >
                        <span className="font-mono-num text-[11px]">
                          WP {idx + 1}: {lat.toFixed(6)}, {lon.toFixed(6)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeWaypoint(idx)}
                          className="cursor-pointer text-slate-400 hover:text-rose-400"
                          title="Hapus waypoint"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add waypoint inputs */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Lat (e.g. -6.22450)"
                      value={newWpLat}
                      onChange={(e) => setNewWpLat(e.target.value)}
                      className="w-36 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                    />
                    <input
                      type="text"
                      placeholder="Lon (e.g. 106.85650)"
                      value={newWpLon}
                      onChange={(e) => setNewWpLon(e.target.value)}
                      className="w-36 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={addWaypoint}
                      className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
                    >
                      <Plus className="h-3 w-3" />
                      Add Waypoint
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search & Operator Tabs */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search station to assign to ${activeSlot}...`}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-900/70 p-1">
              {(["ALL", "KCI", "MRTJ"] as ModeFilter[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setModeFilter(mode)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    modeFilter === mode
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mode === "ALL" ? "All" : OPERATOR_BADGE[mode].shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Station List */}
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {stationsLoading ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Loading station directory...
              </p>
            ) : filteredStations.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No stations match "{search}".
              </p>
            ) : (
              filteredStations.map((st) => {
                const badge = OPERATOR_BADGE[st.operator];
                const isSelected =
                  (activeSlot === "home" && draftHome.stationId === st.id) ||
                  (activeSlot === "work1" && work1.stationId === st.id) ||
                  (activeSlot === "work2" && work2.stationId === st.id) ||
                  (activeSlot === "pinned" && draftPinned.includes(st.id));

                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStation(st.id)}
                    className={`cursor-pointer flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/12"
                        : "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800/70"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {badge.shortLabel}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-100">
                          {st.name}
                        </div>
                        <div className="font-mono-num text-[10px] text-slate-400">
                          {st.id}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Check
                        className="h-4 w-4 shrink-0 text-emerald-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-700/60 px-5 py-3.5">
          <span className="text-xs text-slate-400">
            Saved locally in browser · Streams immediately via relay
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800/70 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applySave}
              className="cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Save & Stream Live
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
