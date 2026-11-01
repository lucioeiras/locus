import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Text, View } from 'react-native';

import { LocalizedText } from '@/components/LocalizedText';
import { catalogs } from '@/lib/i18n/catalog';
import { languageFromLocales, LocalizationProvider, translate, useLocalization } from '@/lib/i18n';
import { setActiveLanguage } from '@/lib/i18n/locale';

let mockLocales = [{ languageCode: 'en' }];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

function LanguageProbe() {
  const { language, preference, setPreference } = useLocalization();
  return (
    <View>
      <Text testID="language">{language}</Text>
      <Text testID="preference">{preference}</Text>
      <LocalizedText>A photo or video</LocalizedText>
      <LocalizedText>Imported title from an article</LocalizedText>
      <Pressable testID="select-english" onPress={() => void setPreference('en')}>
        <Text>English</Text>
      </Pressable>
      <Pressable testID="select-system" onPress={() => void setPreference('system')}>
        <Text>System</Text>
      </Pressable>
    </View>
  );
}

describe('app localization', () => {
  const mockAsyncStorage = AsyncStorage as unknown as {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };

  beforeEach(() => {
    mockLocales = [{ languageCode: 'en' }];
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
    jest.clearAllMocks();
  });

  it('uses the first supported preferred language and falls back to English', () => {
    expect(languageFromLocales([{ languageCode: 'pt' }, { languageCode: 'en' }])).toBe('pt');
    expect(languageFromLocales([{ languageCode: 'fr' }, { languageCode: 'pt-BR' }])).toBe('pt');
    expect(languageFromLocales([{ languageCode: 'fr' }])).toBe('en');
    expect(languageFromLocales([])).toBe('en');
  });

  it('uses the device language by default, persists manual choices, and returns to System', async () => {
    mockLocales = [{ languageCode: 'pt' }];
    const view = await render(
      <LocalizationProvider>
        <LanguageProbe />
      </LocalizationProvider>
    );

    await waitFor(() => expect(view.getByTestId('language').props.children).toBe('pt'));
    expect(view.getByText('Uma foto ou vídeo')).toBeTruthy();
    expect(view.getByText('Imported title from an article')).toBeTruthy();

    fireEvent.press(view.getByTestId('select-english'));
    await waitFor(() => expect(view.getByTestId('language').props.children).toBe('en'));
    expect(view.getByText('A photo or video')).toBeTruthy();
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('@locus_language_preference', 'en');

    fireEvent.press(view.getByTestId('select-system'));
    await waitFor(() => expect(view.getByTestId('preference').props.children).toBe('system'));
    expect(view.getByTestId('language').props.children).toBe('pt');
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@locus_language_preference');
  });

  it('keeps the English and Portuguese catalogs in sync for app-authored UI strings', () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(Object.keys(catalogs.pt).sort());
  });

  it('translates the selected-card count with Portuguese plural agreement', () => {
    setActiveLanguage('pt');
    expect(translate('1 card selected')).toBe('1 cartão selecionado');
    expect(translate('%{count} cards selected', { count: 3 })).toBe('3 cartões selecionados');
    setActiveLanguage('en');
  });

  it('translates the complete add-page heading as a phrase', () => {
    setActiveLanguage('pt');
    expect(translate('Save what matters')).toBe('Salve o que importa');
    setActiveLanguage('en');
  });

  it('translates the audio recording action and active state', () => {
    setActiveLanguage('pt');
    expect(translate('Record audio')).toBe('Gravar áudio');
    expect(translate('Stop audio recording')).toBe('Parar gravação de áudio');
    expect(translate('Speak my mind')).toBe('Dê voz às ideias');
    expect(translate('Recording · %{seconds}s', { seconds: 12 })).toBe('Gravando · 12s');
    setActiveLanguage('en');
  });
});

it.each(['en', 'pt'] as const)('uses Locus in %s app branding', (language) => {
  setActiveLanguage(language);
  for (const key of [
    'Choose the appearance used by Locus.',
    'Choose the language used by Locus.',
    'Locus is offline-first and believes files should remain under your control.',
  ]) {
    expect(translate(key)).toContain('Locus');
  }
  setActiveLanguage('en');
});
