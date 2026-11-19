import { Pin, TrainFront, TramFront, Users } from "lucide-react";
import type { OperatorCode, PinnedStationBoard } from "../../shared/types";
import {
  formatCountdown,
  getDensityBadgeClasses,
  OPERATOR_BADGE,
} from "../utils/format";

interface PinnedStationsGridProps {
  boards: PinnedStationBoard[];
  onOpenConfig: () => void;
}

function ModeIcon({ operator }: { operator: OperatorCode }) {
  if (operator === "MRTJ")
    return <TramFront className="h-4 w-4" aria-hidden="true" />;
  return <TrainFront className="h-4 w-4" aria-hidden="true" />;
}

export function PinnedStationsGrid({
  boards,
  onOpenConfig,
}: PinnedStationsGridProps) {
  return (
    <section aria-label="Pinned quick-watch stations" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-100">
            Pinned Quick-Watch Stations
          </h2>
          <span className="text-xs text-slate-400">(KRL · MRT)</span>
        </div>
        <button
          type="button"
          onClick={onOpenConfig}
          className="cursor-pointer rounded-lg border border-slate-700/70 bg-slate-800/70 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors duration-150 hover:bg-slate-700/80 focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          Customize Pins
        </button>
      </div>

      {boards.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center text-sm text-slate-400">
          No pinned stations selected. Click{" "}
          <button
            type="button"
            onClick={onOpenConfig}
            className="cursor-pointer font-medium text-emerald-400 underline"
          >
            Customize Pins
          </button>{" "}
          to monitor your favorite KRL or MRT stations.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {boards.map((board) => {
            const badge = OPERATOR_BADGE[board.operator];
            return (
              <div
                key={board.station.id}
                className="glass-card flex flex-col justify-between rounded-2xl p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          <ModeIcon operator={board.operator} />
                          {badge.shortLabel}
                        </span>
                        <span className="font-mono-num text-[11px] text-slate-400">
                          {board.station.code}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-base font-semibold text-slate-50">
                        {board.station.name}
                      </h3>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getDensityBadgeClasses(
                        board.density.level
                      )}`}
                    >
                      <Users className="h-3 w-3" aria-hidden="true" />
                      {board.density.label}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {board.departures.length > 0 ? (
                      board.departures.slice(0, 4).map((dep, idx) => (
                        <div
                          key={`${dep.tripNumber}-${dep.departureTime}-${idx}`}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/55 px-2.5 py-1.5"
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
                              {dep.platformCode ? `Plat ${dep.platformCode} · ` : ""}
                              {dep.departureTime.slice(0, 5)} WIB
                            </div>
                          </div>
                          <span
                            className={`font-mono-num shrink-0 text-xs font-bold ${
                              dep.status === "BOARDING"
                                ? "text-emerald-400"
                                : dep.status === "APPROACHING"
                                  ? "text-amber-300"
                                  : "text-slate-100"
                            }`}
                          >
                            {formatCountdown(dep.secondsUntil)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
                        No upcoming departures found.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-[10px] text-slate-400">
                  <span>{board.sourceLabel}</span>
                  <span className="font-mono-num">
                    {new Date(board.updatedAt).toLocaleTimeString("en-GB", {
                      timeZone: "Asia/Jakarta",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    WIB
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
