import { useLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { type AppLanguage, type LanguagePreference } from './catalog';
import { getActiveLanguage, languageFromLocales, setActiveLanguage, translate } from './locale';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
declare const require: (id: string) => { default: AsyncStorageLike };

function getAsyncStorage() {
  return require('@react-native-async-storage/async-storage').default;
}

export {
  getActiveLanguage,
  getActiveLocale,
  getLocaleForLanguage,
  languageFromLocales,
  translate,
} from './locale';

const LANGUAGE_STORAGE_KEY = '@locus_language_preference';
type LocalizationContextValue = {
  language: AppLanguage;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => Promise<void>;
  t: typeof translate;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: React.PropsWithChildren) {
  const locales = useLocales();
  const deviceLanguage = languageFromLocales(locales);
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  const [ready, setReady] = useState(false);
  const language = preference === 'system' ? deviceLanguage : preference;

  useEffect(() => {
    let mounted = true;
    void Promise.resolve()
      .then(() => getAsyncStorage().getItem(LANGUAGE_STORAGE_KEY))
      .then((stored) => {
        if (!mounted) return;
        const nextPreference = stored === 'en' || stored === 'pt' ? stored : 'system';
        setActiveLanguage(nextPreference === 'system' ? deviceLanguage : nextPreference);
        setPreferenceState(nextPreference);
        setReady(true);
      })
      .catch(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [deviceLanguage]);

  useEffect(() => {
    setActiveLanguage(language);
  }, [language]);

  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active' && preference === 'system') {
        setActiveLanguage(languageFromLocales(locales));
      }
    };
    const subscription = AppState.addEventListener('change', onAppState);
    return () => subscription.remove();
  }, [locales, preference]);

  const setPreference = useCallback(async (next: LanguagePreference) => {
    setPreferenceState(next);
    try {
      const AsyncStorage = getAsyncStorage();
      if (next === 'system') await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
      else await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // The active choice still applies for this session if storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ language, preference, setPreference, t: translate }),
    [language, preference, setPreference]
  );
  if (!ready) return null;
  setActiveLanguage(language);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const value = useContext(LocalizationContext);
  return (
    value ?? {
      language: getActiveLanguage(),
      preference: 'system',
      setPreference: async () => undefined,
      t: translate,
    }
  );
}
