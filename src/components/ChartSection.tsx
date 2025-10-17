'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
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
import { WaveformWebSocket, type WaveformData } from '@/lib/websocket';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const DISPLAY_DURATION = 60;
const STATION_IDS = [4812424, 6126556, 11336952, 11334880, 1480496];
const CHART_LENGTH = 50 * DISPLAY_DURATION;

const generateTimeLabels = (length: number, sampleRate: number) => {
  return Array.from({ length }, (_, i) => {
    const position = length - i;
    const timeInSeconds = position / sampleRate;
    const interval = sampleRate * 10;
    const offset = sampleRate * 5;

    if (position % interval === offset && timeInSeconds > 0 && timeInSeconds <= 60) {
      return timeInSeconds.toString();
    }
    return '';
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
  { baseline: TOTAL_HEIGHT - TOP_GAP, color: 'rgb(255, 255, 255)' },
  { baseline: TOTAL_HEIGHT - TOP_GAP - MIDDLE_GAP, color: 'rgb(255, 255, 255)' },
  { baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 2), color: 'rgb(255, 255, 255)' },
  { baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 3), color: 'rgb(255, 255, 255)' },
  { baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 4), color: 'rgb(255, 255, 255)' },
];

const ChartSection = React.memo(() => {
  const { theme } = useTheme();
  const [waveformData, setWaveformData] = useState<Record<number, (number | null)[]>>({});
  const [stationConfigs, setStationConfigs] = useState<Record<number, { sampleRate: number; dataLength: number; scale: number }>>({});
  const wsRef = useRef<WaveformWebSocket | null>(null);
  const waveformBuffersRef = useRef<Record<number, number[]>>({});
  const stationConfigsRef = useRef<Record<number, { sampleRate: number; dataLength: number; scale: number }>>({});
  const chartRef = useRef<any>(null);

  useEffect(() => {
    STATION_IDS.forEach(id => {
      waveformBuffersRef.current[id] = [];
    });

    const ws = new WaveformWebSocket({
      wsUrl: 'ws://lb.exptech.dev/ws',
      token: '48f185d188288f5e613e5878e0c25e462543dbec8c1993b0b16a4d758e6ffd68',
      topics: ['websocket.trem.rtw.v1'],
      stationIds: STATION_IDS
    });

    ws.onWaveform((data: WaveformData) => {
      if (!stationConfigsRef.current[data.id]) {
        const config = {
          sampleRate: data.sampleRate,
          dataLength: data.sampleRate * DISPLAY_DURATION,
          scale: data.precision === 2 ? 20 : 15000,
        };
        stationConfigsRef.current[data.id] = config;
        setStationConfigs(prev => ({ ...prev, [data.id]: config }));
      }

      if (!waveformBuffersRef.current[data.id]) {
        waveformBuffersRef.current[data.id] = [];
      }
      waveformBuffersRef.current[data.id].push(...data.X);
    });

    ws.connect().catch(() => {});
    wsRef.current = ws;

    const updateInterval = setInterval(() => {
      let hasAnyUpdate = false;

      STATION_IDS.forEach((stationId: number) => {
        const buffer = waveformBuffersRef.current[stationId] || [];
        if (buffer.length > 0) {
          hasAnyUpdate = true;
        }
      });

      if (hasAnyUpdate) {
        setWaveformData(prev => {
          const newData: Record<number, (number | null)[]> = {};

          STATION_IDS.forEach((stationId: number) => {
            const config = stationConfigsRef.current[stationId];
            if (!config) {
              newData[stationId] = prev[stationId] || [];
              return;
            }

            const maxLength = config.dataLength;
            const currentData = prev[stationId] || Array(maxLength).fill(null);
            const buffer = waveformBuffersRef.current[stationId] || [];

            if (buffer.length > 0) {
              const bufferData = buffer.splice(0);
              const newStationData = [...currentData, ...bufferData];

              while (newStationData.length > maxLength) {
                newStationData.shift();
              }

              newData[stationId] = newStationData;
            } else {
              newData[stationId] = currentData;
            }
          });

          return newData;
        });
      }
    }, 1000);

    return () => {
      ws.disconnect();
      clearInterval(updateInterval);
    };
  }, []);

  const timeLabels = useMemo(() => generateTimeLabels(CHART_LENGTH, 50), []);

  const chartData = useMemo(() => {
    const datasets = CHANNEL_CONFIGS.map((config, index) => {
      let data: (number | null)[];

      if (index < STATION_IDS.length) {
        const stationId = STATION_IDS[index];
        const stationConfig = stationConfigs[stationId];

        if (!stationConfig) {
          data = Array(CHART_LENGTH).fill(null);
        } else {
          const stationWaveform = waveformData[stationId] || Array(stationConfig.dataLength).fill(null);

          if (stationConfig.sampleRate === 20) {
            data = [];
            for (let i = 0; i < stationWaveform.length; i++) {
              const value = stationWaveform[i];
              if (value !== null) {
                const scaledValue = (value * stationConfig.scale) + config.baseline;
                data.push(scaledValue);
                data.push(scaledValue);
                if (i % 2 === 0) data.push(scaledValue);
              } else {
                data.push(null);
                data.push(null);
                if (i % 2 === 0) data.push(null);
              }
            }
          } else {
            data = stationWaveform.map(value =>
              value !== null ? (value * stationConfig.scale) + config.baseline : null
            );
          }

          while (data.length < CHART_LENGTH) {
            data.unshift(null);
          }
          while (data.length > CHART_LENGTH) {
            data.shift();
          }
        }
      } else {
        data = Array(CHART_LENGTH).fill(null);
      }

      return {
        label: `Station ${STATION_IDS[index] || index}`,
        data: data,
        borderColor: config.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: false,
      };
    });

    return {
      labels: timeLabels,
      datasets: datasets,
    };
  }, [timeLabels, waveformData, stationConfigs]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0,
    },
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
        enabled: false,
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
          autoSkip: false,
          maxRotation: 0,
          minRotation: 0,
          font: {
            size: 10,
          },
        },
        grid: {
          color: (context: any) => {
            const index = context.index;
            const position = CHART_LENGTH - index;
            const interval = 50 * 10;
            const offset = 50 * 5;
            if (position % interval === offset && position > 0 && position <= CHART_LENGTH) {
              return theme === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.4)';
            }
            return 'transparent';
          },
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

  return (
    <div className="w-1/2 h-full bg-gray-50 dark:bg-gray-900 relative">
      <div className="absolute left-2 top-0 bottom-0 z-10 pointer-events-none">
        {CHANNEL_CONFIGS.map((config, index) => {
          const labelYPosition = config.baseline + CHANNEL_LABEL_OFFSETS[index];
          const topPercentage = ((TOTAL_HEIGHT - labelYPosition) / TOTAL_HEIGHT) * 100;
          const stationId = index < STATION_IDS.length ? STATION_IDS[index] : null;

          return (
            <div
              key={index}
              className="text-xs font-semibold px-2 py-1 rounded absolute -translate-y-1/2"
              style={{
                color: config.color,
                backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
                top: `${topPercentage}%`,
              }}
            >
              {stationId || 'N/A'}
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0">
        <Line ref={chartRef} data={chartData} options={chartOptions} />
      </div>
    </div>
  );
});

ChartSection.displayName = 'ChartSection';

export default ChartSection;