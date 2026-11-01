import { vars } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, StatusBar, View, useColorScheme } from 'react-native';

import {
  palettes,
  parseThemePreference,
  resolveTheme,
  themeVariables,
  type ThemePreference,
} from './palette';

export { palettes, type ThemeColors, type ThemePreference } from './palette';
export const THEME_STORAGE_KEY = '@locus_theme_preference';

// Load native storage only when the provider mounts, matching localization.
function getStorage() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage')
    .default as typeof import('@react-native-async-storage/async-storage').default;
}

function createPreferenceWriter() {
  let pending = Promise.resolve();
  return (next: ThemePreference) => {
    pending = pending.then(async () => {
      try {
        if (next === 'system') await getStorage().removeItem(THEME_STORAGE_KEY);
        else await getStorage().setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Keep the chosen appearance active for this session.
      }
    });
    return pending;
  };
}

function themeValue(preference: ThemePreference, system: string | null | undefined) {
  const theme = resolveTheme(preference, system);
  return {
    preference,
    theme,
    isDark: theme === 'dark',
    colors: palettes[theme],
  };
}

const AppThemeContext = createContext({
  ...themeValue('dark', 'dark'),
  setPreference: async (_preference: ThemePreference): Promise<void> => {},
});

export function ThemeScope({ children }: React.PropsWithChildren) {
  const { colors } = useAppTheme();
  const variables = useMemo(() => vars(themeVariables(colors)), [colors]);
  return <View style={[{ flex: 1 }, variables]}>{children}</View>;
}

export function AppThemeProvider({ children }: React.PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const [writePreference] = useState(createPreferenceWriter);

  useEffect(() => {
    let mounted = true;
    void getStorage()
      .getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (mounted) setPreferenceState(parseThemePreference(stored));
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      setPreferenceState(next);
      await writePreference(next);
    },
    [writePreference]
  );

  const value = useMemo(
    () => ({ ...themeValue(preference, system), setPreference }),
    [preference, system, setPreference]
  );

  useEffect(() => {
    if (!ready) return;
    // Native dialogs and keyboards follow explicit choices too. Clear the override
    // for System so future device changes continue to reach useColorScheme.
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SystemUI = require('expo-system-ui') as typeof import('expo-system-ui');
    void SystemUI.setBackgroundColorAsync(value.colors.canvas).catch(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = value.theme;
      document.body.style.backgroundColor = value.colors.canvas;
    }
  }, [preference, ready, value.colors.canvas, value.theme]);

  if (!ready) return null;
  return (
    <AppThemeContext.Provider value={value}>
      <StatusBar barStyle={value.isDark ? 'light-content' : 'dark-content'} />
      <ThemeScope>{children}</ThemeScope>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}
