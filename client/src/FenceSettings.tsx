import { useEffect, useState } from "react";
import { api } from "./api";
import { PresentMap } from "./PresentMap";
import { pingLocation } from "./pingLocation";
import { DEFAULT_FENCE_RADIUS_M, type Fence } from "@shared/geo";

export function FenceSettings({ courseId }: { courseId: string }) {
  const [fence, setFence] = useState<Fence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fence(courseId).then((r) => setFence(r.fence)).catch(() => undefined);
  }, [courseId]);

  async function saveFence(next: Fence) {
    setFence(next);
    try {
      await api.setFence(courseId, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save fence");
    }
  }

  async function useGps() {
    setError(null);
    const ping = await pingLocation();
    if ("noLocation" in ping) {
      setError("No GPS fix — click the map to drop a pin.");
      return;
    }
    await saveFence({
      lat: ping.lat,
      lng: ping.lng,
      radiusM: fence?.radiusM ?? DEFAULT_FENCE_RADIUS_M,
    });
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Geofence (teacher only)</h3>
      <p className="hint">
        Pin the room and set the accept radius here. Present never shows this to the class. Analytics
        uses it to bucket answers.
      </p>
      <PresentMap
        fence={fence}
        dots={[]}
        onPin={(lat, lng) =>
          void saveFence({ lat, lng, radiusM: fence?.radiusM ?? DEFAULT_FENCE_RADIUS_M })
        }
      />
      <label htmlFor="radius">Radius {fence?.radiusM ?? DEFAULT_FENCE_RADIUS_M} m</label>
      <input
        id="radius"
        type="range"
        min={20}
        max={400}
        value={fence?.radiusM ?? DEFAULT_FENCE_RADIUS_M}
        onChange={(e) => {
          const radiusM = Number(e.target.value);
          if (!fence) return;
          void saveFence({ ...fence, radiusM });
        }}
      />
      <div className="row">
        <button type="button" className="secondary" onClick={() => void useGps()}>
          Use my GPS
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
