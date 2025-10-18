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

const generateColorFromId = (id: number): string => {
  let hash = 0;
  const str = id.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  hash = Math.abs(hash);

  const hue = hash % 360;
  const saturation = 85 + (hash % 15); // 提高飽和度：85-100%
  const lightness = 50 + (hash % 10); // 降低亮度：50-60%

  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 1/6) {
    r = c; g = x; b = 0;
  } else if (h < 2/6) {
    r = x; g = c; b = 0;
  } else if (h < 3/6) {
    r = 0; g = c; b = x;
  } else if (h < 4/6) {
    r = 0; g = x; b = c;
  } else if (h < 5/6) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `rgb(${r}, ${g}, ${b})`;
};

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
  { baseline: TOTAL_HEIGHT - TOP_GAP, color: generateColorFromId(STATION_IDS[0]) },
  { baseline: TOTAL_HEIGHT - TOP_GAP - MIDDLE_GAP, color: generateColorFromId(STATION_IDS[1]) },
  { baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 2), color: generateColorFromId(STATION_IDS[2]) },
  { baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 3), color: generateColorFromId(STATION_IDS[3]) },
  { baseline: TOTAL_HEIGHT - TOP_GAP - (MIDDLE_GAP * 4), color: generateColorFromId(STATION_IDS[4]) },
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
    STATION_IDS.forEach((id) => {
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
    // 先準備所有 channel 的資料
    const channelDataArrays: Array<{index: number, data: (number | null)[]}> = [];

    CHANNEL_CONFIGS.forEach((config, index) => {
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

      channelDataArrays.push({ index, data });
    });

    // 計算每個 channel 在圖表上的最大偏離值（絕對值）
    const channelMaxValues: { index: number; maxAbsDeviation: number }[] = [];

    channelDataArrays.forEach(({index, data}) => {
      const config = CHANNEL_CONFIGS[index];
      let maxAbsDeviation = 0;

      data.forEach(value => {
        if (value !== null) {
          // 計算偏離 baseline 的絕對值
          const deviation = Math.abs(value - config.baseline);
          maxAbsDeviation = Math.max(maxAbsDeviation, deviation);
        }
      });

      channelMaxValues.push({ index, maxAbsDeviation });
    });

    // 按最大偏離值排序，值越小的 z-index 越高（order 越小）
    channelMaxValues.sort((a, b) => a.maxAbsDeviation - b.maxAbsDeviation);

    // 建立 index -> order 的映射
    const indexToOrder: Record<number, number> = {};
    channelMaxValues.forEach((item, order) => {
      indexToOrder[item.index] = order;
    });

    console.log('Channel z-index 順序:', channelMaxValues.map(c => `Ch${c.index}: ${c.maxAbsDeviation.toFixed(2)}`));

    const datasets: any[] = [];

    // 使用已經計算好的資料
    channelDataArrays.forEach(({index, data}) => {
      const config = CHANNEL_CONFIGS[index];

      // 根據 order 設定 z-index
      // Chart.js 的 order 值越小越在上層，所以振幅小的 order 要小
      const orderRank = indexToOrder[index] || 0; // 0 = 振幅最小，4 = 振幅最大
      const baseOrder = orderRank * 2; // 振幅小的 order 小，會在上層

      datasets.push({
        label: `Station ${STATION_IDS[index] || index} (White)`,
        data: data,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        backgroundColor: 'transparent',
        borderWidth: 0.8,
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: false,
        order: baseOrder, // 白線
      });

      datasets.push({
        label: `Station ${STATION_IDS[index] || index}`,
        data: data,
        borderColor: config.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: false,
        order: baseOrder, // 彩色線與白線同層（彩色線會因為後加入而在上面）
      });
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
          const stationConfig = stationConfigs[stationId || 0];
          const isSENet = stationConfig?.scale === 20;

          return (
            <div key={index} className="absolute -translate-y-1/2" style={{ top: `${topPercentage}%` }}>
              <div
                className="text-xs font-semibold px-2 py-1 rounded"
                style={{
                  color: '#ffffff',
                  backgroundColor: '#000000',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <div>{stationId || 'N/A'}</div>
                {stationConfig && (
                  <div
                    className="text-[10px] font-medium"
                    style={{
                      color: isSENet ? '#3b82f6' : '#eab308',
                    }}
                  >
                    {isSENet ? 'SE-Net' : 'MS-Net'}
                  </div>
                )}
              </div>
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