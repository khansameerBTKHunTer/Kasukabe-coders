import type { PriorityBand } from "@/types";

export const PRIORITY_MARKERS = {
  Critical: { bg: "#b91c1c", ring: "rgba(185,28,28,.25)", text: "#ffffff", size: 46, rank: 4, symbol: "!!" },
  High: { bg: "#c2410c", ring: "rgba(194,65,12,.22)", text: "#ffffff", size: 40, rank: 3, symbol: "!" },
  Medium: { bg: "#facc15", ring: "rgba(234,179,8,.18)", text: "#382b15", size: 34, rank: 2, symbol: "•" },
  Low: { bg: "#15803d", ring: "rgba(21,128,61,.14)", text: "#ffffff", size: 30, rank: 1, symbol: "✓" },
} satisfies Record<PriorityBand, { bg: string; ring: string; text: string; size: number; rank: number; symbol: string }>;

export function mapPriority(band: string) {
  if (Object.prototype.hasOwnProperty.call(PRIORITY_MARKERS, band))
    return { ...PRIORITY_MARKERS[band as PriorityBand], label: band, className: band.toLowerCase() };
  return { bg: "#6d5947", ring: "rgba(109,89,71,.16)", text: "#ffffff", size: 30, rank: 0, symbol: "?", label: "Unrated", className: "unrated" };
}
