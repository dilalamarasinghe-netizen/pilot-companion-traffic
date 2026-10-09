const ADSB_LOL_URL =
  "https://api.adsb.lol/v2/point/0/0/20000";

const REQUEST_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;

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

export async function fetchTraffic(): Promise<AdsbAircraft[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

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

      const data = (await response.json()) as AdsbResponse;

      return data.ac ?? [];
    } catch (error) {
      lastError = error;

      console.error(
        `ADSB.lol attempt ${attempt} failed:`,
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
    `ADSB.lol failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error
        ? lastError.message
        : String(lastError)
    }`,
  );
}