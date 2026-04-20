import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'kng_theme';
type Theme = 'dark' | 'light';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? getSystemTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage nicht verfügbar — egal
    }
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-kng-md border border-kng-border bg-kng-surface hover:bg-kng-surface-hover text-kng-text-secondary hover:text-kng-text transition-colors"
      aria-label={theme === 'dark' ? 'Zu Light-Mode wechseln' : 'Zu Dark-Mode wechseln'}
      title={theme === 'dark' ? 'Light-Mode' : 'Dark-Mode'}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
};
