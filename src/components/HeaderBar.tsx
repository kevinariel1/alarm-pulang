import {
  Briefcase,
  Building2,
  Home,
  Pause,
  Play,
  Radio,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import type {
  CommuteDirection,
  PlaceProfile,
  RelayStatus,
} from "../../shared/types";
import type { ConnectionState } from "../hooks/useCommuteRelay";

interface HeaderBarProps {
  direction: CommuteDirection;
  onDirectionChange: (dir: CommuteDirection) => void;
  workplaces: PlaceProfile[];
  activeWorkplaceId: string;
  onWorkplaceChange: (id: string) => void;
  connectionState: ConnectionState;
  paused: boolean;
  onTogglePause: () => void;
  onRefresh: () => void;
  onOpenConfig: () => void;
  relayStatus?: RelayStatus;
}

export function HeaderBar({
  direction,
  onDirectionChange,
  workplaces,
  activeWorkplaceId,
  onWorkplaceChange,
  connectionState,
  paused,
  onTogglePause,
  onRefresh,
  onOpenConfig,
  relayStatus,
}: HeaderBarProps) {
  const statusStyles: Record<
    ConnectionState,
    { label: string; dot: string; badge: string }
  > = {
    live: {
      label: "RELAY LIVE",
      dot: "bg-emerald-400 animate-pulse",
      badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    },
    paused: {
      label: "PAUSED",
      dot: "bg-amber-400",
      badge: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
    connecting: {
      label: "CONNECTING",
      dot: "bg-sky-400 animate-pulse",
      badge: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    },
    reconnecting: {
      label: "RECONNECTING",
      dot: "bg-rose-400 animate-pulse",
      badge: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    },
  };

  const st = statusStyles[connectionState];

  return (
    <header className="glass-card sticky top-3 z-30 rounded-2xl px-4 py-3 md:px-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand + Live Relay Telemetry */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
                <Radio className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-base font-semibold tracking-tight text-slate-50 sm:text-lg">
                    JKT Commute Live
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wider ${st.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Bukit Duri (Lapangan Ros) ↔ Sudirman & Tebet Timur · Weather + Transit Relay
                </p>
              </div>
            </div>

            {/* Mobile Clock */}
            <div className="flex items-center gap-2 lg:hidden">
              <span className="font-mono-num rounded-lg border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-slate-200">
                {relayStatus?.serverTimeWib ?? "--:--:--"} WIB
              </span>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 lg:justify-end">
            {/* Go to Work / Go Home Switch */}
            <div
              role="group"
              aria-label="Commute direction"
              className="inline-flex rounded-xl border border-slate-700/70 bg-slate-900/80 p-1"
            >
              <button
                type="button"
                onClick={() => onDirectionChange("to-work")}
                className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  direction === "to-work"
                    ? "bg-emerald-500 font-semibold text-slate-950 shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                Go to Work
              </button>
              <button
                type="button"
                onClick={() => onDirectionChange("to-home")}
                className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  direction === "to-home"
                    ? "bg-sky-500 font-semibold text-slate-950 shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                Go Home
              </button>
            </div>

            {/* Desktop Clock + Day Type */}
            <div className="hidden items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 lg:flex">
              <span className="font-mono-num text-xs font-medium text-slate-100">
                {relayStatus?.serverTimeWib ?? "--:--:--"} WIB
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                {relayStatus?.dayType ?? "WD"}
              </span>
            </div>

            {/* Stream Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePause}
                title={paused ? "Resume 1s relay stream" : "Pause 1s relay stream"}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-700/70 bg-slate-800/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors duration-150 hover:bg-slate-700/80 focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                {paused ? (
                  <>
                    <Play className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span className="hidden sm:inline">Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onRefresh}
                title="Force sync upstream transit & weather"
                aria-label="Sync now"
                className="cursor-pointer inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-800/70 p-2 text-slate-200 transition-colors duration-150 hover:bg-slate-700/80 focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onOpenConfig}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors duration-150 hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Edit Route
              </button>
            </div>
          </div>
        </div>

        {/* 2-Workplace Switcher Bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <Building2 className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            Workplace:
          </span>
          <div
            role="group"
            aria-label="Select workplace"
            className="flex flex-wrap items-center gap-1.5"
          >
            {workplaces.map((wp) => {
              const active = wp.id === activeWorkplaceId;
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => onWorkplaceChange(wp.id)}
                  className={`cursor-pointer rounded-xl border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                    active
                      ? "border-sky-400/60 bg-sky-500/20 text-sky-200 shadow-sm"
                      : "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                  }`}
                >
                  {wp.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
