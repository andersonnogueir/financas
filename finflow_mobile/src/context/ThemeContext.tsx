import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSubtle: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryLight: string;
  success: string;
  danger: string;
  warning: string;
  card: string;
  isDark: boolean;
}

export const darkTheme: ThemeColors = {
  background: '#090d16',
  surface: '#0f172a',
  surfaceSubtle: '#1e293b',
  border: '#1e293b',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  primary: '#6366f1',
  primaryLight: '#818cf8',
  success: '#10b981',
  danger: '#f43f5e',
  warning: '#f59e0b',
  card: '#0f172a',
  isDark: true,
};

export const lightTheme: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  primary: '#4f46e5',
  primaryLight: '#6366f1',
  success: '#059669',
  danger: '#e11d48',
  warning: '#d97706',
  card: '#ffffff',
  isDark: false,
};

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: darkTheme,
  isDark: true,
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState<boolean>(true);

  useEffect(() => {
    AsyncStorage.getItem('finflow_app_theme').then((saved) => {
      if (saved) {
        setIsDark(saved === 'dark');
      } else {
        setIsDark(systemScheme !== 'light');
      }
    });
  }, [systemScheme]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem('finflow_app_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ colors: isDark ? darkTheme : lightTheme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
