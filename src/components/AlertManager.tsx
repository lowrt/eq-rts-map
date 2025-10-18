'use client';

import React, { useRef, useState, useEffect } from 'react';
import { fetchAndProcessStationData } from '@/lib/rts';

const AlertManager = React.memo(() => {
  const [hasAlert, setHasAlert] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/audios/alarm.wav');

    // Electron autostart 功能可以通過 electron-builder 的配置實現
    // 或者在主進程中使用 app.setLoginItemSettings
    // 這裡不需要在渲染進程中處理
  }, []);

  useEffect(() => {
    const checkAlert = async () => {
      try {
        const data = await fetchAndProcessStationData();
        const shouldAlert = data.box && Object.keys(data.box).length > 0;
        setHasAlert(shouldAlert);
      } catch (error) {
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
      audioRef.current?.play().catch(() => {});
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

  return null;
});

AlertManager.displayName = 'AlertManager';

export default AlertManager;
