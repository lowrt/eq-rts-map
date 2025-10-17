'use client';

import React, { useState, useMemo, useRef } from 'react';
import Map, { useControl, type MapRef } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, LineLayer, IconLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import type { Layer } from '@deck.gl/core';
import type { Earthquake } from '@/types/earthquake';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Activity, Layers } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface DeckGLOverlayProps {
  layers: (Layer | null)[];
}

function DeckGLOverlay(props: DeckGLOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({
    ...props,
    interleaved: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(({ views: [new MapView({ farZMultiplier: 100 })] } as any)),
  }));
  overlay.setProps(props);
  return null;
}

/**
 * 根據深度計算顏色
 * 0~30 km 極淺層地震 - 紅色
 * 30~70 km 淺層地震 - 黃色
 * 70~300 km 中層地震 - 綠色
 * 300km+ 深層地震 - 藍色
 */
function getDepthColor(depth: number): [number, number, number] {
  if (depth < 30) return [239, 68, 68]; // red-500
  if (depth < 70) return [234, 179, 8]; // yellow-500
  if (depth < 300) return [34, 197, 94]; // green-500
  return [59, 130, 246]; // blue-500
}

/**
 * 創建星星 SVG 圖標的 data URL
 */
function createStarIcon(color: [number, number, number]): string {
  const svg = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 2 L20 12 L30 12 L22 18 L26 28 L16 22 L6 28 L10 18 L2 12 L12 12 Z"
            fill="rgb(${color[0]}, ${color[1]}, ${color[2]})"
            stroke="rgb(${Math.max(0, color[0] - 40)}, ${Math.max(0, color[1] - 40)}, ${Math.max(0, color[2] - 40)})"
            stroke-width="1.5"/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

interface EarthquakeMapProps {
  earthquakes: Earthquake[];
  selectedEarthquake?: Earthquake | null;
  onEarthquakeClick?: (earthquake: Earthquake | null) => void;
  isPlaybackMode?: boolean;
  playbackRippleEarthquakes?: Earthquake[];
  nextPlaybackEarthquake?: Earthquake | null;
  isPlaying?: boolean;
  rippleEnabled?: boolean;
  latitudeRange?: [number, number];
  longitudeRange?: [number, number];
  showBoundingBox?: boolean;
  shouldTriggerAnimation?: boolean;
  onAnimationComplete?: () => void;
  isLatestMode?: boolean;
}

const EarthquakeMap: React.FC<EarthquakeMapProps> = ({
  earthquakes,
  selectedEarthquake = null,
  onEarthquakeClick,
  isPlaybackMode = false,
  playbackRippleEarthquakes = [],
  nextPlaybackEarthquake = null,
  isPlaying = false,
  rippleEnabled = true,
  latitudeRange = [-90, 90],
  longitudeRange = [-180, 180],
  showBoundingBox = false,
  shouldTriggerAnimation = false,
  onAnimationComplete,
  isLatestMode = false
}) => {
  const [viewState, setViewState] = useState({
    longitude: 120.9605,
    latitude: 23.6978, // 台灣中心
    zoom: typeof window !== 'undefined' && window.innerWidth < 768 ? 6.5 : 7, // iPhone 較小螢幕縮小初始縮放
    pitch: 60, // 3D 視角傾斜角度
    bearing: 0,
  });

  const [isMapLoaded, setIsMapLoaded] = React.useState(false);
  const [isMapFullyReady, setIsMapFullyReady] = React.useState(false);
  const [hoveredObject, setHoveredObject] = useState<Earthquake | null>(null);
  const [rippleTime, setRippleTime] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [earthquakeElapsedTimes, setEarthquakeElapsedTimes] = useState<Record<string, number>>({});
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const mapRef = useRef<MapRef>(null);
  const lastPlaybackEarthquakeRef = useRef<Earthquake | null>(null);
  const lastCameraMoveTimeRef = useRef<number>(0);

  // 檢測是否為手機模式
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // 768px 是 md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 顯示選中的地震或懸停的地震
  const displayedEarthquake = selectedEarthquake || hoveredObject;

  // 調試：顯示當前選中和顯示的地震
  React.useEffect(() => {
    if (selectedEarthquake) {
      console.log('地圖 selectedEarthquake:', selectedEarthquake.id, selectedEarthquake);
    }
    if (displayedEarthquake) {
      console.log('地圖 displayedEarthquake:', displayedEarthquake.id, displayedEarthquake);
    }
  }, [selectedEarthquake, displayedEarthquake]);

  // 在組件掛載後強制觸發一次微小的視角更新，確保圖層正確渲染
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setViewState(prev => ({
        ...prev,
        zoom: prev.zoom + 0.0001 // 極小的變化
      }));
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // 當選中地震時，移動相機視角（兩階段動畫）
  React.useEffect(() => {
    // 只有在 shouldTriggerAnimation 為 true 且地圖完全準備好時才執行動畫
    if (!selectedEarthquake || !mapRef.current || !isMapFullyReady || !shouldTriggerAnimation) {
      // 如果地圖還沒完全準備好，記錄一下，等地圖準備好後會重新觸發
      if (!isMapFullyReady && selectedEarthquake && shouldTriggerAnimation) {
        console.log('地圖尚未完全準備好，等待後執行動畫', {
          selectedEarthquake: selectedEarthquake?.id,
          isMapLoaded,
          isMapFullyReady,
          shouldTriggerAnimation
        });
      }
      return;
    }

    const map = mapRef.current.getMap();
    if (!map) {
      console.log('地圖尚未載入，無法執行動畫');
      return;
    }

    console.log('執行相機動畫，選中地震:', selectedEarthquake.id, {
      isMapLoaded,
      isMapFullyReady,
      shouldTriggerAnimation,
      mapLoaded: map.loaded()
    });

    // 台灣中心點
    const taiwanCenter = { longitude: 120.9605, latitude: 23.6978 };

    // 第一階段：縮小到整個台灣
    map.flyTo({
      center: [taiwanCenter.longitude, taiwanCenter.latitude],
      zoom: 6.5,
      pitch: 0,
      bearing: 0,
      duration: 1000,
      essential: true
    });

    // 第二階段：移動到地震後方，往台灣中心看
    const timeout = setTimeout(() => {
      // 計算從地震位置到台灣中心的方向向量
      const dx = taiwanCenter.longitude - selectedEarthquake.longitude;
      const dy = taiwanCenter.latitude - selectedEarthquake.latitude;
      const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

      // 計算距離（用於確定後退距離）
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 相機後退距離係數（根據地震到中心的距離調整）
      const offsetDistance = Math.max(0.3, distance * 0.4);

      // 計算相機位置（在地震點後方）
      const cameraLongitude = selectedEarthquake.longitude - (dx / distance) * offsetDistance;
      const cameraLatitude = selectedEarthquake.latitude - (dy / distance) * offsetDistance;

      map.flyTo({
        center: [cameraLongitude, cameraLatitude],
        zoom: 8.5,
        pitch: 70, // 俯仰 70 度
        bearing: bearing, // 面向台灣中心
        duration: 2000,
        essential: true
      });

      // 動畫完成後通知父組件
      if (onAnimationComplete) {
        setTimeout(() => {
          onAnimationComplete();
        }, 2000);
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [selectedEarthquake, isMapLoaded, isMapFullyReady, shouldTriggerAnimation, onAnimationComplete]);

  // 播放模式下的相機移動（移動到加權中心點）
  React.useEffect(() => {
    if (!nextPlaybackEarthquake || !mapRef.current || !isMapFullyReady || !isPlaying) {
      // 停止播放時清除記錄
      if (!isPlaying) {
        lastPlaybackEarthquakeRef.current = null;
        lastCameraMoveTimeRef.current = 0;
      }
      return;
    }

    const map = mapRef.current.getMap();
    if (!map) {
      return;
    }

    const now = Date.now();

    // 降低相機移動頻率：至少間隔 3 秒才能移動
    const MIN_MOVE_INTERVAL = 3000; // 3秒
    if (lastCameraMoveTimeRef.current && now - lastCameraMoveTimeRef.current < MIN_MOVE_INTERVAL) {
      console.log('播放模式：相機移動太頻繁，跳過');
      return;
    }

    // 檢查是否需要移動相機（避免短距離頻繁移動）
    const lastEarthquake = lastPlaybackEarthquakeRef.current;
    if (lastEarthquake) {
      // 計算與上次位置的距離
      const distanceFromLast = Math.sqrt(
        Math.pow(nextPlaybackEarthquake.longitude - lastEarthquake.longitude, 2) +
        Math.pow(nextPlaybackEarthquake.latitude - lastEarthquake.latitude, 2)
      );

      // 如果距離太近（小於 1.0 度，約 110 公里），不移動相機
      const MIN_DISTANCE_THRESHOLD = 1.0;
      if (distanceFromLast < MIN_DISTANCE_THRESHOLD) {
        console.log('播放模式：加權中心距離太近，跳過相機移動:', {
          distance: distanceFromLast.toFixed(3)
        });
        return;
      }
    }

    console.log('播放模式：移動相機到加權中心:', {
      lat: nextPlaybackEarthquake.latitude.toFixed(3),
      lon: nextPlaybackEarthquake.longitude.toFixed(3)
    });

    // 記錄當前位置和移動時間
    lastPlaybackEarthquakeRef.current = nextPlaybackEarthquake;
    lastCameraMoveTimeRef.current = now;

    // 台灣中心點
    const taiwanCenter = { longitude: 120.9605, latitude: 23.6978 };

    // 計算從加權中心到台灣中心的方向向量
    const dx = taiwanCenter.longitude - nextPlaybackEarthquake.longitude;
    const dy = taiwanCenter.latitude - nextPlaybackEarthquake.latitude;
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

    // 計算距離（用於確定後退距離）
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 相機後退距離係數（根據加權中心到台灣中心的距離調整）
    const offsetDistance = Math.max(0.3, distance * 0.4);

    // 計算相機位置（在加權中心後方）
    const cameraLongitude = nextPlaybackEarthquake.longitude - (dx / distance) * offsetDistance;
    const cameraLatitude = nextPlaybackEarthquake.latitude - (dy / distance) * offsetDistance;

    // 平滑移動到加權中心（增加過渡時間使移動更平滑）
    map.flyTo({
      center: [cameraLongitude, cameraLatitude],
      zoom: 8.5,
      pitch: 70,
      bearing: bearing,
      duration: 4000, // 4秒過渡時間（更平滑）
      essential: true
    });
  }, [nextPlaybackEarthquake, isMapFullyReady, isPlaying]);

  // 當選中地震或 hover 時，啟動漣漪動畫
  React.useEffect(() => {
    if (!displayedEarthquake) {
      setRippleTime(0);
      return;
    }

    let animationFrame: number;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      setRippleTime(elapsed / 1000); // 轉換為秒
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [displayedEarthquake]);

  // 當有新地震時，初始化它們的經過時間為 0
  React.useEffect(() => {
    if (playbackRippleEarthquakes.length === 0) {
      return;
    }

    setEarthquakeElapsedTimes(prev => {
      const newElapsed = { ...prev };
      playbackRippleEarthquakes.forEach(eq => {
        if (newElapsed[eq.id] === undefined) {
          newElapsed[eq.id] = 0;
        }
      });
      return newElapsed;
    });
  }, [playbackRippleEarthquakes]);

  // 當播放模式關閉時，清空所有漣漪時間
  React.useEffect(() => {
    if (!isPlaybackMode) {
      setEarthquakeElapsedTimes({});
    }
  }, [isPlaybackMode]);

  // 只在播放時更新經過的時間
  React.useEffect(() => {
    if (!isPlaying || playbackRippleEarthquakes.length === 0) {
      lastUpdateTimeRef.current = Date.now();
      return;
    }

    let animationFrame: number;

    const animate = () => {
      const now = Date.now();
      const delta = (now - lastUpdateTimeRef.current) / 1000; // 轉換為秒

      setEarthquakeElapsedTimes(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(id => {
          updated[id] = (updated[id] || 0) + delta;
        });
        return updated;
      });

      lastUpdateTimeRef.current = now;
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [isPlaying, playbackRippleEarthquakes.length]);

  // 創建從震源到地面的連接線（hover 或選中時顯示）
  const lineLayer = useMemo(() => {
    if (!displayedEarthquake) return null;

    return new LineLayer({
      id: 'earthquake-leader-line',
      data: [displayedEarthquake],
      pickable: false,
      modelMatrix: null,
      extensions: [],
      getSourcePosition: (d: Earthquake) => [d.longitude, d.latitude, -(d.depth * 1000)], // 震源位置（地下）
      getTargetPosition: (d: Earthquake) => [d.longitude, d.latitude, 0], // 地面位置
      getColor: (d: Earthquake) => {
        const color = getDepthColor(d.depth);
        return [color[0], color[1], color[2], 150];
      },
      getWidth: 2,
    });
  }, [displayedEarthquake]);

  // 在地表顯示星星符號（使用 IconLayer）- 縮小尺寸
  const surfaceStarLayer = useMemo(() => {
    if (!displayedEarthquake) return null;

    const color = getDepthColor(displayedEarthquake.depth);
    const iconUrl = createStarIcon(color);

    return new IconLayer<Earthquake>({
      id: 'surface-star-marker',
      data: [displayedEarthquake],
      pickable: false,
      modelMatrix: null,
      extensions: [],
      iconAtlas: iconUrl,
      iconMapping: {
        marker: { x: 0, y: 0, width: 32, height: 32, mask: false }
      },
      getIcon: () => 'marker',
      getPosition: (d: Earthquake) => [d.longitude, d.latitude, 10], // 地表位置，稍微抬高避免遮擋
      getSize: 20, // 從 32 縮小到 20
      sizeScale: 1,
      billboard: true,
    });
  }, [displayedEarthquake]);

  // 漣漪動畫圖層（hover 或選中時顯示）- 在震源位置顯示白色漣漪
  const rippleLayers = useMemo(() => {
    if (!displayedEarthquake) return [];

    const rippleCount = 5; // 3 個漣漪
    const rippleDuration = 10; // 每個漣漪持續 4 秒，更慢的擴散
    const layers = [];

    for (let i = 0; i < rippleCount; i++) {
      const offset = (i / rippleCount) * rippleDuration; // 錯開時間
      const time = (rippleTime + offset) % rippleDuration; // 循環動畫
      const progress = time / rippleDuration; // 0 到 1

      // 半徑從小到大，範圍更大
      const radius = 200 + progress * 75000; // 從 200m 擴散到 15200m
      // 透明度從高到低，使用平滑的淡出曲線
      const opacity = Math.max(0, Math.pow(1 - progress, 2) * 0.8);

      layers.push(
        new ScatterplotLayer<Earthquake>({
          id: `ripple-layer-${i}`,
          data: [displayedEarthquake],
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 3,
          getPosition: (d: Earthquake) => [d.longitude, d.latitude, -(d.depth * 1000)], // 震源位置（地下）
          getRadius: radius,
          getLineColor: [255, 255, 255, Math.floor(opacity * 255)], // 白色漣漪
          radiusScale: 1,
          billboard: true, // 始終面向相機，形成正圓
        })
      );
    }

    return layers;
  }, [displayedEarthquake, rippleTime]);

  // 播放模式漣漪圖層（根據地震規模調整範圍，4秒後消失）
  const playbackRippleLayers = useMemo(() => {
    if (!rippleEnabled || playbackRippleEarthquakes.length === 0) return [];

    const rippleDuration = 4; // 總持續時間 4 秒
    const layers: Layer[] = [];

    playbackRippleEarthquakes.forEach((eq, eqIndex) => {
      // 根據規模計算漣漪範圍 M1.0: 5km, M7.0: 150km
      const minRadius = 5000; // 5km
      const maxRadius = 50000; // 150km
      const magnitude = Math.max(1, Math.min(7, eq.magnitude)); // 限制在 1-7 範圍
      const maxRippleRadius = minRadius + ((magnitude - 1) / 6) * (maxRadius - minRadius);

      // 獲取這個地震的經過時間
      const elapsedTime = earthquakeElapsedTimes[eq.id];
      if (elapsedTime === undefined) return;

      // 如果超過 4 秒，不顯示
      if (elapsedTime > rippleDuration) return;

      const progress = Math.min(1, elapsedTime / rippleDuration);
      const radius = 200 + progress * maxRippleRadius;
      const opacity = Math.max(0, Math.pow(1 - progress, 2) * 0.8);

      // 漣漪圓圈（只在啟用漣漪時顯示）
      layers.push(
        new ScatterplotLayer<Earthquake>({
          id: `playback-ripple-${eqIndex}`,
          data: [eq],
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 3,
          getPosition: (d: Earthquake) => [d.longitude, d.latitude, -(d.depth * 1000)],
          getRadius: radius,
          getLineColor: [255, 255, 255, Math.floor(opacity * 255)],
          radiusScale: 1,
          billboard: true,
        })
      );
    });

    return layers;
  }, [rippleEnabled, playbackRippleEarthquakes, earthquakeElapsedTimes]);

  // 播放模式的線和星星圖層（不受漣漪開關影響，只要在播放模式就顯示）
  const playbackMarkersLayers = useMemo(() => {
    if (!isPlaybackMode || playbackRippleEarthquakes.length === 0) return [];

    const rippleDuration = 4; // 總持續時間 4 秒
    const layers: Layer[] = [];

    playbackRippleEarthquakes.forEach((eq, eqIndex) => {
      // 獲取這個地震的經過時間
      const elapsedTime = earthquakeElapsedTimes[eq.id];
      if (elapsedTime === undefined) return;

      // 如果超過 4 秒，不顯示
      if (elapsedTime > rippleDuration) return;

      const progress = Math.min(1, elapsedTime / rippleDuration);
      const opacity = Math.max(0, Math.pow(1 - progress, 2) * 0.8);
      const color = getDepthColor(eq.depth);

      // 從震源到地面的連接線
      layers.push(
        new LineLayer({
          id: `playback-line-${eqIndex}`,
          data: [eq],
          pickable: false,
          modelMatrix: null,
          extensions: [],
          getSourcePosition: (d: Earthquake) => [d.longitude, d.latitude, -(d.depth * 1000)],
          getTargetPosition: (d: Earthquake) => [d.longitude, d.latitude, 0],
          getColor: [...color, Math.floor(opacity * 255)],
          getWidth: 2,
        })
      );

      // 地表星星標記
      const iconUrl = createStarIcon(color);
      layers.push(
        new IconLayer<Earthquake>({
          id: `playback-star-${eqIndex}`,
          data: [eq],
          pickable: false,
          modelMatrix: null,
          extensions: [],
          iconAtlas: iconUrl,
          iconMapping: {
            marker: { x: 0, y: 0, width: 32, height: 32, mask: false }
          },
          getIcon: () => 'marker',
          getPosition: (d: Earthquake) => [d.longitude, d.latitude, 10],
          getSize: 20,
          sizeScale: 1,
          billboard: true,
          opacity: opacity,
        })
      );
    });

    return layers;
  }, [isPlaybackMode, playbackRippleEarthquakes, earthquakeElapsedTimes]);

  // 創建 3D 散點圖層來顯示地震深度（向地下延伸）
  const scatterplotLayer = useMemo(() => {
    return new ScatterplotLayer<Earthquake>({
      id: 'earthquake-depth-layer',
      data: earthquakes,
      pickable: true,
      opacity: 0.2, // 參考原始代碼的低透明度
      stroked: false,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 1, // 參考原始代碼的最小尺寸
      radiusMaxPixels: 8,
      billboard: true, // 始終面向相機
      antialiasing: false, // 參考原始代碼
      // 完全禁用視錐體剔除 - 使用極大的半徑來確保所有點都被渲染
      modelMatrix: null,
      extensions: [],
      getPosition: (d: Earthquake) => [d.longitude, d.latitude, -(d.depth * 1000)], // 深度為負值（向地下）
      getRadius: 500, // 固定半徑 500 米，參考原始代碼
      getFillColor: (d: Earthquake) => {
        const color = getDepthColor(d.depth);
        return [color[0], color[1], color[2]];
      },
      onHover: (info) => {
        // 播放模式下禁用 hover，手機模式下也禁用，只在沒有選中地震且不是手機且不在播放模式時才更新 hover 狀態
        if (!selectedEarthquake && !isMobile && !isPlaybackMode) {
          setHoveredObject(info.object as Earthquake | null);
        }
      },
      onClick: (info) => {
        // 播放模式下禁用點擊
        if (onEarthquakeClick && !isPlaybackMode) {
          const clickedEq = info.object as Earthquake | null;
          // 清除 hover 狀態，避免重複顯示
          setHoveredObject(null);
          // 如果點擊的是已選中的地震，則取消選中
          if (selectedEarthquake && clickedEq && selectedEarthquake.id === clickedEq.id) {
            onEarthquakeClick(null);
          } else {
            onEarthquakeClick(clickedEq);
          }
        }
      },
    });
  }, [earthquakes, selectedEarthquake, onEarthquakeClick, isMobile, isPlaybackMode]);

  // 經緯度範圍邊界框（只在開關啟用時顯示）
  const boundingBoxLayer = useMemo(() => {
    // 如果開關未啟用，不顯示邊界框
    if (!showBoundingBox) return null;

    const isDefaultRange =
      latitudeRange[0] === 10 && latitudeRange[1] === 30 &&
      longitudeRange[0] === 115 && longitudeRange[1] === 130;

    // 如果是預設範圍，也不顯示邊界框
    if (isDefaultRange) return null;

    // 創建矩形的四個角和邊界線
    const [minLng, maxLng] = longitudeRange;
    const [minLat, maxLat] = latitudeRange;

    const rectangleData = [
      { from: [minLng, minLat, 0], to: [maxLng, minLat, 0] }, // 下邊
      { from: [maxLng, minLat, 0], to: [maxLng, maxLat, 0] }, // 右邊
      { from: [maxLng, maxLat, 0], to: [minLng, maxLat, 0] }, // 上邊
      { from: [minLng, maxLat, 0], to: [minLng, minLat, 0] }, // 左邊
    ];

    return new LineLayer({
      id: 'bounding-box',
      data: rectangleData,
      getSourcePosition: (d: { from: number[] }) => d.from as [number, number, number],
      getTargetPosition: (d: { to: number[] }) => d.to as [number, number, number],
      getColor: [168, 85, 247, 180], // 紫色 (purple-500) 半透明
      getWidth: 3,
      widthUnits: 'pixels',
      getDashArray: [10, 5], // 虛線效果
      dashJustified: true,
      extensions: [],
    });
  }, [latitudeRange, longitudeRange, showBoundingBox]);

  const layers = [
    boundingBoxLayer, // 邊界框在最底層
    scatterplotLayer,
    lineLayer,
    ...rippleLayers, // 漣漪動畫（hover/選中）
    ...playbackRippleLayers, // 播放模式漣漪動畫（受漣漪開關控制）
    ...playbackMarkersLayers, // 播放模式線和星星（不受漣漪開關影響）
    surfaceStarLayer
  ].filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapStyle: any = {
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
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <Map
        ref={mapRef}
        key="earthquake-map"
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle={mapStyle}
        attributionControl={false}
        maxZoom={12}
        minZoom={4}
        maxPitch={89}
        onLoad={() => {
          console.log('Map loaded');
          setIsMapLoaded(true);
          // 延遲 1 秒確保地圖完全準備好，避免動畫失敗
          setTimeout(() => {
            console.log('Map fully ready for animations');
            setIsMapFullyReady(true);
          }, 1000);
        }}
        onRender={(evt) => {
          if (!isMapLoaded && evt.target.loaded()) {
            console.log('Map rendered and loaded');
            setIsMapLoaded(true);
            // 延遲 1 秒確保地圖完全準備好
            setTimeout(() => {
              console.log('Map fully ready for animations');
              setIsMapFullyReady(true);
            }, 1000);
          }
        }}
        onError={(error) => {
          console.log('Map error:', error);
        }}
      >
        <DeckGLOverlay layers={layers} />
      </Map>

      {/* 地震資訊框（顯示選中或 hover 的地震） */}
      {displayedEarthquake && (
        <Card
          key={`earthquake-info-${displayedEarthquake.id}`}
          className="absolute bottom-2 left-2 md:bottom-4 md:left-4 z-20 w-[calc(100vw-16px)] sm:max-w-sm backdrop-blur-xl bg-card/90 border border-border/50 shadow-lg py-0 gap-0 !rounded-md"
        >
          <CardHeader className="p-3 md:p-6 pb-0 md:pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
                <Activity className="w-3.5 h-3.5 md:w-4 md:h-4 text-destructive flex-shrink-0" />
                地震資訊
              </CardTitle>
              {selectedEarthquake && !isLatestMode && (
                <button
                  onClick={() => onEarthquakeClick?.(null)}
                  className="text-muted-foreground hover:text-foreground text-[10px] md:text-xs flex-shrink-0"
                >
                  ✕ 關閉
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 md:space-y-2 text-xs md:text-sm p-3 md:p-6">
            <div className="flex items-start gap-1.5 md:gap-2">
              <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="break-words">{new Date(displayedEarthquake.time).toLocaleString('zh-TW')}</span>
            </div>
            <div className="flex items-start gap-1.5 md:gap-2">
              <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="break-words">{displayedEarthquake.location}</span>
            </div>
            <div className="flex gap-1.5 md:gap-2 pt-1.5 md:pt-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px] md:text-xs">
                規模 M{displayedEarthquake.magnitude.toFixed(1)}
              </Badge>
              <Badge variant="secondary" className="text-[10px] md:text-xs">
                深度 {displayedEarthquake.depth.toFixed(1)}km
              </Badge>
            </div>
            <div className="text-[10px] md:text-xs text-muted-foreground pt-0.5 md:pt-1">
              {displayedEarthquake.latitude.toFixed(4)}°N, {displayedEarthquake.longitude.toFixed(4)}°E
            </div>
            {!selectedEarthquake && (
              <div className="text-[10px] md:text-xs text-muted-foreground pt-1.5 md:pt-2 border-t">
                💡 點擊圓點可固定顯示
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 圖例 - title card 下方，與 title card 左對齊 */}
      <Card className="absolute top-[135px] left-2 md:top-[200px] md:left-3 z-10 backdrop-blur-xl bg-card/90 border border-border/50 shadow-lg py-0 gap-0 !rounded-md">
        <CardHeader className="p-3 md:p-6 pb-0 md:pb-0">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-xs md:text-base">
            <Layers className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
            震源深度
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 md:space-y-2 p-3 md:p-6">
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="w-4 h-2.5 md:w-5 md:h-3 rounded-sm bg-destructive flex-shrink-0"></div>
            <span className="text-[10px] md:text-xs whitespace-nowrap">0-30km (極淺層)</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="w-4 h-2.5 md:w-5 md:h-3 rounded-sm bg-chart-3 flex-shrink-0"></div>
            <span className="text-[10px] md:text-xs whitespace-nowrap">30-70km (淺層)</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="w-4 h-2.5 md:w-5 md:h-3 rounded-sm bg-chart-2 flex-shrink-0"></div>
            <span className="text-[10px] md:text-xs whitespace-nowrap">70-300km (中層)</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="w-4 h-2.5 md:w-5 md:h-3 rounded-sm bg-chart-1 flex-shrink-0"></div>
            <span className="text-[10px] md:text-xs whitespace-nowrap">300km+ (深層)</span>
          </div>
          <div className="hidden sm:block text-[10px] md:text-xs text-muted-foreground pt-1.5 md:pt-2 border-t">
            💡 拖曳旋轉視角，滾輪縮放
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EarthquakeMap;
