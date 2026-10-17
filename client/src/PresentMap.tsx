import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { classifyPresence, type Fence as GeoFence, type PresenceBucket } from "@shared/geo";
import type { SubmissionDot } from "@shared/contract";

const COLORS: Record<PresenceBucket, string> = {
  in: "#3db8a8",
  out: "#e07a7a",
  uncertain: "#e0c06a",
  "no-location": "#9aadb8",
};

export function PresentMap({
  fence,
  dots,
  onPin,
}: {
  fence: GeoFence | null;
  dots: SubmissionDot[];
  onPin: (lat: number, lng: number) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const start = fence ?? { lat: 42.3601, lng: -71.0589 };
    const map = L.map(divRef.current).setView([start.lat, start.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => onPinRef.current(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (fence) {
      L.circle([fence.lat, fence.lng], {
        radius: fence.radiusM,
        color: "#3db8a8",
        weight: 2,
        fillOpacity: 0.12,
      }).addTo(layer);
      L.circleMarker([fence.lat, fence.lng], {
        radius: 7,
        color: "#eef3f7",
        fillColor: "#3db8a8",
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip("Fence origin")
        .addTo(layer);
      map.setView([fence.lat, fence.lng], Math.max(map.getZoom(), 15));
    }
    for (const dot of dots) {
      if (dot.noLocation || dot.lat == null || dot.lng == null) continue;
      const ping = { lat: dot.lat, lng: dot.lng, accuracy: dot.accuracy ?? 9999 };
      const bucket = classifyPresence(ping, fence);
      L.circleMarker([ping.lat, ping.lng], {
        radius: 8,
        color: "#0f1720",
        fillColor: COLORS[bucket],
        fillOpacity: 0.95,
        weight: 1,
      })
        .bindTooltip(`${dot.name} · ${bucket}${dot.accuracy != null ? ` · ±${Math.round(dot.accuracy)}m` : ""}`)
        .addTo(layer);
    }
  }, [fence, dots]);

  return <div ref={divRef} className="geo-map" />;
}
