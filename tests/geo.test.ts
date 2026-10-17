import { describe, expect, it } from "vitest";
import { classifyPresence, haversineMeters } from "../shared/geo";

const fence = { lat: 42.3601, lng: -71.0589, radiusM: 150 };

describe("classifyPresence", () => {
  it("marks missing ping as no-location", () => {
    expect(classifyPresence({ noLocation: true }, fence)).toBe("no-location");
    expect(classifyPresence(null, fence)).toBe("no-location");
  });

  it("marks a tight in-room ping as in", () => {
    expect(classifyPresence({ lat: 42.3601, lng: -71.0589, accuracy: 12 }, fence)).toBe("in");
  });

  it("marks a far ping as out", () => {
    expect(classifyPresence({ lat: 42.3736, lng: -71.1097, accuracy: 25 }, fence)).toBe("out");
  });

  it("marks huge accuracy as uncertain", () => {
    expect(classifyPresence({ lat: 42.3601, lng: -71.0589, accuracy: 400 }, fence)).toBe("uncertain");
  });

  it("marks no fence as uncertain", () => {
    expect(classifyPresence({ lat: 42.3601, lng: -71.0589, accuracy: 12 }, null)).toBe("uncertain");
  });
});

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters(fence, fence)).toBeLessThan(1);
  });
});
