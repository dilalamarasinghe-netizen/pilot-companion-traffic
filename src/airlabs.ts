const AIRLABS_BASE_URL =
  "https://airlabs.co/api/v9";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

export type AirLabsAircraft = {
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
  status?: string;
  updated?: number;
};

type AirLabsResponse = {
  response?: unknown;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHex(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const hex = value.trim().toLowerCase();

  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return null;
  }

  return hex;
}

function numberValue(
  value: unknown,
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

function textValue(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  return text.length > 0
    ? text
    : undefined;
}

function parseAircraft(
  item: Record<string, unknown>,
): AirLabsAircraft | null {
  const icao24 =
    normalizeHex(item["hex"]);

  const latitude =
    numberValue(item["lat"]);

  const longitude =
    numberValue(item["lng"]);

  if (
    !icao24 ||
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    icao24,
    latitude,
    longitude,

    altitude:
      numberValue(item["alt"]),

    groundSpeed:
      numberValue(item["speed"]),

    track:
      numberValue(item["dir"]),

    callsign:
      textValue(item["flight_icao"]) ??
      textValue(item["flight_iata"]) ??
      textValue(item["flight_number"]),

    registration:
      textValue(item["reg_number"]),

    aircraftType:
      textValue(item["aircraft_icao"]),

    squawk:
      textValue(item["squawk"]),

    departureIata:
      textValue(item["dep_iata"]),

    departureIcao:
      textValue(item["dep_icao"]),

    arrivalIata:
      textValue(item["arr_iata"]),

    arrivalIcao:
      textValue(item["arr_icao"]),

    status:
      textValue(item["status"]),

    updated:
      numberValue(item["updated"]),
  };
}

export async function fetchAirLabsTraffic(): Promise<
  AirLabsAircraft[]
> {
  const apiKey =
    process.env.AIRLABS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "AIRLABS_API_KEY environment variable is missing.",
    );
  }

  const url = new URL(
    `${AIRLABS_BASE_URL}/flights`,
  );

  url.searchParams.set(
    "api_key",
    apiKey,
  );

  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      console.log(
        `Fetching AirLabs traffic (attempt ${attempt}/${MAX_ATTEMPTS})...`,
      );

      const response = await fetch(
        url,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "PilotCompanion/1.0",
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `AirLabs returned HTTP ${response.status}`,
        );
      }

      const data =
        (await response.json()) as AirLabsResponse;

      if (!Array.isArray(data.response)) {
        throw new Error(
          "AirLabs returned an invalid aircraft response.",
        );
      }

      const aircraft: AirLabsAircraft[] = [];

      for (const item of data.response) {
        if (
          typeof item !== "object" ||
          item === null ||
          Array.isArray(item)
        ) {
          continue;
        }

        const parsed = parseAircraft(
          item as Record<string, unknown>,
        );

        if (parsed) {
          aircraft.push(parsed);
        }
      }

      return aircraft;
    } catch (error) {
      lastError = error;

      console.error(
        `AirLabs attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        error,
      );

      if (attempt < MAX_ATTEMPTS) {
        await delay(attempt * 1000);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `AirLabs failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error
        ? lastError.message
        : String(lastError)
    }`,
  );
}