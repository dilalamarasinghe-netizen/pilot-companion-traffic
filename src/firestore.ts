import {
  initializeApp,
  applicationDefault,
} from "firebase-admin/app";

import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "pilot-companion-25",
});

const db = getFirestore();

const TRAFFIC_COLLECTION = "trafficShards";
const SHARD_COUNT = 32;

export type StoredAircraftState = {
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

type TrafficAircraft = StoredAircraftState & {
  source: "adsbLol" | "estimated";
  lastUpdated: number;
};

type ShardDocument = {
  aircraft?: TrafficAircraft[];
};

function getShardId(icao24: string): number {
  let hash = 0;

  for (let i = 0; i < icao24.length; i++) {
    hash = (hash * 31 + icao24.charCodeAt(i)) >>> 0;
  }

  return hash % SHARD_COUNT;
}

function getShardDocumentId(index: number): string {
  return `shard-${index.toString().padStart(2, "0")}`;
}

function cleanAircraft(
  aircraft: TrafficAircraft,
): TrafficAircraft {
  const result: TrafficAircraft = {
    icao24: aircraft.icao24,
    latitude: aircraft.latitude,
    longitude: aircraft.longitude,
    source: aircraft.source,
    lastRealUpdate: aircraft.lastRealUpdate,
    lastUpdated: aircraft.lastUpdated,
  };

  if (aircraft.altitude !== undefined) {
    result.altitude = aircraft.altitude;
  }

  if (aircraft.groundSpeed !== undefined) {
    result.groundSpeed = aircraft.groundSpeed;
  }

  if (aircraft.track !== undefined) {
    result.track = aircraft.track;
  }

  if (aircraft.callsign !== undefined) {
    result.callsign = aircraft.callsign;
  }

  if (aircraft.registration !== undefined) {
    result.registration = aircraft.registration;
  }

  if (aircraft.aircraftType !== undefined) {
    result.aircraftType = aircraft.aircraftType;
  }

  return result;
}

export async function loadAircraftStates(): Promise<
  StoredAircraftState[]
> {
  const references = Array.from(
    { length: SHARD_COUNT },
    (_, index) =>
      db
        .collection(TRAFFIC_COLLECTION)
        .doc(getShardDocumentId(index)),
  );

  const snapshots = await db.getAll(...references);

  const states: StoredAircraftState[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }

    const data =
      snapshot.data() as ShardDocument | undefined;

    if (!data?.aircraft) {
      continue;
    }

    for (const aircraft of data.aircraft) {
      if (
        typeof aircraft.icao24 !== "string" ||
        typeof aircraft.latitude !== "number" ||
        typeof aircraft.longitude !== "number" ||
        typeof aircraft.lastRealUpdate !== "number"
      ) {
        continue;
      }

      states.push({
        icao24: aircraft.icao24,
        latitude: aircraft.latitude,
        longitude: aircraft.longitude,
        altitude:
          typeof aircraft.altitude === "number"
            ? aircraft.altitude
            : undefined,
        groundSpeed:
          typeof aircraft.groundSpeed === "number"
            ? aircraft.groundSpeed
            : undefined,
        track:
          typeof aircraft.track === "number"
            ? aircraft.track
            : undefined,
        callsign:
          typeof aircraft.callsign === "string"
            ? aircraft.callsign
            : undefined,
        registration:
          typeof aircraft.registration === "string"
            ? aircraft.registration
            : undefined,
        aircraftType:
          typeof aircraft.aircraftType === "string"
            ? aircraft.aircraftType
            : undefined,
        lastRealUpdate:
          aircraft.lastRealUpdate,
      });
    }
  }

  return states;
}

export async function writeTrafficCache(
  aircraft: TrafficAircraft[],
): Promise<void> {
  const shards: TrafficAircraft[][] =
    Array.from(
      { length: SHARD_COUNT },
      () => [],
    );

  for (const item of aircraft) {
    const shardId = getShardId(item.icao24);

    shards[shardId].push(
      cleanAircraft(item),
    );
  }

  const batch = db.batch();

  for (let i = 0; i < SHARD_COUNT; i++) {
    const reference = db
      .collection(TRAFFIC_COLLECTION)
      .doc(getShardDocumentId(i));

    batch.set(reference, {
      aircraft: shards[i],
      count: shards[i].length,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}