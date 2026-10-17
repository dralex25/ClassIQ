import type { GeoPing } from "@shared/geo";

/** Optional demo override: /?mockGeo=lat,lng,accuracy */
export function mockGeoFromUrl(): GeoPing | null {
  const raw = new URLSearchParams(window.location.search).get("mockGeo");
  if (!raw) return null;
  const [lat, lng, acc] = raw.split(",").map(Number);
  if (![lat, lng, acc].every(Number.isFinite)) return { noLocation: true };
  return { lat, lng, accuracy: acc };
}

export function pingLocation(): Promise<GeoPing> {
  const mock = mockGeoFromUrl();
  if (mock) return Promise.resolve(mock);
  if (!navigator.geolocation) {
    return Promise.resolve({ noLocation: true });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => resolve({ noLocation: true }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}
