'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
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
import { fetchAndProcessStationData, type StationGeoJSON, type ProcessedStationData } from '@/lib/rts';
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

const DISPLAY_DURATION = 60; // 60 seconds
const STATION_IDS = [15138748, 6732340, 1480496, 1936924, 2012144];
const CHART_LENGTH = 50 * DISPLAY_DURATION; // 3000 points for 50Hz (最高採樣率)

const generateTimeLabels = (length: number, sampleRate: number) => {
  return Array.from({ length }, (_, i) => {
    // 只在特定位置顯示標籤
    const position = length - i; // 從右到左的位置
    const timeInSeconds = position / sampleRate;

    // 每 10 秒顯示一個標籤（5, 15, 25, 35, 45, 55）
    const interval = sampleRate * 10; // 10 秒的樣本數
    const offset = sampleRate * 5; // 5 秒的樣本數

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

// 地圖組件 - 完全獨立管理自己的狀態
const MapSection = React.memo(() => {
  const mapRef = useRef<MapRef>(null);
  const [stationData, setStationData] = useState<StationGeoJSON | null>(null);
  const [dataTime, setDataTime] = useState<number>(0);
  const [maxIntensity, setMaxIntensity] = useState<number>(-3);

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

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  // 地圖自己的數據獲取邏輯
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchAndProcessStationData();
        setStationData(data.geojson);
        setDataTime(data.time);

        let max = -3;
        data.geojson.features.forEach(feature => {
          if (feature.properties.intensity > max) {
            max = feature.properties.intensity;
          }
        });
        setMaxIntensity(max);
      } catch (error) {
        console.error('Failed to fetch station data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-1/2 h-full relative">
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
                'circle-radius': 4,
                'circle-color': ['get', 'color'],
                'circle-opacity': 1,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff',
              }}
            />
          </Source>
        )}
      </Map>
      {dataTime > 0 && (
        <div className="absolute bottom-3 right-3 z-50 flex flex-col gap-2 items-end">
          <div className="backdrop-blur-sm rounded-md p-2">
            <div className="flex items-start gap-1.5">
              <div className="flex flex-col text-[9px] text-white/90 font-medium text-right" style={{ height: '180px', justifyContent: 'space-between' }}>
                <span style={{ lineHeight: '9px' }}>7</span>
                <span style={{ lineHeight: '9px' }}>6</span>
                <span style={{ lineHeight: '9px' }}>5</span>
                <span style={{ lineHeight: '9px' }}>4</span>
                <span style={{ lineHeight: '9px' }}>3</span>
                <span style={{ lineHeight: '9px' }}>2</span>
                <span style={{ lineHeight: '9px' }}>1</span>
                <span style={{ lineHeight: '9px' }}>0</span>
                <span style={{ lineHeight: '9px' }}>-1</span>
                <span style={{ lineHeight: '9px' }}>-2</span>
                <span style={{ lineHeight: '9px' }}>-3</span>
              </div>
              <div className="relative" style={{ height: '180px' }}>
                <div
                  className="w-1.5 h-full rounded-full"
                  style={{
                    background: `linear-gradient(180deg,
                      #b720e9 0%,
                      #fc5235 10%,
                      #ff9300 20%,
                      #fff000 30%,
                      #beff0c 40%,
                      #44fa34 50%,
                      #49E9AD 60%,
                      #79E5FD 70%,
                      #009EF8 80%,
                      #004bf8 90%,
                      #0005d0 100%)`,
                    boxShadow: '0 0 4px rgba(0,0,0,0.3)'
                  }}
                />
                <div
                  className="absolute -right-3 text-white text-[10px] transition-all duration-300"
                  style={{
                    top: `${((7 - maxIntensity) / 10) * 100}%`,
                    transform: 'translateY(-50%)',
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                  }}
                >
                  ◀
                </div>
              </div>
            </div>
          </div>
          <div className="bg-background/90 backdrop-blur-sm border border-border/50 rounded-md px-3 py-2 shadow-md">
            <p className="text-xs text-white font-bold">
              {formatTime(dataTime)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

// 圖表組件 - 使用 React.memo 避免不必要的重新渲染
const ChartSection = React.memo(({ 
  chartRef, 
  chartData, 
  chartOptions, 
  theme 
}: {
  chartRef: React.RefObject<any>;
  chartData: any;
  chartOptions: any;
  theme: string | undefined;
}) => {
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

export default function Home() {
  const { theme } = useTheme();
  const [hasAlert, setHasAlert] = useState<boolean>(false);
  const [waveformData, setWaveformData] = useState<Record<number, (number | null)[]>>({});
  const [stationConfigs, setStationConfigs] = useState<Record<number, { sampleRate: number; dataLength: number; scale: number }>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WaveformWebSocket | null>(null);
  const waveformBuffersRef = useRef<Record<number, number[]>>({});
  const stationConfigsRef = useRef<Record<number, { sampleRate: number; dataLength: number; scale: number }>>({});
  const chartRef = useRef<any>(null);

  useEffect(() => {
    audioRef.current = new Audio('/audios/alarm.wav');

    const enableAutostart = async () => {
      try {
        const { enable } = await import('@tauri-apps/plugin-autostart');
        await enable();
        console.log('Autostart enabled');
      } catch (error) {
        console.error('Failed to enable autostart:', error);
      }
    };

    enableAutostart();

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
      console.log(`🔊 Received waveform data for station ${data.id}:`, {
        sampleRate: data.sampleRate,
        precision: data.precision,
        dataLength: data.X.length,
        time: new Date(data.time).toISOString()
      });
      
      // 動態設定測站配置
      if (!stationConfigsRef.current[data.id]) {
        const config = {
          sampleRate: data.sampleRate,
          dataLength: data.sampleRate * DISPLAY_DURATION,
          scale: data.precision === 2 ? 20 : 20000, // 20Hz 和 50Hz 的縮放倍率
        };
        stationConfigsRef.current[data.id] = config;
        setStationConfigs(prev => ({ ...prev, [data.id]: config }));
        console.log(`⚙️ Station ${data.id} config initialized:`, config);
      }

      if (!waveformBuffersRef.current[data.id]) {
        waveformBuffersRef.current[data.id] = [];
      }
      waveformBuffersRef.current[data.id].push(...data.X);
      console.log(`📊 Station ${data.id} buffer now has ${waveformBuffersRef.current[data.id].length} points`);
    });

    ws.connect().catch(console.log);
    wsRef.current = ws;

    const updateInterval = setInterval(() => {
      const startTime = performance.now();
      let hasAnyUpdate = false;
      let totalBufferPoints = 0;

      // 先檢查是否有任何緩衝區有數據
      STATION_IDS.forEach((stationId: number) => {
        const buffer = waveformBuffersRef.current[stationId] || [];
        if (buffer.length > 0) {
          hasAnyUpdate = true;
          totalBufferPoints += buffer.length;
        }
      });

      const endTime = performance.now();
      console.log(`⏱️ Update interval: ${Math.round(endTime - startTime)}ms, Buffer points: ${totalBufferPoints}, Has update: ${hasAnyUpdate}`);

      // 只有在有實際數據更新時才觸發狀態更新
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
              console.log(`📈 Station ${stationId}: +${bufferData.length} points, total: ${newStationData.filter(v => v !== null).length}`);
            } else {
              newData[stationId] = currentData;
            }
          });

          return newData;
        });
      }
    }, 500);

    return () => {
      ws.disconnect();
      clearInterval(updateInterval);
    };
  }, []);

  // 警報狀態檢查 - 獨立於地圖數據
  useEffect(() => {
    const checkAlert = async () => {
      try {
        const data = await fetchAndProcessStationData();
        const shouldAlert = data.box && Object.keys(data.box).length > 0;
        setHasAlert(shouldAlert);
      } catch (error) {
        console.error('Failed to check alert status:', error);
        setHasAlert(false);
      }
    };

    checkAlert();
    const interval = setInterval(checkAlert, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hasAlert) {
      audioRef.current?.pause();
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      return;
    }

    const playAlarm = () => {
      audioRef.current?.play().catch(err => console.error('Failed to play alarm:', err));
    };

    playAlarm();
    const interval = setInterval(playAlarm, 3000);

    return () => {
      clearInterval(interval);
      audioRef.current?.pause();
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    };
  }, [hasAlert]);

  const timeLabels = useMemo(() => generateTimeLabels(CHART_LENGTH, 50), []);

  const chartData = useMemo(() => {
    console.log('📊 chartData recalculating, waveformData keys:', Object.keys(waveformData), 'stationConfigs keys:', Object.keys(stationConfigs));
    const datasets = CHANNEL_CONFIGS.map((config, index) => {
      let data: (number | null)[];

      if (index < STATION_IDS.length) {
        const stationId = STATION_IDS[index];
        const stationConfig = stationConfigs[stationId];

        if (!stationConfig) {
          data = Array(CHART_LENGTH).fill(null);
        } else {
          const stationWaveform = waveformData[stationId] || Array(stationConfig.dataLength).fill(null);

          // 如果是 20Hz 測站，需要上採樣到 50Hz 以匹配圖表長度
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
            // 50Hz 測站直接使用
            data = stationWaveform.map(value =>
              value !== null ? (value * stationConfig.scale) + config.baseline : null
            );
          }

          // 確保數據長度為 CHART_LENGTH
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
            // 只在有標籤的位置顯示網格線（50Hz，每 10 秒 = 500 個點）
            const index = context.index;
            const position = CHART_LENGTH - index;
            const interval = 50 * 10; // 10 秒的樣本數（50Hz）
            const offset = 50 * 5; // 5 秒的樣本數（50Hz）
            // 顯示在 5, 15, 25, 35, 45, 55 秒的位置
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

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="flex h-screen w-full">
      <MapSection />
      <ChartSection 
        chartRef={chartRef}
        chartData={chartData}
        chartOptions={chartOptions}
        theme={theme}
      />
    </div>
  );
}
