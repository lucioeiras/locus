import {
  InstrumentSans_400Regular,
  InstrumentSans_400Regular_Italic,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';
import { ExtensionStorage } from '@bacons/apple-targets';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/global.css';
import { LibraryProvider, useLibrary } from '@/hooks/useLibrary';
import { AppThemeProvider, useAppTheme } from '@/lib/theme';
import { LocalizationProvider } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

const controlStorage = new ExtensionStorage('group.com.diegoeiras.locus');

function openControlDestination(item: string, token: string) {
  const supportedItems = new Set([
    'note',
    'link',
    'book',
    'music',
    'movie',
    'tvshow',
    'game',
    'image',
    'pdf',
  ]);
  router.replace({
    pathname: '/board',
    params: {
      controlAddItem: supportedItems.has(item) ? item : 'all',
      controlToken: token,
    },
  });
}

function consumePendingControlAdd() {
  const pendingRequest = controlStorage.get('pendingControlAdd');
  if (!pendingRequest) return;

  controlStorage.remove('pendingControlAdd');
  const separatorIndex = pendingRequest.indexOf('|');
  if (separatorIndex === -1) {
    openControlDestination(pendingRequest, Date.now().toString());
    return;
  }

  openControlDestination(
    pendingRequest.slice(0, separatorIndex),
    pendingRequest.slice(separatorIndex + 1) || Date.now().toString()
  );
}

function RootNavigator() {
  const { colors, isDark } = useAppTheme();
  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.canvas,
      card: colors.surface,
      text: colors.foreground,
      border: colors.border,
      primary: colors.blue,
    },
  };
  const { isInitialized } = useLibrary();
  const linkingURL = Linking.useLinkingURL();

  useEffect(() => {
    if (!isInitialized) return;
    consumePendingControlAdd();
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      consumePendingControlAdd();
    });

    return () => subscription.remove();
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized || !linkingURL) return;

    try {
      const url = new URL(linkingURL);
      if (url.protocol !== 'locus:') return;

      const controlItem = url.searchParams.get('controlItem');
      const route = url.pathname.replace(/^\/+/, '');
      const isControlRoute =
        url.hostname === 'control-add' ||
        route === 'control-add' ||
        url.hostname === 'add' ||
        (route === 'add' && controlItem !== null);

      if (!isControlRoute) return;

      const token = url.searchParams.get('controlToken') ?? Date.now().toString();
      openControlDestination(controlItem ?? 'all', token);
    } catch {
      // Ignore URLs that are not valid absolute deep links.
    }
  }, [isInitialized, linkingURL]);

  useEffect(() => {
    if (isInitialized) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isInitialized]);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen name="handle-share" />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="card/[id]"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    InstrumentSans_400Regular_Italic,
    InstrumentSerif_400Regular_Italic,
  });

  if (!loaded && !error) {
    return null;
  }

  return (
    <LocalizationProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppThemeProvider>
          <LibraryProvider>
            <RootNavigator />
          </LibraryProvider>
        </AppThemeProvider>
      </GestureHandlerRootView>
    </LocalizationProvider>
  );
}
