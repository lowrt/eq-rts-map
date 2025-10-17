export interface StationInfo {
  uuid: string;
  code: string;
  lat: number;
  lon: number;
  network: string;
}

export interface RTSData {
  id: string;
  i: number;
  I: number;
  alert: number;
}

export interface StationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    code: string;
    intensity: number;
    color: string;
  };
}

export interface StationGeoJSON {
  type: 'FeatureCollection';
  features: StationFeature[];
}

const INTENSITY_COLORS: Record<string, string> = {
  intensity_3: '#0005d0',
  intensity_2: '#004bf8',
  intensity_1: '#009EF8',
  intensity0: '#79E5FD',
  intensity1: '#49E9AD',
  intensity2: '#44fa34',
  intensity3: '#beff0c',
  intensity4: '#fff000',
  intensity5: '#ff9300',
  intensity6: '#fc5235',
  intensity7: '#b720e9',
};

function getIntensityColor(intensity: number): string {
  if (intensity <= -3) return INTENSITY_COLORS.intensity_3;
  if (intensity === -2) return INTENSITY_COLORS.intensity_2;
  if (intensity === -1) return INTENSITY_COLORS.intensity_1;
  if (intensity === 0) return INTENSITY_COLORS.intensity0;
  if (intensity === 1) return INTENSITY_COLORS.intensity1;
  if (intensity === 2) return INTENSITY_COLORS.intensity2;
  if (intensity === 3) return INTENSITY_COLORS.intensity3;
  if (intensity === 4) return INTENSITY_COLORS.intensity4;
  if (intensity === 5) return INTENSITY_COLORS.intensity5;
  if (intensity === 6) return INTENSITY_COLORS.intensity6;
  if (intensity >= 7) return INTENSITY_COLORS.intensity7;
  return INTENSITY_COLORS.intensity0;
}

export async function fetchStationInfo(): Promise<Map<string, StationInfo>> {
  const response = await fetch('https://api-1.exptech.dev/api/v1/trem/station');
  const data = await response.json();
  const stationMap = new Map<string, StationInfo>();

  for (const [uuid, station] of Object.entries(data)) {
    stationMap.set(uuid, station as StationInfo);
  }

  return stationMap;
}

export async function fetchRTSData(): Promise<Record<string, RTSData>> {
  const response = await fetch('https://lb.exptech.dev/api/v1/trem/rts');
  const data = await response.json();
  return data;
}

export function createStationGeoJSON(
  stationMap: Map<string, StationInfo>,
  rtsData: Record<string, RTSData>
): StationGeoJSON {
  const features: StationFeature[] = [];

  for (const [stationId, rts] of Object.entries(rtsData)) {
    const station = stationMap.get(stationId);
    if (!station) continue;

    const intensity = rts.alert === 1 ? rts.I : rts.i;
    const color = getIntensityColor(intensity);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [station.lon, station.lat],
      },
      properties: {
        id: stationId,
        code: station.code,
        intensity,
        color,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export async function fetchAndProcessStationData(): Promise<StationGeoJSON> {
  const [stationMap, rtsData] = await Promise.all([
    fetchStationInfo(),
    fetchRTSData(),
  ]);

  return createStationGeoJSON(stationMap, rtsData);
}
