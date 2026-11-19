import type { CrowdDensity, OperatorCode } from "../../shared/types";

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hrs > 0) return `${hrs}h ${pad(mins)}m`;
  return `${pad(mins)}:${pad(secs)}`;
}

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export function formatDistanceKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export const OPERATOR_BADGE: Record<
  OperatorCode,
  { label: string; shortLabel: string; bg: string; text: string; border: string }
> = {
  KCI: {
    label: "KRL Commuter",
    shortLabel: "KRL",
    bg: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/40",
  },
  MRTJ: {
    label: "MRT Jakarta",
    shortLabel: "MRT",
    bg: "bg-pink-500/15",
    text: "text-pink-300",
    border: "border-pink-500/40",
  },
  TJ: {
    label: "TransJakarta",
    shortLabel: "TJ",
    bg: "bg-sky-500/15",
    text: "text-sky-300",
    border: "border-sky-500/40",
  },
};

export function getDensityBadgeClasses(level: CrowdDensity["level"]): string {
  switch (level) {
    case 0:
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/35";
    case 1:
      return "bg-cyan-500/15 text-cyan-300 border-cyan-500/35";
    case 2:
      return "bg-amber-500/15 text-amber-300 border-amber-500/35";
    case 3:
      return "bg-rose-500/15 text-rose-300 border-rose-500/35";
    default:
      return "bg-slate-700/40 text-slate-400 border-slate-600/40";
  }
}
