import { AlertTriangle, Server } from "lucide-react";
import { useState } from "react";
import { CommuteMap } from "./components/CommuteMap";
import { CommuteRouteBoard } from "./components/CommuteRouteBoard";
import { HeaderBar } from "./components/HeaderBar";
import { PinnedStationsGrid } from "./components/PinnedStationsGrid";
import { RouteConfigModal } from "./components/RouteConfigModal";
import { WeatherSensorPanel } from "./components/WeatherSensorPanel";
import { useCommuteRelay } from "./hooks/useCommuteRelay";

export function App() {
  const {
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
    updateConfig,
    togglePause,
    manualRefresh,
  } = useCommuteRelay();

  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0F172A] bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(56,189,248,0.08),_transparent_50%)] px-3 py-3 sm:px-6 sm:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <HeaderBar
          direction={direction}
          onDirectionChange={setDirection}
          workplaces={config.workplaces}
          activeWorkplaceId={activeWorkplace.id}
          onWorkplaceChange={setActiveWorkplaceId}
          connectionState={connectionState}
          paused={paused}
          onTogglePause={togglePause}
          onRefresh={manualRefresh}
          onOpenConfig={() => setConfigOpen(true)}
          relayStatus={snapshot?.relayStatus}
        />

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-2.5 text-xs text-rose-200"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Real-Time Rain & Heat Sensor Panel */}
        <WeatherSensorPanel weather={snapshot?.weather ?? null} />

        {/* Multi-Modal Route + Interactive Map */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <CommuteRouteBoard
              route={snapshot?.route ?? null}
              direction={direction}
              activeWorkplace={activeWorkplace}
              activeRouteOptionId={config.routeOptionId}
              onSelectRouteOption={setRouteOptionId}
              onOpenConfig={() => setConfigOpen(true)}
            />
          </div>
          <div className="lg:col-span-5">
            <CommuteMap
              route={snapshot?.route ?? null}
              weather={snapshot?.weather ?? null}
              tjBuses={snapshot?.tjBuses}
            />
          </div>
        </div>

        {/* Pinned Quick-Watch Stations across TJ, KRL, MRT */}
        <PinnedStationsGrid
          boards={snapshot?.pinnedBoards ?? []}
          onOpenConfig={() => setConfigOpen(true)}
        />

        {/* Relay Upstream Telemetry Footer */}
        <footer className="glass-card flex flex-col gap-2 rounded-2xl px-4 py-3 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
              <Server className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Relay Telemetry
            </span>
            <span className="font-mono-num">
              Clients: {snapshot?.relayStatus.connectedClients ?? 1}
            </span>
            <span className="font-mono-num">
              Uptime: {snapshot?.relayStatus.uptimeSec ?? 0}s
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span>Upstreams:</span>
            <span
              className={`rounded px-2 py-0.5 ${
                snapshot?.relayStatus.upstream.shiori === "degraded"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              Shiori Transit: {snapshot?.relayStatus.upstream.shiori ?? "ok"}
            </span>
            <span
              className={`rounded px-2 py-0.5 ${
                snapshot?.relayStatus.upstream.openMeteo === "degraded"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              Open-Meteo: {snapshot?.relayStatus.upstream.openMeteo ?? "ok"}
            </span>
            <span
              className={`rounded px-2 py-0.5 ${
                snapshot?.relayStatus.upstream.bmkg === "degraded"
                  ? "bg-slate-700/60 text-slate-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              BMKG: {snapshot?.relayStatus.upstream.bmkg ?? "ok"}
            </span>
          </div>
        </footer>
      </div>

      <RouteConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        config={config}
        stations={stations}
        stationsLoading={stationsLoading}
        onSave={updateConfig}
      />
    </div>
  );
}

export default App;
