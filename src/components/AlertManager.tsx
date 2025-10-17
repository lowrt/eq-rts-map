'use client';

import React, { useRef, useState, useEffect } from 'react';
import { fetchAndProcessStationData } from '@/lib/rts';

const AlertManager = React.memo(() => {
  const [hasAlert, setHasAlert] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/audios/alarm.wav');

    const enableAutostart = async () => {
      try {
        const { enable } = await import('@tauri-apps/plugin-autostart');
        await enable();
      } catch (error) {
        setHasAlert(false);
      }
    };

    enableAutostart();
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
