const ADSB_LOL_URL =
  "https://api.adsb.lol/v2/point/0/0/20000";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_500;

export type AdsbAircraft = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
  r?: string;
  t?: string;
  on_ground?: boolean;
};

type AdsbResponse = {
  ac?: AdsbAircraft[];
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = (
    error as Error & { cause?: unknown }
  ).cause;

  if (
    cause !== null &&
    typeof cause === "object" &&
    "code" in cause
  ) {
    const code = String(
      (cause as { code: unknown }).code,
    );

    return `${error.name}: ${error.message} (cause: ${code})`;
  }

  return `${error.name}: ${error.message}`;
}

export async function fetchTraffic(): Promise<AdsbAircraft[]> {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    const controller = new AbortController();

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      console.log(
        `Fetching ADSB.lol traffic (attempt ${attempt}/${MAX_ATTEMPTS})...`,
      );

      const response = await fetch(ADSB_LOL_URL, {
        headers: {
          "User-Agent": "Pilot Companion aviation application",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `ADSB.lol returned HTTP ${response.status}`,
        );
      }

      const data = (
        await response.json()
      ) as AdsbResponse;

      if (!Array.isArray(data.ac)) {
        throw new Error(
          "ADSB.lol returned an invalid aircraft response: missing aircraft array.",
        );
      }

      console.log(
        `ADSB.lol successfully returned ${data.ac.length} aircraft.`,
      );

      return data.ac;
    } catch (error) {
      lastError = timedOut
        ? new Error(
            `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
          )
        : error;

      console.error(
        `ADSB.lol attempt ${attempt}/${MAX_ATTEMPTS} failed: ${getErrorDetails(lastError)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_ATTEMPTS) {
      const exponentialDelay =
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);

      const jitter =
        0.75 + Math.random() * 0.5;

      const retryDelay = Math.round(
        exponentialDelay * jitter,
      );

      console.log(
        `Retrying ADSB.lol in ${(retryDelay / 1000).toFixed(1)} seconds...`,
      );

      await delay(retryDelay);
    }
  }

  throw new Error(
    `ADSB.lol failed after ${MAX_ATTEMPTS} attempts: ${getErrorDetails(lastError)}`,
  );
}