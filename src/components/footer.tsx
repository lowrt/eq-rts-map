'use client';

import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { open } from '@tauri-apps/plugin-shell';
import { getVersion } from '@tauri-apps/api/app';
import { useState, useEffect } from 'react';

export default function Footer() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(`v${appVersion}`);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
        setVersion('v1.0.0');
      }
    };

    fetchVersion();
  }, []);

  const handleGithubClick = async () => {
    try {
      await open('https://github.com/ExpTechTW/eq-rts-map');
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  return (
    <footer className="fixed bottom-3 left-3 z-50">
      <div className="bg-background/90 backdrop-blur-sm border border-border/50 rounded-md px-2.5 py-1.5 shadow-md flex items-center gap-2">
        <p className="text-[10px] text-muted-foreground font-medium">
          {version || 'v1.0.0'}
        </p>
        <div className="w-px h-3 bg-border/60" />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGithubClick}
          className="h-5 w-5 hover:bg-accent/50 transition-colors"
          title="GitHub Repository"
        >
          <Github className="h-3 w-3" />
        </Button>
      </div>
    </footer>
  );
}