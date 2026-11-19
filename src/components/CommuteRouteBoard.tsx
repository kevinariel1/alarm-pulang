import {
  ArrowRight,
  Clock,
  Footprints,
  Navigation,
  Route,
  TrainFront,
  TramFront,
  Users,
  Wallet,
} from "lucide-react";
import type {
  CommuteDirection,
  CommuteLeg,
  CommuteRoute,
  OperatorCode,
  PlaceProfile,
} from "../../shared/types";
import {
  formatCountdown,
  formatDistanceKm,
  formatRupiah,
  getDensityBadgeClasses,
  OPERATOR_BADGE,
} from "../utils/format";

interface CommuteRouteBoardProps {
  route: CommuteRoute | null;
  direction: CommuteDirection;
  activeWorkplace: PlaceProfile;
  activeRouteOptionId: string;
  onSelectRouteOption: (optionId: string) => void;
  onOpenConfig: () => void;
}

function OperatorIcon({
  operator,
  className = "h-4 w-4",
}: {
  operator?: OperatorCode;
  className?: string;
}) {
  if (operator === "MRTJ")
    return <TramFront className={className} aria-hidden="true" />;
  return <TrainFront className={className} aria-hidden="true" />;
}

function RideLegCard({ leg, index }: { leg: CommuteLeg; index: number }) {
  const op = leg.operator ?? leg.from.operator;
  const badge = OPERATOR_BADGE[op];
  const lineCode = leg.line?.includes(":") ? leg.line.split(":")[1] : leg.line;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/65 p-3.5 transition-colors duration-150 hover:border-slate-600/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-num flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
            {index + 1}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
          >
            <OperatorIcon operator={op} className="h-3.5 w-3.5" />
            {badge.shortLabel}
          </span>
          {lineCode && (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold text-white shadow-sm"
              style={{ backgroundColor: leg.lineColor ?? "#0284C7" }}
            >
              {leg.lineName ? `${lineCode} · ${leg.lineName}` : `Line ${lineCode}`}
            </span>
          )}
          {leg.platformCode && (
            <span className="font-mono-num rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-200">
              Platform {leg.platformCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {leg.density && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getDensityBadgeClasses(
                leg.density.level
              )}`}
            >
              <Users className="h-3 w-3" aria-hidden="true" />
              {leg.density.label}
            </span>
          )}
          {leg.estimatedMinutes && (
            <span className="font-mono-num text-xs text-slate-400">
              ~{leg.estimatedMinutes} min ride
            </span>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-slate-100">{leg.from.name}</span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        <span className="font-semibold text-slate-100">{leg.to.name}</span>
        <span className="text-xs text-slate-400">
          ({leg.stationCount ?? 0} stops
          {leg.headsign ? ` · bound for ${leg.headsign}` : ""})
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Next Departures · Timetable-Synced</span>
          <span>Countdown</span>
        </div>
        {leg.departures && leg.departures.length > 0 ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {leg.departures.slice(0, 4).map((dep, i) => (
              <div
                key={`${dep.tripNumber}-${dep.departureTime}-${i}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: dep.lineColor }}
                    />
                    <span className="truncate text-xs font-medium text-slate-100">
                      {dep.boundFor}
                    </span>
                  </div>
                  <div className="font-mono-num text-[10px] text-slate-400">
                    #{dep.tripNumber} · {dep.departureTime.slice(0, 5)} WIB
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`font-mono-num text-sm font-bold ${
                      dep.status === "BOARDING"
                        ? "text-emerald-400"
                        : dep.status === "APPROACHING"
                          ? "text-amber-300"
                          : "text-slate-100"
                    }`}
                  >
                    {formatCountdown(dep.secondsUntil)}
                  </span>
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    {dep.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            No upcoming scheduled departures available for this segment right now.
          </p>
        )}
      </div>
    </div>
  );
}

export function CommuteRouteBoard({
  route,
  direction,
  activeWorkplace,
  activeRouteOptionId,
  onSelectRouteOption,
  onOpenConfig,
}: CommuteRouteBoardProps) {
  if (!route) {
    return (
      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Active Commute Route
            </h2>
            <p className="text-xs text-slate-400">
              Computing door-to-door route & live boards...
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenConfig}
            className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            Select Stations
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/60" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/60" />
        </div>
      </section>
    );
  }

  const originTitle = route.originPlace?.shortLabel ?? route.from.name;
  const destTitle = route.destPlace?.shortLabel ?? route.to.name;
  const options = activeWorkplace.routeOptions ?? [];

  return (
    <section
      aria-label="Multi-modal commute route and departures"
      className="glass-card rounded-2xl p-4"
    >
      {/* Route Summary Header */}
      <div className="flex flex-col gap-3 border-b border-slate-700/50 pb-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                {direction === "to-work"
                  ? "Morning Go-to-Work Route"
                  : "Evening Go-Home Route"}
              </span>
            </div>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-50 sm:text-lg">
              <span>{originTitle}</span>
              <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>{destTitle}</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono-num font-semibold">
                {route.isLocalDirect
                  ? "Rp 0 (Walk / Local)"
                  : formatRupiah(route.totalFare)}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-200">
              <Clock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span className="font-mono-num">
                ~{route.estimatedTotalMinutes} min
              </span>
            </div>
            <div className="font-mono-num rounded-xl border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-300">
              {formatDistanceKm(route.totalDistanceM)} · {route.transferCount}{" "}
              {route.transferCount === 1 ? "transfer" : "transfers"}
            </div>
          </div>
        </div>

        {/* Route Option Selector */}
        {options.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Route className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              Route option:
            </span>
            <div
              role="group"
              aria-label="Transport route options"
              className="flex flex-wrap gap-1.5"
            >
              {options.map((opt) => {
                const isSelected = opt.id === activeRouteOptionId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectRouteOption(opt.id)}
                    className={`cursor-pointer inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                      isSelected
                        ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 shadow-sm"
                        : "border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.fareHint && (
                      <span className="font-mono-num text-[10px] text-slate-400">
                        {opt.fareHint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Leg Cards */}
      <div className="mt-3.5 space-y-2.5">
        {route.legs.map((leg, idx) =>
          leg.type === "TRANSFER" ? (
            <div
              key={`transfer-${leg.from.id}-${leg.to.id}-${idx}`}
              className={`flex flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between ${
                route.isLocalDirect
                  ? "border-emerald-500/40 bg-emerald-500/10 text-slate-200"
                  : "border-dashed border-slate-700/70 bg-slate-950/40 text-slate-300"
              }`}
            >
              <div className="flex items-start gap-2 sm:items-center">
                <Footprints
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300 sm:mt-0"
                  aria-hidden="true"
                />
                <div>
                  <div>
                    <strong>{leg.from.name}</strong> →{" "}
                    <strong>{leg.to.name}</strong>
                  </div>
                  {leg.note && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {leg.note}
                    </p>
                  )}
                </div>
              </div>
              <span className="font-mono-num shrink-0 text-slate-400">
                {formatDistanceKm(leg.distanceM ?? 0)} · ~{leg.estimatedMinutes ?? 2} min
              </span>
            </div>
          ) : (
            <RideLegCard
              key={`ride-${leg.from.id}-${leg.to.id}-${idx}`}
              leg={leg}
              index={idx}
            />
          )
        )}
      </div>

      {/* Fare breakdown footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-2">
          <span>Fare breakdown:</span>
          {route.segments.length > 0 ? (
            route.segments.map((seg, i) => (
              <span
                key={`${seg.operator}-${i}`}
                className="rounded bg-slate-900 px-2 py-0.5 text-slate-300"
              >
                {seg.operator}:{" "}
                <span className="font-mono-num font-medium">
                  {formatRupiah(seg.fare)}
                </span>
              </span>
            ))
          ) : (
            <span className="rounded bg-slate-900 px-2 py-0.5 text-slate-300">
              No rail ticket required
            </span>
          )}
        </div>
        <span>{route.sourceLabel}</span>
      </div>
    </section>
  );
}
