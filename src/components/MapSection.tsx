'use client';

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import Map, { NavigationControl, Source, Layer, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { type StationGeoJSON } from '@/lib/rts';
import { useRTS } from '@/contexts/RTSContext';

const CORNER_TOOLTIP_POSITIONS = [
  { id: 'top-left', position: [119.7, 25.4] as [number, number] },
  { id: 'top-right', position: [122.2, 23.6] as [number, number] },
  { id: 'bottom-left', position: [119.7, 22] as [number, number] },
  { id: 'bottom-right', position: [121.6, 22] as [number, number]},
];

const TOOLTIP_WINDOW_OFFSETS = {
  'top-left': { x: -60, y: -35 },
  'top-right': { x: -70, y: -30 },
  'bottom-left': { x: -60, y: -45 },
  'bottom-right': { x: -50, y: -45 },
};

interface AlertTooltip {
  stationId: string;
  stationCode: string;
  intensity: number;
  pga: number;
  coordinates: [number, number];
  tooltipPosition: [number, number];
  cornerId: string;
  isActive: boolean;
}

const MapSection = React.memo(() => {
  const { data: rtsData } = useRTS();
  const mapRef = useRef<MapRef>(null);
  const [stationData, setStationData] = useState<StationGeoJSON | null>(null);
  const [dataTime, setDataTime] = useState<number>(0);
  const [maxIntensity, setMaxIntensity] = useState<number>(-3);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);
  const [alertTooltips, setAlertTooltips] = useState<AlertTooltip[]>([]);
  const [tooltipUsage, setTooltipUsage] = useState<Record<string, boolean>>({});
  const [tooltipSwitchIndex, setTooltipSwitchIndex] = useState<number>(0);
  const tooltipSwitchIndexRef = useRef<number>(0);
  const [currentTooltipData, setCurrentTooltipData] = useState<AlertTooltip[]>([]);
  const [allAlertStations, setAllAlertStations] = useState<AlertTooltip[]>([]);
  const sourceInitializedRef = useRef<boolean>(false);
  const isMapReadyRef = useRef<boolean>(false);
  const updateMapDataRef = useRef<any>(null);

  // 震度階轉換函數
  const intensity_float_to_int = (float: number): number => {
    return float < 0 ? 0 : float < 4.5 ? Math.round(float) : float < 5 ? 5 : float < 5.5 ? 6 : float < 6 ? 7 : float < 6.5 ? 8 : 9;
  };

  const intensity_list = ['0', '1', '2', '3', '4', '5⁻', '5⁺', '6⁻', '6⁺', '7'];

  // 震度顏色配置
  const INTENSITY_COLORS = {
    0: '#202020',
    1: '#003264',
    2: '#0064c8',
    3: '#1e9632',
    4: '#ffc800',
    5: '#ff9600',
    6: '#ff6400',
    7: '#ff0000',
    8: '#c00000',
    9: '#9600c8',
  };

  const INTENSITY_TEXT_COLORS = {
    0: '#ffffff',
    1: '#ffffff',
    2: '#ffffff',
    3: '#ffffff',
    4: '#000000',
    5: '#000000',
    6: '#000000',
    7: '#ffffff',
    8: '#ffffff',
    9: '#ffffff',
  };

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

  // 計算到tooltip位置的距離
  const calculateDistance = (stationCoords: [number, number], tooltipCoords: [number, number]): number => {
    const [lon1, lat1] = stationCoords;
    const [lon2, lat2] = tooltipCoords;
    return Math.sqrt(Math.pow(lon2 - lon1, 2) + Math.pow(lat2 - lat1, 2));
  };

  // 計算線條交叉數量 - 使用真正的線段相交算法
  const calculateCrossings = (assignments: Array<{station: AlertTooltip, corner: any}>): number => {
    // 檢查兩條線段是否相交（使用向量叉積法）
    const doSegmentsIntersect = (
      p1: [number, number], p2: [number, number],
      p3: [number, number], p4: [number, number]
    ): boolean => {
      const ccw = (a: [number, number], b: [number, number], c: [number, number]): number => {
        return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
      };

      const d1 = ccw(p3, p4, p1);
      const d2 = ccw(p3, p4, p2);
      const d3 = ccw(p1, p2, p3);
      const d4 = ccw(p1, p2, p4);

      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
      }

      return false;
    };

    let crossings = 0;
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const line1Start: [number, number] = assignments[i].station.coordinates;
        const line1End: [number, number] = assignments[i].corner.position;
        const line2Start: [number, number] = assignments[j].station.coordinates;
        const line2End: [number, number] = assignments[j].corner.position;

        if (doSegmentsIntersect(line1Start, line1End, line2Start, line2End)) {
          crossings++;
        }
      }
    }
    return crossings;
  };

  // 檢查線條是否會交叉
  const wouldCross = (station1: AlertTooltip, station2: AlertTooltip, corner1: any, corner2: any): boolean => {
    const [s1Lon, s1Lat] = station1.coordinates;
    const [s2Lon, s2Lat] = station2.coordinates;
    const [c1Lon, c1Lat] = corner1.position;
    const [c2Lon, c2Lat] = corner2.position;
    
    // 簡化的線條交叉檢測
    // 如果兩個測站分別連到對角線的tooltip，可能會交叉
    const isDiagonal1 = (corner1.id === 'top-left' && corner2.id === 'bottom-right') || 
                       (corner1.id === 'top-right' && corner2.id === 'bottom-left');
    const isDiagonal2 = (corner2.id === 'top-left' && corner1.id === 'bottom-right') || 
                       (corner2.id === 'top-right' && corner1.id === 'bottom-left');
    
    if (isDiagonal1 || isDiagonal2) {
      // 檢查測站是否在對角線的兩側
      const station1ToCorner1 = Math.abs(s1Lon - c1Lon) + Math.abs(s1Lat - c1Lat);
      const station1ToCorner2 = Math.abs(s1Lon - c2Lon) + Math.abs(s1Lat - c2Lat);
      const station2ToCorner1 = Math.abs(s2Lon - c1Lon) + Math.abs(s2Lat - c1Lat);
      const station2ToCorner2 = Math.abs(s2Lon - c2Lon) + Math.abs(s2Lat - c2Lat);
      
      // 如果測站1更接近corner1，測站2更接近corner2，則可能交叉
      return (station1ToCorner1 < station1ToCorner2) && (station2ToCorner2 < station2ToCorner1);
    }
    
    return false;
  };

  // 選擇要顯示的測站（允許隨機偏移）
  const selectStationsToShow = (alertStations: AlertTooltip[]): AlertTooltip[] => {
    if (alertStations.length === 0) return [];

    // 按強度排序
    const sortedStations = [...alertStations].sort((a, b) => b.intensity - a.intensity);

    // 1. 強度最大的測站必須顯示
    const maxIntensityStation = sortedStations[0];
    if (!maxIntensityStation) return [];

    // 如果只有一個測站，直接返回
    if (sortedStations.length === 1) return [maxIntensityStation];

    // 2. 其餘測站按 p75, p50, p25 選擇，但允許隨機偏移
    const remainingStations = sortedStations.slice(1);
    const selectedStations: AlertTooltip[] = [maxIntensityStation];

    // 隨機偏移範圍：±10% 的索引範圍
    const getRandomOffset = (arrayLength: number): number => {
      const range = Math.max(1, Math.floor(arrayLength * 0.1));
      return Math.floor(Math.random() * (range * 2 + 1)) - range;
    };

    const percentiles = [0.75, 0.5, 0.25];
    const usedIndices = new Set<number>();

    for (const percentile of percentiles) {
      if (selectedStations.length >= 4) break;

      const baseIndex = Math.floor(remainingStations.length * percentile);
      const offset = getRandomOffset(remainingStations.length);
      let targetIndex = Math.max(0, Math.min(remainingStations.length - 1, baseIndex + offset));

      // 如果該索引已使用，找最近的未使用索引
      let attempts = 0;
      while (usedIndices.has(targetIndex) && attempts < remainingStations.length) {
        targetIndex = (targetIndex + 1) % remainingStations.length;
        attempts++;
      }

      if (!usedIndices.has(targetIndex)) {
        selectedStations.push(remainingStations[targetIndex]);
        usedIndices.add(targetIndex);
      }
    }

    return selectedStations;
  };

  // 分配tooltip位置 - 使用最少交叉為主、最近距離為次要的算法
  const assignTooltipPositions = (alertStations: AlertTooltip[]): AlertTooltip[] => {
    const selectedStations = selectStationsToShow(alertStations);
    if (selectedStations.length === 0) return [];

    // 如果只有一個測站
    if (selectedStations.length === 1) {
      const corner = CORNER_TOOLTIP_POSITIONS[0];
      return [{
        ...selectedStations[0],
        tooltipPosition: corner.position,
        cornerId: corner.id,
        isActive: true
      }];
    }

    // 生成所有可能的分配組合（排列）
    const generatePermutations = (arr: any[]): any[][] => {
      if (arr.length <= 1) return [arr];
      const result: any[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
        const remainingPerms = generatePermutations(remaining);
        for (const perm of remainingPerms) {
          result.push([current].concat(perm));
        }
      }
      return result;
    };

    // 只考慮前 N 個位置（N = 測站數量）
    const cornersToUse = CORNER_TOOLTIP_POSITIONS.slice(0, selectedStations.length);
    const allCornerPermutations = generatePermutations(cornersToUse);

    // 評估每種分配組合
    interface Assignment {
      combination: Array<{station: AlertTooltip, corner: any}>;
      crossings: number;
      totalDistance: number;
    }

    const assignments: Assignment[] = [];

    for (const cornerPerm of allCornerPermutations) {
      const combination = selectedStations.map((station, index) => ({
        station,
        corner: cornerPerm[index]
      }));

      const crossings = calculateCrossings(combination);

      // 計算總距離
      let totalDistance = 0;
      for (const {station, corner} of combination) {
        totalDistance += calculateDistance(station.coordinates, corner.position);
      }

      assignments.push({ combination, crossings, totalDistance });
    }

    // 排序：優先選擇交叉最少的，次要選擇距離最近的
    assignments.sort((a, b) => {
      if (a.crossings !== b.crossings) {
        return a.crossings - b.crossings; // 交叉少的優先
      }
      return a.totalDistance - b.totalDistance; // 距離短的優先
    });

    const bestAssignment = assignments[0];

    // 轉換為 AlertTooltip 格式
    return bestAssignment.combination.map(({station, corner}) => ({
      ...station,
      tooltipPosition: corner.position,
      cornerId: corner.id,
      isActive: true
    }));
  };

  // 更新tooltip數據（每秒執行）- 保持位置和連接的測站不變，只更新該測站的最新資料
  const updateTooltipData = (positionedTooltips: AlertTooltip[], allStations: AlertTooltip[]): AlertTooltip[] => {
    if (positionedTooltips.length === 0) return [];

    // 建立測站 ID 到測站資料的映射
    const stationMap: Record<string, AlertTooltip> = {};
    allStations.forEach(station => {
      stationMap[station.stationId] = station;
    });

    // 保持位置和連接的測站不變，只更新該測站的最新資料
    return positionedTooltips.map((tooltip) => {
      const latestStationData = stationMap[tooltip.stationId];

      if (!latestStationData) {
        // 如果該測站不存在了，保持原有資料
        return tooltip;
      }

      return {
        ...tooltip, // 保持原有的 tooltipPosition, cornerId, stationId
        stationCode: latestStationData.stationCode,
        intensity: latestStationData.intensity,
        pga: latestStationData.pga,
        coordinates: latestStationData.coordinates,
      };
    });
  };

  const initializeMapSource = useCallback(() => {
    if (!mapRef.current || !stationData || sourceInitializedRef.current) return;

    const map = mapRef.current.getMap();
    
    if (!map.getSource('stations')) {
      map.addSource('stations', {
        type: 'geojson',
        data: stationData,
      });

      // 添加 tooltip 線條源
      map.addSource('tooltip-lines', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // 添加 tooltip 線條圖層
      map.addLayer({
        id: 'tooltip-lines',
        type: 'line',
        source: 'tooltip-lines',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1,
          'line-opacity': 0.8,
        },
      });

      // 添加測站點圖層，確保在線條之上
      map.addLayer({
        id: 'station-circles',
        type: 'circle',
        source: 'stations',
        layout: {
          'circle-sort-key': ['get', 'sortKey'],
        },
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-opacity': 1,
          'circle-stroke-width': ['case', ['get', 'isConnected'], 3, 1],
          'circle-stroke-color': '#ffffff',
        },
      });

      sourceInitializedRef.current = true;
    }
  }, [stationData]);

  const updateMapData = useCallback((newData: StationGeoJSON) => {
    if (!mapRef.current || !sourceInitializedRef.current) return;

    const map = mapRef.current.getMap();
    const source = map.getSource('stations') as any;
    
    if (source && source.setData) {
      source.setData(newData);
    }
  }, []);

  // 更新 tooltip 線條
  const updateTooltipLines = useCallback((tooltips: AlertTooltip[]) => {
    if (!mapRef.current || !sourceInitializedRef.current) return;

    const map = mapRef.current.getMap();
    const source = map.getSource('tooltip-lines') as any;
    
    if (source && source.setData) {
      const lineFeatures = tooltips
        .filter(tooltip => tooltip.isActive) // 只處理活躍的tooltip
        .map(tooltip => ({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [tooltip.coordinates, tooltip.tooltipPosition]
          },
          properties: {
            stationId: tooltip.stationId,
            cornerId: tooltip.cornerId
          }
        }));

      const lineData = {
        type: 'FeatureCollection' as const,
        features: lineFeatures
      };

      source.setData(lineData);
    }
  }, []);

  const handleMapLoad = useCallback(() => {
    setIsMapReady(true);
  }, []);

  // 更新refs
  useEffect(() => {
    isMapReadyRef.current = isMapReady;
  }, [isMapReady]);

  useEffect(() => {
    updateMapDataRef.current = updateMapData;
  }, [updateMapData]);

  // 處理來自 Context 的資料 - 更新基本資料和 alert stations
  useEffect(() => {
    if (!rtsData) return;

    const data = rtsData;

    setStationData(data.geojson);
    setDataTime(data.time);

    let max = -3;
    data.geojson.features.forEach((feature) => {
      if (feature.properties.intensity > max) {
        max = feature.properties.intensity;
      }
    });
    setMaxIntensity(max);

    // 處理 alert tooltips
    const alertStations: AlertTooltip[] = [];
    data.geojson.features.forEach((feature) => {
      // 檢查是否有 alert（強度大於 0 或特定條件）
      if (feature.properties.intensity > 0) {
        alertStations.push({
          stationId: feature.properties.id,
          stationCode: feature.properties.code,
          intensity: feature.properties.intensity,
          pga: feature.properties.pga || 0,
          coordinates: feature.geometry.coordinates,
          tooltipPosition: [0, 0], // 暫時位置，稍後計算
          cornerId: '',
          isActive: false
        });
      }
    });

    // 保存所有alert測站數據
    setAllAlertStations(alertStations);
  }, [rtsData]);

  // 每3秒重新分配tooltip位置
  useEffect(() => {
    if (allAlertStations.length === 0) {
      setAlertTooltips([]);
      return;
    }

    const positionedTooltips = assignTooltipPositions(allAlertStations);
    setAlertTooltips(positionedTooltips);

    console.log('重新分配 Tooltip 位置:', {
      switchIndex: tooltipSwitchIndexRef.current,
      alertStationsCount: allAlertStations.length,
      positionedCount: positionedTooltips.length
    });
  }, [tooltipSwitchIndex]); // 只依賴 tooltipSwitchIndex，每3秒觸發一次

  // 每秒更新tooltip數據（保持位置不變）
  useEffect(() => {
    if (allAlertStations.length === 0) {
      setCurrentTooltipData([]);
      return;
    }

    // 如果還沒有分配過位置，先分配一次
    const currentPositions = alertTooltips.length > 0 ? alertTooltips : assignTooltipPositions(allAlertStations);
    const updatedTooltips = updateTooltipData(currentPositions, allAlertStations);
    setCurrentTooltipData(updatedTooltips);

    console.log('更新 Tooltip 資料:', {
      alertStationsCount: allAlertStations.length,
      tooltipIds: updatedTooltips.map(t => t.stationId)
    });
  }, [allAlertStations, alertTooltips]); // 依賴資料和位置，每秒更新

  // 更新地圖資料
  useEffect(() => {
    if (!rtsData || !isMapReadyRef.current || !sourceInitializedRef.current) return;

    // 為正在連線的測站添加 isConnected 屬性
    const connectedStationIds = new Set(currentTooltipData.map(t => t.stationId));
    const updatedGeoJSON = {
      ...rtsData.geojson,
      features: rtsData.geojson.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          isConnected: connectedStationIds.has(feature.properties.id)
        }
      }))
    };

    updateMapDataRef.current(updatedGeoJSON);
    updateTooltipLines(currentTooltipData);
  }, [rtsData, currentTooltipData, updateTooltipLines]);

  useEffect(() => {
    if (isMapReady && stationData) {
      initializeMapSource();
    }
  }, [isMapReady, stationData, initializeMapSource]);

  // 3秒切換tooltip選擇
  useEffect(() => {
    const interval = setInterval(() => {
      setTooltipSwitchIndex(prev => {
        const newValue = prev + 1;
        tooltipSwitchIndexRef.current = newValue;
        return newValue;
      });
    }, 3000);

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
        onLoad={handleMapLoad}
        onError={() => {}}
      >
      </Map>
      
      {/* Alert Tooltips */}
      {currentTooltipData.map((tooltip, index) => {
        if (!mapRef.current || !tooltip.isActive) return null;
        
        const [lon, lat] = tooltip.tooltipPosition;
        const pixel = mapRef.current.project([lon, lat]);
        
        // 使用配置的偏移量調整tooltip位置
        const offset = TOOLTIP_WINDOW_OFFSETS[tooltip.cornerId as keyof typeof TOOLTIP_WINDOW_OFFSETS];
        let tooltipLeft = pixel.x + offset.x;
        let tooltipTop = pixel.y + offset.y;
        
        // 確保tooltip不超出地圖邊界
        const mapContainer = mapRef.current.getContainer();
        const mapWidth = mapContainer.offsetWidth;
        const mapHeight = mapContainer.offsetHeight;
        
        // 邊界檢查
        tooltipLeft = Math.max(5, Math.min(mapWidth - 95, tooltipLeft));
        tooltipTop = Math.max(5, Math.min(mapHeight - 75, tooltipTop));
        
        return (
          <div
            key={`${tooltip.stationId}-${tooltip.cornerId}`}
            className="absolute z-50 pointer-events-none"
            style={{
              left: tooltipLeft,
              top: tooltipTop,
            }}
          >
            {/* 超緊湊的tooltip容器 */}
            <div className="bg-gradient-to-br from-slate-900/98 to-gray-800/98 backdrop-blur-lg rounded-md p-2 border border-white/30 min-w-[90px] shadow-lg">
              {/* 標題區域 - 地區 */}
              <div className="flex items-center justify-center mb-1.5">
                <div className="text-white text-xs font-medium">
                  {tooltip.stationCode}
                </div>
              </div>
              
              {/* 震度階顯示 - 方形圓角框 */}
              <div className="flex items-center gap-1 mb-1.5">
                <div className="text-white/70 text-xs">震度</div>
                <div 
                  className="rounded px-1.5 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: INTENSITY_COLORS[intensity_float_to_int(tooltip.intensity) as keyof typeof INTENSITY_COLORS],
                    color: INTENSITY_TEXT_COLORS[intensity_float_to_int(tooltip.intensity) as keyof typeof INTENSITY_TEXT_COLORS]
                  }}
                >
                  {intensity_list[intensity_float_to_int(tooltip.intensity)]}
                </div>
              </div>
              
            </div>
          </div>
        );
      })}
      
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

MapSection.displayName = 'MapSection';

export default MapSection;