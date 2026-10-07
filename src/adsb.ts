const ADSB_LOL_URL = "https://api.adsb.lol/v2/point/0/0/20000";

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

export async function fetchTraffic(): Promise<AdsbAircraft[]> {
  const response = await fetch(ADSB_LOL_URL, {
    headers: {
      "User-Agent": "Pilot Companion aviation application",
    },
  });

  if (!response.ok) {
    throw new Error(
      `ADSB.lol returned HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as AdsbResponse;

  return data.ac ?? [];
}