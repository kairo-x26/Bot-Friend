import {
  darkColors,
  fontFamily,
  lightColors,
  motion,
  radius,
  space,
  typeScale,
  type ColorScheme,
} from '@bot-friend/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  colors: ColorScheme;
  space: typeof space;
  radius: typeof radius;
  font: typeof fontFamily;
  type: typeof typeScale;
  motion: typeof motion;
  /** True when the OS or the user asked for less motion. Components must respect it. */
  reducedMotion: boolean;
  /** Multiplier applied to type sizes for the in-app large text setting. */
  textScale: number;
}

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeSettings {
  theme: 'system' | 'light' | 'dark';
  reducedMotion: boolean;
  largeText: boolean;
}

export function ThemeProvider({ settings, children }: { settings: ThemeSettings; children: ReactNode }) {
  const system = useColorScheme();
  const osReducedMotion = useOsReducedMotion();
  const dark = settings.theme === 'system' ? system === 'dark' : settings.theme === 'dark';

  const value = useMemo<Theme>(
    () => ({
      dark,
      colors: dark ? darkColors : lightColors,
      space,
      radius,
      font: fontFamily,
      type: typeScale,
      motion,
      reducedMotion: settings.reducedMotion || osReducedMotion,
      textScale: settings.largeText ? 1.18 : 1,
    }),
    [dark, settings.reducedMotion, settings.largeText, osReducedMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}

function useOsReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
