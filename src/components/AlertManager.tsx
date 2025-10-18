'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useRTS } from '@/contexts/RTSContext';

const AlertManager = React.memo(() => {
  const { data } = useRTS();
  const [hasAlert, setHasAlert] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/audios/alarm.wav');
  }, []);

  useEffect(() => {
    if (!data) {
      setHasAlert(false);
      return;
    }

    const shouldAlert = data.box && Object.keys(data.box).length > 0;
    setHasAlert(shouldAlert);
  }, [data]);

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
