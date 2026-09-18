import { useState, useCallback, useEffect } from 'react';

export type ThemeId = 'default' | 'neon' | 'sakura' | 'midnight';

export const THEMES: { id: ThemeId; name: string; accent: string; bg: string }[] = [
  { id: 'default',  name: 'Default',  accent: '#ff2d78', bg: '#0d0d14' },
  { id: 'neon',     name: 'Neon',     accent: '#00f5ff', bg: '#050510' },
  { id: 'sakura',   name: 'Sakura',   accent: '#ff85a1', bg: '#0f0a0f' },
  { id: 'midnight', name: 'Midnight', accent: '#4895ef', bg: '#070d1f' },
];

const LS_KEY = 'kami_theme';

function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id === 'default' ? '' : id);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(LS_KEY) as ThemeId | null;
    return THEMES.some(t => t.id === saved) ? (saved as ThemeId) : 'default';
  });

  useEffect(() => { applyTheme(theme); }, []);

  const setTheme = useCallback((id: ThemeId) => {
    localStorage.setItem(LS_KEY, id);
    setThemeState(id);
    applyTheme(id);
  }, []);

  return { theme, setTheme, themes: THEMES };
}
