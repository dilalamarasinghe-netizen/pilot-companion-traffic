import {
  fetchTraffic,
  AdsbAircraft,
} from "./adsb.js";

import {
  fetchAirLabsTraffic,
} from "./airlabs.js";

import {
  reconcileTraffic,
  ReconciledAircraft,
} from "./reconciler.js";

import {
  loadAircraftStates,
  writeTrafficCache,
} from "./firestore.js";

import {
  estimatePosition,
} from "./estimator.js";

const MAX_ESTIMATE_AGE_MS =
  30 * 60 * 1000;

type TrafficAircraft =
  ReconciledAircraft & {
    source:
      | "adsbLol"
      | "airLabs"
      | "estimated";
  };

async function collectTraffic(): Promise<void> {
  const now = Date.now();

  console.log(
    "Fetching global ADS-B traffic...",
  );

  const adsbPromise =
    fetchTraffic();

  console.log(
    "Fetching AirLabs traffic...",
  );

  const airLabsPromise =
    fetchAirLabsTraffic();

  const [
  adsbResult,
  airLabsResult,
] = await Promise.allSettled([
  adsbPromise,
  airLabsPromise,
]);

const rawAdsbAircraft: AdsbAircraft[] =
  adsbResult.status === "fulfilled"
    ? adsbResult.value
    : [];

const airLabsAircraft =
  airLabsResult.status === "fulfilled"
    ? airLabsResult.value
    : [];

if (adsbResult.status === "rejected") {
  console.error(
    "ADSB.lol unavailable; continuing with AirLabs if available.",
    adsbResult.reason,
  );
}

if (airLabsResult.status === "rejected") {
  console.error(
    "AirLabs unavailable; continuing with ADSB.lol if available.",
    airLabsResult.reason,
  );
}

if (
  adsbResult.status === "rejected" &&
  airLabsResult.status === "rejected"
) {
  throw new Error(
    "Both traffic providers failed. Existing traffic cache was not overwritten.",
  );
}

  console.log(
    `ADSB.lol aircraft: ${rawAdsbAircraft.length}`,
  );

  console.log(
    `AirLabs aircraft: ${airLabsAircraft.length}`,
  );

  const liveAircraft =
    reconcileTraffic(
      rawAdsbAircraft,
      airLabsAircraft,
      now,
    );

  console.log(
    `Reconciled live aircraft: ${liveAircraft.length}`,
  );

  const currentAircraft =
    new Map<string, TrafficAircraft>();

  for (const aircraft of liveAircraft) {
    currentAircraft.set(
      aircraft.icao24,
      aircraft,
    );
  }

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
        latitude:
          estimated.latitude,
        longitude:
          estimated.longitude,

        altitude:
          previous.altitude,

        groundSpeed:
          previous.groundSpeed,

        track:
          previous.track,

        callsign:
          previous.callsign,

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

  await writeTrafficCache(
    output,
  );

  const adsbCount =
    output.filter(
      (aircraft) =>
        aircraft.source === "adsbLol",
    ).length;

  const airLabsCount =
    output.filter(
      (aircraft) =>
        aircraft.source === "airLabs",
    ).length;

  console.log(
    `ADSB.lol used: ${adsbCount}`,
  );

  console.log(
    `AirLabs used: ${airLabsCount}`,
  );

  console.log(
    `Estimated aircraft: ${estimatedCount}`,
  );

  console.log(
    `Traffic cache updated: ${output.length} aircraft.`,
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