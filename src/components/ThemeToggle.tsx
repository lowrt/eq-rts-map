'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder with same size to prevent layout shift
    return (
      <Button
        variant="outline"
        size="icon"
        className="rounded-lg h-7 w-7"
        disabled
      >
        <div className="h-4 w-4" />
      </Button>
    );
  }

  const toggleTheme = () => {
    // If currently in system mode or dark, switch to light
    // If in light mode, switch to dark
    const currentTheme = theme === 'system' ? resolvedTheme : theme;
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="rounded-lg h-7 w-7"
      title={`Current theme: ${theme}`}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
