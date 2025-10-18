'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { fetchAndProcessStationData, type ProcessedStationData } from '@/lib/rts';

interface RTSContextType {
  data: ProcessedStationData | null;
  isLoading: boolean;
  error: Error | null;
}

const RTSContext = createContext<RTSContextType | undefined>(undefined);

export function RTSProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ProcessedStationData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const fetchData = async () => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    try {
      const newData = await fetchAndProcessStationData();
      setData(newData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <RTSContext.Provider value={{ data, isLoading, error }}>
      {children}
    </RTSContext.Provider>
  );
}

export function useRTS() {
  const context = useContext(RTSContext);
  if (context === undefined) {
    throw new Error('useRTS must be used within a RTSProvider');
  }
  return context;
}
