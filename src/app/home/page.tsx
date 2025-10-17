'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Map, { NavigationControl, Source, Layer, type MapRef } from 'react-map-gl/maplibre';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchAndProcessStationData, type StationGeoJSON } from '@/lib/rts';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const generateWaveformData = (channelIndex: number) => {
  const length = 3000;
  const data: number[] = [];
  for (let i = 0; i < length; i++) {
    const base = Math.sin(i / 20) * 50;
    const noise = (Math.random() - 0.5) * 30;
    let value = base + noise;

    if (channelIndex === 2) {
      const timeInSeconds = i / 10;
      if (timeInSeconds >= 18 && timeInSeconds <= 22) {
        value *= 10;
      }
    }

    data.push(value);
  }
  return data.reverse();
};

const generateTimeLabels = (length: number) => {
  return Array.from({ length }, (_, i) => {
    const timeInSeconds = Math.round((length - i) / 10);
    return timeInSeconds.toString();
  });
};

const TOTAL_HEIGHT = 630;
const NUM_CHANNELS = 5;
const TOP_BOTTOM_GAP_REDUCTION = 50;
const CHANNEL_LABEL_OFFSETS = [30, 45, 50, 60, 70];

const BASE_GAP = TOTAL_HEIGHT / (NUM_CHANNELS + 1);
const TOP_GAP = BASE_GAP - TOP_BOTTOM_GAP_REDUCTION;
const MIDDLE_GAP_EXTRA = (TOP_BOTTOM_GAP_REDUCTION * 2) / 4;
const MIDDLE_GAP = BASE_GAP + MIDDLE_GAP_EXTRA;

const CHANNEL_CONFIGS = [
  { name: 'Channel 1 (Z)', baseline: TOTAL_HEIGHT - TOP_GAP, color: 'rgb(255, 255, 255)', scale: 1.0 },
  { name: 'Channel 2 (N)', baseline: TOTAL_HEIGHT - TOP_GAP - MIDDLE_GAP, color: 'rgb(255, 255, 255)', scale: 1.0 },
  { name: 'Channel 3 (E)', baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 2), color: 'rgb(255, 255, 255)', scale: 1.0 },
  { name: 'Channel 4 (H1)', baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 3), color: 'rgb(255, 255, 255)', scale: 1.0 },
  { name: 'Channel 5 (H2)', baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 4), color: 'rgb(255, 255, 255)', scale: 1.0 },
];

const CHART_CONTAINER = {
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
};

export default function Home() {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef>(null);
  const [stationData, setStationData] = useState<StationGeoJSON | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchAndProcessStationData();
        setStationData(data);
      } catch (error) {
        console.error('Failed to fetch station data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);

    return () => clearInterval(interval);
  }, []);

  const timeLabels = useMemo(() => generateTimeLabels(3000), []);

  const chartData = useMemo(() => {
    const datasets = CHANNEL_CONFIGS.map((config, index) => {
      const rawData = generateWaveformData(index);
      const offsetData = rawData.map(value => (value * config.scale) + config.baseline);

      return {
        label: config.name,
        data: offsetData,
        borderColor: config.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
      };
    });

    return {
      labels: timeLabels,
      datasets: datasets,
    };
  }, [timeLabels]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    layout: {
      padding: 0,
    },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: function(context: any) {
            const datasetIndex = context.datasetIndex;
            const config = CHANNEL_CONFIGS[datasetIndex];
            const actualValue = (context.parsed.y - config.baseline) / config.scale;
            return `${context.dataset.label}: ${actualValue.toFixed(2)}`;
          }
        }
      },
    },
    scales: {
      x: {
        display: true,
        reverse: false,
        title: {
          display: true,
          text: 'Time (seconds ago)',
          color: theme === 'dark' ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
        ticks: {
          color: theme === 'dark' ? '#9ca3af' : '#6b7280',
          autoSkip: true,
          maxTicksLimit: 10,
          font: {
            size: 10,
          },
        },
        grid: {
          color: theme === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.4)',
          drawOnChartArea: true,
          lineWidth: 0.5,
          drawTicks: false,
        },
        border: {
          display: false,
        },
      },
      y: {
        min: 0,
        max: TOTAL_HEIGHT,
        display: false,
        grid: {
          display: true,
          color: (context: any) => {
            const value = context.tick.value;
            const isBaseline = CHANNEL_CONFIGS.some(c => c.baseline === value);
            if (isBaseline) {
              return theme === 'dark' ? 'rgba(107, 114, 128, 0.4)' : 'rgba(156, 163, 175, 0.4)';
            }
            return theme === 'dark' ? 'rgba(55, 65, 81, 0.2)' : 'rgba(229, 231, 235, 0.3)';
          },
          lineWidth: (context: any) => {
            const value = context.tick.value;
            const isBaseline = CHANNEL_CONFIGS.some(c => c.baseline === value);
            return isBaseline ? 0.8 : 0.3;
          },
        },
        border: {
          display: false,
        },
      },
    },
  }), [theme]);

  const mapStyle: any = useMemo(() => ({
    version: 8,
    name: 'ExpTech Studio',
    sources: {
      map: {
        type: 'vector',
        url: 'https://lb.exptech.dev/api/v1/map/tiles/tiles.json',
        tileSize: 512,
        buffer: 64,
      },
    },
    sprite: '',
    glyphs: 'https://glyphs.geolonia.com/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#1f2025',
        },
      },
      {
        id: 'county',
        type: 'fill',
        source: 'map',
        'source-layer': 'city',
        paint: {
          'fill-color': '#3F4045',
          'fill-opacity': 1,
        },
      },
      {
        id: 'town',
        type: 'fill',
        source: 'map',
        'source-layer': 'town',
        paint: {
          'fill-color': '#3F4045',
          'fill-opacity': 1,
        },
      },
      {
        id: 'county-outline',
        source: 'map',
        'source-layer': 'city',
        type: 'line',
        paint: {
          'line-color': '#a9b4bc',
        },
      },
      {
        id: 'global',
        type: 'fill',
        source: 'map',
        'source-layer': 'global',
        paint: {
          'fill-color': '#3F4045',
          'fill-opacity': 1,
        },
      },
      {
        id: 'tsunami',
        type: 'line',
        source: 'map',
        'source-layer': 'tsunami',
        paint: {
          'line-opacity': 0,
          'line-width': 3,
        },
      },
    ],
  }), []);

  return (
    <div className="flex h-screen w-full">
      <div className="w-1/2 h-full">
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: 120.8,
            latitude: 23.6,
            zoom: 6.5
          }}
          dragPan={false}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          attributionControl={false}
          scrollZoom={false}
          doubleClickZoom={false}
          keyboard={false}
          dragRotate={false}
          touchZoomRotate={false}
          boxZoom={false}
          onError={(error) => {
            console.log('Map error:', error);
          }}
        >
          {stationData && (
            <Source id="stations" type="geojson" data={stationData}>
              <Layer
                id="station-circles"
                type="circle"
                layout={{
                  'circle-sort-key': ['get', 'sortKey'],
                }}
                paint={{
                  'circle-radius': 3,
                  'circle-color': ['get', 'color'],
                  'circle-opacity': 1,
                  'circle-stroke-width': 1,
                  'circle-stroke-color': '#ffffff',
                }}
              />
            </Source>
          )}
        </Map>
      </div>

      <div className="w-1/2 h-full bg-gray-50 dark:bg-gray-900 relative">
        <div className="absolute left-2 top-0 bottom-0 z-10 pointer-events-none">
          {CHANNEL_CONFIGS.map((config, index) => {
            const labelYPosition = config.baseline + CHANNEL_LABEL_OFFSETS[index];
            const topPercentage = ((TOTAL_HEIGHT - labelYPosition) / TOTAL_HEIGHT) * 100;

            return (
              <div
                key={config.name}
                className="text-xs font-semibold px-2 py-1 rounded absolute -translate-y-1/2"
                style={{
                  color: config.color,
                  backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
                  top: `${topPercentage}%`,
                }}
              >
                {config.name}
              </div>
            );
          })}
        </div>

        <div
          className="absolute"
          style={{
            top: CHART_CONTAINER.top,
            left: CHART_CONTAINER.left,
            width: CHART_CONTAINER.width,
            height: CHART_CONTAINER.height,
          }}
        >
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
