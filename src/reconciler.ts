import type { AdsbAircraft } from "./adsb.js";
import type { AirLabsAircraft } from "./airlabs.js";

export type ReconciledAircraft = {
  icao24: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  groundSpeed?: number;
  track?: number;
  callsign?: string;
  registration?: string;
  aircraftType?: string;
  squawk?: string;
  departureIata?: string;
  departureIcao?: string;
  arrivalIata?: string;
  arrivalIcao?: string;
source:
  | "adsbLol"
  | "airLabs"
  | "estimated";
  lastRealUpdate: number;
  lastUpdated: number;
};

function normalizeHex(
  value: string | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const hex = value.trim().toLowerCase();

  return /^[0-9a-f]{6}$/.test(hex)
    ? hex
    : null;
}

function numberValue(
  value: number | string | undefined,
): number | undefined {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function airLabsTimestamp(
  aircraft: AirLabsAircraft,
  fallback: number,
): number {
  if (
    typeof aircraft.updated === "number" &&
    Number.isFinite(aircraft.updated)
  ) {
    return aircraft.updated * 1000;
  }

  return fallback;
}

function fromAdsb(
  aircraft: AdsbAircraft,
  now: number,
): ReconciledAircraft | null {
  const icao24 =
    normalizeHex(aircraft.hex);

  if (
    !icao24 ||
    typeof aircraft.lat !== "number" ||
    typeof aircraft.lon !== "number"
  ) {
    return null;
  }

  return {
    icao24,
    latitude: aircraft.lat,
    longitude: aircraft.lon,
    altitude:
      numberValue(aircraft.alt_baro),
    groundSpeed:
      aircraft.gs,
    track:
      aircraft.track,
    callsign:
      aircraft.flight?.trim() ||
      undefined,
    registration:
      aircraft.r?.trim() ||
      undefined,
    aircraftType:
      aircraft.t?.trim() ||
      undefined,
    source: "adsbLol",
    lastRealUpdate: now,
    lastUpdated: now,
  };
}

function fromAirLabs(
  aircraft: AirLabsAircraft,
  now: number,
): ReconciledAircraft | null {
  const icao24 =
    normalizeHex(aircraft.icao24);

  if (
    !icao24 ||
    typeof aircraft.latitude !== "number" ||
    typeof aircraft.longitude !== "number"
  ) {
    return null;
  }

  const updated =
    airLabsTimestamp(
      aircraft,
      now,
    );

  return {
    icao24,
    latitude: aircraft.latitude,
    longitude: aircraft.longitude,
    altitude:
      aircraft.altitude,
    groundSpeed:
      aircraft.groundSpeed,
    track:
      aircraft.track,
    callsign:
      aircraft.callsign,
    registration:
      aircraft.registration,
    aircraftType:
      aircraft.aircraftType,
    squawk:
      aircraft.squawk,
    departureIata:
      aircraft.departureIata,
    departureIcao:
      aircraft.departureIcao,
    arrivalIata:
      aircraft.arrivalIata,
    arrivalIcao:
      aircraft.arrivalIcao,
    source: "airLabs",
    lastRealUpdate: updated,
    lastUpdated: now,
  };
}

export function reconcileTraffic(
  adsbAircraft: AdsbAircraft[],
  airLabsAircraft: AirLabsAircraft[],
  now: number,
): ReconciledAircraft[] {
  const result =
    new Map<string, ReconciledAircraft>();

  // First add AirLabs.
  for (const aircraft of airLabsAircraft) {
    const parsed =
      fromAirLabs(
        aircraft,
        now,
      );

    if (!parsed) {
      continue;
    }

    result.set(
      parsed.icao24,
      parsed,
    );
  }

  // ADS-B.lol wins when the aircraft is
  // currently available there.
  for (const aircraft of adsbAircraft) {
    if (aircraft.on_ground === true) {
      continue;
    }

    const parsed =
      fromAdsb(
        aircraft,
        now,
      );

    if (!parsed) {
      continue;
    }

    const existing =
      result.get(parsed.icao24);

    if (!existing) {
      result.set(
        parsed.icao24,
        parsed,
      );
      continue;
    }

    // ADS-B.lol is our preferred live
    // positional source when available.
    result.set(
      parsed.icao24,
      parsed,
    );
  }

  return Array.from(
    result.values(),
  );
}