const EARTH_RADIUS_NM = 3440.065;

export type AircraftState = {
  icao24: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  groundSpeed?: number;
  track?: number;
  callsign?: string;
  registration?: string;
  aircraftType?: string;
  lastRealUpdate: number;
};

export type EstimatedAircraft = {
  latitude: number;
  longitude: number;
};

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function toDegrees(value: number): number {
  return value * 180 / Math.PI;
}

export function estimatePosition(
  state: AircraftState,
  now: number,
): EstimatedAircraft | null {
  if (
    typeof state.groundSpeed !== "number" ||
    typeof state.track !== "number"
  ) {
    return null;
  }

  if (state.groundSpeed < 80) {
    return null;
  }

  const ageSeconds = (now - state.lastRealUpdate) / 1000;

  if (ageSeconds <= 0 || ageSeconds > 30 * 60) {
    return null;
  }

  const distanceNm =
    state.groundSpeed * (ageSeconds / 3600);

  const angularDistance =
    distanceNm / EARTH_RADIUS_NM;

  const bearing = toRadians(state.track);
  const latitude1 = toRadians(state.latitude);
  const longitude1 = toRadians(state.longitude);

  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance) +
    Math.cos(latitude1) *
      Math.sin(angularDistance) *
      Math.cos(bearing),
  );

  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(latitude1),
      Math.cos(angularDistance) -
        Math.sin(latitude1) * Math.sin(latitude2),
    );

  let longitude = toDegrees(longitude2);

  longitude = ((longitude + 540) % 360) - 180;

  return {
    latitude: toDegrees(latitude2),
    longitude,
  };
}