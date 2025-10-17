'use client';

import React from 'react';
import MapSection from '@/components/MapSection';
import ChartSection from '@/components/ChartSection';
import AlertManager from '@/components/AlertManager';

export default function Home() {
  return (
    <div className="flex h-screen w-full">
      <AlertManager />
      <MapSection />
      <ChartSection />
    </div>
  );
}