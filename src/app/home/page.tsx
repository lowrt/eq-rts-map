'use client';

import { useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import Map, { NavigationControl, type MapRef } from 'react-map-gl/maplibre';
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

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Generate sample seismic waveform data
const generateWaveformData = (channelIndex: number) => {
  const length = 3000; // 300 seconds * 10 samples per second
  const data: number[] = [];
  for (let i = 0; i < length; i++) {
    // Simulate seismic wave with varying amplitude
    const base = Math.sin(i / 20) * 50;
    const noise = (Math.random() - 0.5) * 30;
    let value = base + noise;

    // For Channel 3 (index 2), amplify data around 20 seconds (index 200) by 10x
    if (channelIndex === 2) {
      const timeInSeconds = i / 10;
      // Amplify data between 18s and 22s from the newest (right side)
      if (timeInSeconds >= 18 && timeInSeconds <= 22) {
        value *= 10;
      }
    }

    data.push(value);
  }
  return data.reverse(); // Reverse so newest (0s) is on the right
};

// Generate time labels - newest (0s) on right, oldest (300s) on left
const generateTimeLabels = (length: number) => {
  return Array.from({ length }, (_, i) => {
    const timeInSeconds = Math.floor((length - 1 - i) / 10); // Reverse: 300...0, as integers
    return timeInSeconds.toString();
  });
};

// ==================== CHART LAYOUT CONSTANTS ====================
// Adjust these values to customize the chart layout

const TOTAL_HEIGHT = 630;                    // Total chart height in pixels
const NUM_CHANNELS = 5;                      // Number of waveform channels
const TOP_BOTTOM_GAP_REDUCTION = 50;         // Reduce top/bottom gaps by this amount (px)
const LABEL_OFFSET_FROM_BASELINE = 30;       // Label position: baseline + 30 (upward)

// Calculate spacing distribution
const BASE_GAP = TOTAL_HEIGHT / (NUM_CHANNELS + 1);           // 105px base gap
const TOP_GAP = BASE_GAP - TOP_BOTTOM_GAP_REDUCTION;          // 55px (105 - 50)
const BOTTOM_GAP = BASE_GAP - TOP_BOTTOM_GAP_REDUCTION;       // 55px (105 - 50)
const MIDDLE_GAP_EXTRA = (TOP_BOTTOM_GAP_REDUCTION * 2) / 4;  // 25px extra per middle gap
const MIDDLE_GAP = BASE_GAP + MIDDLE_GAP_EXTRA;               // 130px (105 + 25)

// Channel configurations with custom spacing
// Top gap: 55px
// Middle gaps (x4): 130px each
// Bottom gap: 55px
// Total: 55 + (130 * 4) + 55 = 630px ✓
const CHANNEL_CONFIGS = [
  { name: 'Channel 1 (Z)', baseline: TOTAL_HEIGHT - TOP_GAP, color: 'rgb(255, 99, 132)' },                                    // 575 (630 - 55)
  { name: 'Channel 2 (N)', baseline: TOTAL_HEIGHT - TOP_GAP - MIDDLE_GAP, color: 'rgb(54, 162, 235)' },                      // 445 (575 - 130)
  { name: 'Channel 3 (E)', baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 2), color: 'rgb(75, 192, 192)' },                // 315 (445 - 130)
  { name: 'Channel 4 (H1)', baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 3), color: 'rgb(255, 206, 86)' },               // 185 (315 - 130)
  { name: 'Channel 5 (H2)', baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 4), color: 'rgb(153, 102, 255)' },              // 55 (185 - 130)
];

// ================================================================

export default function Home() {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef>(null);

  // Memoize time labels and chart data to avoid regenerating on every render
  const timeLabels = useMemo(() => generateTimeLabels(3000), []);

  const chartData = useMemo(() => {
    const datasets = CHANNEL_CONFIGS.map((config, index) => {
      const rawData = generateWaveformData(index);
      // Offset each channel's data by its baseline
      const offsetData = rawData.map(value => value + config.baseline);

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

  // Chart options - memoized to prevent chart re-render
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
        display: false, // Hide legend
      },
      title: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          // Show actual amplitude (subtract baseline) in tooltip
          label: function(context: any) {
            const datasetIndex = context.datasetIndex;
            const baseline = CHANNEL_CONFIGS[datasetIndex].baseline;
            const actualValue = context.parsed.y - baseline;
            return `${context.dataset.label}: ${actualValue.toFixed(2)}`;
          }
        }
      },
    },
    scales: {
      x: {
        display: true,
        reverse: false, // Data is already reversed
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
          maxTicksLimit: 10, // Sparse labels to avoid crowding
          font: {
            size: 10,
          },
        },
        grid: {
          color: theme === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.4)', // Faded color
          drawOnChartArea: true,
          lineWidth: 0.5, // Thinner lines
          drawTicks: false, // Remove tick marks
        },
        border: {
          display: false, // Remove axis border
        },
      },
      y: {
        min: 0,
        max: TOTAL_HEIGHT,
        display: false, // Hide Y-axis
        grid: {
          display: true,
          color: (context: any) => {
            // Highlight baseline grid lines with subtle colors
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

  // ExpTech Studio map style - memoized to prevent recreation
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
      {/* Left side - Map */}
      <div className="w-1/2 h-full">
        <Map
            ref={mapRef}
            initialViewState={{
              longitude: 120.8,
              latitude: 23.6,
              zoom: 6.5
            }}
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
        </Map>
      </div>

      {/* Right side - Stacked Waveform Chart */}
      <div className="w-1/2 h-full bg-gray-50 dark:bg-gray-900 relative">
        {/* Channel Labels Overlay */}
        <div className="absolute left-2 top-0 bottom-0 z-10 pointer-events-none">
          {CHANNEL_CONFIGS.map((config) => {
            // Label position: baseline + 30 (upward from center line)
            const labelYPosition = config.baseline + LABEL_OFFSET_FROM_BASELINE;

            // Convert to percentage from top (inverted Y axis: high Y = top of screen)
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

        {/* Chart - Full Space */}
        <div className="w-full h-full">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
