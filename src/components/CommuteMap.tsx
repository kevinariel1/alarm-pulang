import L from "leaflet";
import { MapPin } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CommuteRoute, TJBusLive, WeatherBundle } from "../../shared/types";

interface CommuteMapProps {
  route: CommuteRoute | null;
  weather: WeatherBundle | null;
  tjBuses?: TJBusLive[];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createPinIcon(label: string, color: string, ringColor: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:20px;height:20px;">
      <span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid ${ringColor};box-shadow:0 0 12px ${color};display:block;"></span>
      <span style="position:absolute;top:22px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,0.92);color:#F8FAFC;border:1px solid rgba(71,85,105,0.7);border-radius:6px;padding:1px 6px;font-size:10px;font-weight:600;">${escapeHtml(
        label
      )}</span>
    </div>`,
  });
}

function createStopDotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    html: `<span style="display:block;width:8px;height:8px;border-radius:9999px;background:${color};border:1.5px solid #0F172A;"></span>`,
  });
}

function createWaypointDotIcon(idx: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:9999px;background:#F59E0B;border:2px solid #0F172A;color:#0F172A;font-size:9px;font-weight:bold;box-shadow:0 0 6px rgba(245,158,11,0.6);">${idx}</span>`,
  });
}

function createBusIcon(busNo: string): L.DivIcon {
  return L.divIcon({
    className: "tj-bus-marker-icon",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:#0284C7;border:2px solid #FFFFFF;border-radius:9999px;box-shadow:0 0 10px rgba(2,132,199,0.9);font-size:13px;cursor:pointer;transition:all 1s linear;">
      🚌
      <span style="position:absolute;top:28px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(2,132,199,0.92);color:#FFFFFF;border:1px solid rgba(255,255,255,0.7);border-radius:5px;padding:0.5px 4px;font-size:9px;font-weight:bold;">${escapeHtml(busNo)}</span>
    </div>`,
  });
}

export function CommuteMap({ route, weather, tjBuses }: CommuteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const busMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const busLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFittedKeyRef = useRef<string | null>(null);

  const routeKey = route
    ? `${route.from.id}|${route.to.id}|${route.originPlace?.id ?? ""}|${route.destPlace?.id ?? ""}|${route.legs.length}|${route.sourceLabel}`
    : "";
  const weatherKey = weather
    ? `${weather.origin.temperatureC}|${weather.origin.isRaining}|${weather.destination.temperatureC}|${weather.destination.isRaining}`
    : "";

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-6.218, 106.838],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    const busGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;
    busLayerGroupRef.current = busGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    if (route) {
      for (const leg of route.legs) {
        if (leg.type === "TRANSFER") {
          const pts: L.LatLngExpression[] =
            leg.path && leg.path.length >= 2
              ? leg.path
              : [
                  [leg.from.latitude, leg.from.longitude],
                  [leg.to.latitude, leg.to.longitude],
                ];
          L.polyline(pts, {
            color: "#F59E0B",
            weight: 3,
            dashArray: "6 6",
            opacity: 0.9,
          }).addTo(group);
          boundsPoints.push(...pts);

          // If intermediate waypoints exist, render friendly numbered dots
          if (pts.length > 2 && pts.length <= 10) {
            pts.slice(1, -1).forEach((pt, i) => {
              const [lat, lon] = pt as [number, number];
              L.marker([lat, lon], {
                icon: createWaypointDotIcon(i + 1),
              })
                .bindPopup(`<div style="font-size:11px;"><strong>Waypoint ${i + 1}</strong> (Walk Shortcut)</div>`)
                .addTo(group);
            });
          }
          continue;
        }

        const rideCoords: L.LatLngExpression[] =
          leg.path && leg.path.length >= 2
            ? leg.path
            : leg.stops && leg.stops.length >= 2
            ? leg.stops.map((s) => [s.latitude, s.longitude])
            : [
                [leg.from.latitude, leg.from.longitude],
                [leg.to.latitude, leg.to.longitude],
              ];

        const color = leg.lineColor ?? "#38BDF8";
        L.polyline(rideCoords, {
          color,
          weight: 4.5,
          opacity: 0.92,
        }).addTo(group);

        if (leg.stops) {
          for (const s of leg.stops) {
            L.marker([s.latitude, s.longitude], {
              icon: createStopDotIcon(color),
            })
              .bindPopup(
                `<div style="font-size:12px;"><strong>${escapeHtml(
                  s.name
                )}</strong><br/><span style="color:#94A3B8">${escapeHtml(
                  s.operator
                )} · ${escapeHtml(s.code)}</span></div>`
              )
              .addTo(group);
          }
        }
        boundsPoints.push(...rideCoords);
      }

      const origLat = route.originPlace?.latitude ?? route.from.latitude;
      const origLon = route.originPlace?.longitude ?? route.from.longitude;
      const origName = route.originPlace?.shortLabel ?? route.from.name;

      const destLat = route.destPlace?.latitude ?? route.to.latitude;
      const destLon = route.destPlace?.longitude ?? route.to.longitude;
      const destName = route.destPlace?.shortLabel ?? route.to.name;

      const origWeather = weather?.origin
        ? ` · ${weather.origin.temperatureC.toFixed(0)}°C${
            weather.origin.isRaining ? " (Rain)" : ""
          }`
        : "";
      const destWeather = weather?.destination
        ? ` · ${weather.destination.temperatureC.toFixed(0)}°C${
            weather.destination.isRaining ? " (Rain)" : ""
          }`
        : "";

      L.marker([origLat, origLon], {
        icon: createPinIcon(`Start: ${origName}${origWeather}`, "#22C55E", "#F8FAFC"),
      })
        .bindPopup(
          `<div style="font-size:12px;"><strong>Origin: ${escapeHtml(
            origName
          )}</strong><br/>${escapeHtml(
            weather?.origin
              ? `${weather.origin.weatherLabel}, ${weather.origin.temperatureC}°C (Feels ${weather.origin.feelsLikeC}°C)`
              : route.from.operator
          )}</div>`
        )
        .addTo(group);

      L.marker([destLat, destLon], {
        icon: createPinIcon(`End: ${destName}${destWeather}`, "#38BDF8", "#F8FAFC"),
      })
        .bindPopup(
          `<div style="font-size:12px;"><strong>Destination: ${escapeHtml(
            destName
          )}</strong><br/>${escapeHtml(
            weather?.destination
              ? `${weather.destination.weatherLabel}, ${weather.destination.temperatureC}°C (Feels ${weather.destination.feelsLikeC}°C)`
              : route.to.operator
          )}</div>`
        )
        .addTo(group);

      boundsPoints.push([origLat, origLon], [destLat, destLon]);
    }

    if (boundsPoints.length >= 2 && routeKey !== lastFittedKeyRef.current) {
      lastFittedKeyRef.current = routeKey;
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [42, 42],
        maxZoom: 15,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, weatherKey]);

  // Update Live TransJakarta 6D Buses smoothly on Map
  useEffect(() => {
    if (!busLayerGroupRef.current) return;
    const busGroup = busLayerGroupRef.current;
    const existingMarkers = busMarkersRef.current;

    if (!tjBuses || tjBuses.length === 0) {
      busGroup.clearLayers();
      existingMarkers.clear();
      return;
    }

    const currentBusNos = new Set<string>();

    for (const bus of tjBuses) {
      if (!bus.latitude || !bus.longitude) continue;
      currentBusNos.add(bus.busNo);

      const popupContent = `
        <div style="font-size:12px;color:#0F172A;min-width:180px;">
          <div style="font-weight:bold;color:#0284C7;font-size:13px;display:flex;justify-content:space-between;">
            <span>Bus ${escapeHtml(bus.busNo)}</span>
            <span>${bus.speed} km/h</span>
          </div>
          <div style="margin-top:2px;font-weight:600;">➔ ${escapeHtml(bus.routeName || "6D")}</div>
          <div style="color:#64748B;margin-top:2px;font-size:11px;">Next Stop: ${escapeHtml(bus.nextStop || "-")}</div>
          <div style="color:#94A3B8;margin-top:4px;font-size:10px;">Status: Real-time GPS</div>
        </div>
      `;

      if (existingMarkers.has(bus.busNo)) {
        // Smoothly animate/move existing marker to new coordinate
        const marker = existingMarkers.get(bus.busNo)!;
        marker.setLatLng([bus.latitude, bus.longitude]);
        marker.setPopupContent(popupContent);
      } else {
        // Create new marker
        const marker = L.marker([bus.latitude, bus.longitude], {
          icon: createBusIcon(bus.busNo),
        });
        marker.bindPopup(popupContent);
        marker.addTo(busGroup);
        existingMarkers.set(bus.busNo, marker);
      }
    }

    // Clean up markers of buses that are no longer active
    for (const [busNo, marker] of existingMarkers.entries()) {
      if (!currentBusNos.has(busNo)) {
        busGroup.removeLayer(marker);
        existingMarkers.delete(busNo);
      }
    }
  }, [tjBuses]);

  return (
    <section
      aria-label="Route and weather map"
      className="glass-card flex flex-col rounded-2xl p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-100">
            Route & Weather Map
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Origin
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Destination
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 border-t-2 border-dashed border-amber-400" />
            Walk / Local
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_8px_#0284C7]" />
            Live TJ 6D
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[340px] w-full overflow-hidden rounded-xl border border-slate-700/60 lg:h-full lg:min-h-[430px]"
      />
    </section>
  );
}
