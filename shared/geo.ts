export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

export type GeoPing = GeoFix | { noLocation: true };

export type Fence = {
  lat: number;
  lng: number;
  radiusM: number;
};

export type PresenceBucket = "in" | "out" | "uncertain" | "no-location";

export function isGeoFix(ping: GeoPing | null | undefined): ping is GeoFix {
  return !!ping && !("noLocation" in ping);
}

/** Great-circle distance in meters. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Teacher-client presence buckets (not a server 403).
 * Entire accuracy circle inside fence → in; entirely outside → out;
 * missing/huge accuracy or straddling the fence → uncertain.
 */
export function classifyPresence(ping: GeoPing | null | undefined, fence: Fence | null | undefined): PresenceBucket {
  if (!ping || "noLocation" in ping) return "no-location";
  if (!fence) return "uncertain";
  const acc = Number.isFinite(ping.accuracy) ? ping.accuracy : Number.POSITIVE_INFINITY;
  if (acc > fence.radiusM) return "uncertain";
  const d = haversineMeters(ping, fence);
  if (d + acc < fence.radiusM) return "in";
  if (d - acc > fence.radiusM) return "out";
  return "uncertain";
}

export const DEFAULT_FENCE_RADIUS_M = 150;
