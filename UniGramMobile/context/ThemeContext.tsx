import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  bg2: string;
  card: string;
  border: string;
  text: string;
  textSub: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  inputBg: string;
  inputBorder: string;
  rowBorder: string;
  statusBar: 'light-content' | 'dark-content';
}

const DARK: ThemeColors = {
  bg: '#0a0a0a',
  bg2: '#111',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  text: '#fff',
  textSub: 'rgba(255,255,255,0.5)',
  textMuted: 'rgba(255,255,255,0.3)',
  accent: '#4f46e5',
  accentLight: '#818cf8',
  inputBg: 'rgba(255,255,255,0.05)',
  inputBorder: 'rgba(255,255,255,0.1)',
  rowBorder: 'rgba(255,255,255,0.06)',
  statusBar: 'light-content',
};

const LIGHT: ThemeColors = {
  bg: '#f5f5f7',
  bg2: '#ffffff',
  card: 'rgba(0,0,0,0.03)',
  border: 'rgba(0,0,0,0.09)',
  text: '#111',
  textSub: 'rgba(0,0,0,0.5)',
  textMuted: 'rgba(0,0,0,0.35)',
  accent: '#4f46e5',
  accentLight: '#4f46e5',
  inputBg: 'rgba(0,0,0,0.04)',
  inputBorder: 'rgba(0,0,0,0.1)',
  rowBorder: 'rgba(0,0,0,0.06)',
  statusBar: 'dark-content',
};

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  colors: DARK,
  toggleTheme: () => {},
});

const STORAGE_KEY = 'unigram_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'light' || val === 'dark') setTheme(val);
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      isDark: theme === 'dark',
      colors: theme === 'dark' ? DARK : LIGHT,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
