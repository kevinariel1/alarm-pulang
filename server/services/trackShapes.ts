import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GeoJsonFeature {
  type: string;
  properties: {
    from: string;
    to: string;
    lines?: string[];
    lengthM?: number;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lon, lat]
  };
}

interface GeoJsonCollection {
  type: string;
  features: GeoJsonFeature[];
}

// Map from composite key `fromId|toId` -> array of [lat, lon]
const trackSegmentMap = new Map<string, [number, number][]>();

function loadTracks(): void {
  const sharedDir = path.resolve(__dirname, "../../shared");
  const files = ["kci.geojson", "mrtj.geojson"];

  for (const file of files) {
    const fullPath = path.join(sharedDir, file);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const data: GeoJsonCollection = JSON.parse(raw);
      if (!Array.isArray(data.features)) continue;

      for (const feat of data.features) {
        if (!feat.properties?.from || !feat.properties?.to) continue;
        if (feat.geometry?.type !== "LineString") continue;

        // GeoJSON coordinates are [lon, lat], convert to Leaflet standard [lat, lon]
        const forwardCoords: [number, number][] = feat.geometry.coordinates.map(
          ([lon, lat]) => [lat, lon]
        );
        const reverseCoords = [...forwardCoords].reverse();

        const from = feat.properties.from;
        const to = feat.properties.to;

        // Store both directional keys
        trackSegmentMap.set(`${from}->${to}`, forwardCoords);
        trackSegmentMap.set(`${to}->${from}`, reverseCoords);
      }
    } catch (err) {
      console.warn(`[track-shapes] Failed to load ${file}:`, err);
    }
  }
}

// Initial load
loadTracks();

/**
 * Returns accurate track geometry coordinates [lat, lon] for a single edge between two adjacent stations.
 */
export function getTrackSegmentPath(
  fromId: string,
  toId: string
): [number, number][] | null {
  return trackSegmentMap.get(`${fromId}->${toId}`) ?? null;
}

/**
 * Build track path for a multi-station ride leg.
 * Takes an ordered array of station IDs or a fromId + toId.
 * If intermediate stops are available, chains each segment.
 */
export function buildRailLegPath(
  fromId: string,
  toId: string,
  stops?: Array<{ id: string; latitude: number; longitude: number }>
): [number, number][] | null {
  // If we have intermediate stops
  if (stops && stops.length >= 2) {
    const fullPath: [number, number][] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const segFrom = stops[i].id;
      const segTo = stops[i + 1].id;
      const segPath = getTrackSegmentPath(segFrom, segTo);
      if (segPath && segPath.length > 0) {
        // avoid duplicating the junction coordinate
        if (fullPath.length > 0) {
          fullPath.push(...segPath.slice(1));
        } else {
          fullPath.push(...segPath);
        }
      } else {
        // Fallback straight segment between these two stops
        if (fullPath.length === 0) {
          fullPath.push([stops[i].latitude, stops[i].longitude]);
        }
        fullPath.push([stops[i + 1].latitude, stops[i + 1].longitude]);
      }
    }
    return fullPath.length >= 2 ? fullPath : null;
  }

  // If no intermediate stops given, check direct edge
  const direct = getTrackSegmentPath(fromId, toId);
  if (direct) return direct;

  return null;
}
