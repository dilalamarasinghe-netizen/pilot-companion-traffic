import {
  fetchTraffic,
  AdsbAircraft,
} from "./adsb.js";

import {
  loadAircraftStates,
  writeTrafficCache,
} from "./firestore.js";

import {
  estimatePosition,
} from "./estimator.js";

const MAX_ESTIMATE_AGE_MS =
  30 * 60 * 1000;

type TrafficAircraft = {
  icao24: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  groundSpeed?: number;
  track?: number;
  callsign?: string;
  registration?: string;
  aircraftType?: string;
  source: "adsbLol" | "estimated";
  lastRealUpdate: number;
  lastUpdated: number;
};

function normalizeIcao24(
  hex?: string,
): string | null {
  if (!hex) {
    return null;
  }

  const value =
    hex.trim().toLowerCase();

  if (!/^[0-9a-f]{6}$/.test(value)) {
    return null;
  }

  return value;
}

function getAltitude(
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

function createState(
  aircraft: AdsbAircraft,
  now: number,
): TrafficAircraft | null {
  const icao24 =
    normalizeIcao24(aircraft.hex);

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
      getAltitude(aircraft.alt_baro),
    groundSpeed:
      typeof aircraft.gs === "number"
        ? aircraft.gs
        : undefined,
    track:
      typeof aircraft.track === "number"
        ? aircraft.track
        : undefined,
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

async function collectTraffic(): Promise<void> {
  const now = Date.now();

  console.log(
    "Fetching global ADS-B traffic...",
  );

  const rawAircraft =
    await fetchTraffic();

  console.log(
    `Received ${rawAircraft.length} aircraft.`,
  );

  const currentAircraft =
    new Map<string, TrafficAircraft>();

  for (const aircraft of rawAircraft) {
    if (aircraft.on_ground === true) {
      continue;
    }

    const state =
      createState(
        aircraft,
        now,
      );

    if (!state) {
      continue;
    }

    currentAircraft.set(
      state.icao24,
      state,
    );
  }

  console.log(
    `Valid airborne aircraft: ${currentAircraft.size}`,
  );

  console.log(
    "Loading previous aircraft states...",
  );

  const previousStates =
    await loadAircraftStates();

  console.log(
    `Previous aircraft states: ${previousStates.length}`,
  );

  let estimatedCount = 0;

  for (const previous of previousStates) {
    if (
      currentAircraft.has(
        previous.icao24,
      )
    ) {
      continue;
    }

    const age =
      now - previous.lastRealUpdate;

    if (
      age > MAX_ESTIMATE_AGE_MS
    ) {
      continue;
    }

    const estimated =
      estimatePosition(
        previous,
        now,
      );

    if (!estimated) {
      continue;
    }

    estimatedCount++;

    currentAircraft.set(
      previous.icao24,
      {
        icao24: previous.icao24,
        latitude: estimated.latitude,
        longitude: estimated.longitude,
        altitude: previous.altitude,
        groundSpeed:
          previous.groundSpeed,
        track: previous.track,
        callsign: previous.callsign,
        registration:
          previous.registration,
        aircraftType:
          previous.aircraftType,
        source: "estimated",
        lastRealUpdate:
          previous.lastRealUpdate,
        lastUpdated: now,
      },
    );
  }

  const output =
    Array.from(
      currentAircraft.values(),
    );

  console.log(
    `Writing ${output.length} aircraft into 32 Firestore shards...`,
  );

  await writeTrafficCache(output);

  console.log(
    `Traffic cache updated: ${output.length} aircraft.`,
  );

  console.log(
    `Estimated aircraft: ${estimatedCount}`,
  );

  console.log(
    "Collection cycle complete.",
  );
}

collectTraffic().catch(
  (error: unknown) => {
    console.error(
      "Traffic collection failed:",
      error,
    );

    process.exitCode = 1;
  },
);