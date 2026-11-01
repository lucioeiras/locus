import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export const LINK_OPENING_STORAGE_KEY = '@locus_link_opening_preference';
export type LinkOpeningPreference = 'device' | 'embedded';

export async function readLinkOpeningPreference(): Promise<LinkOpeningPreference> {
  try {
    return (await AsyncStorage.getItem(LINK_OPENING_STORAGE_KEY)) === 'embedded'
      ? 'embedded'
      : 'device';
  } catch {
    return 'device';
  }
}

export async function writeLinkOpeningPreference(value: LinkOpeningPreference) {
  try {
    if (value === 'device') await AsyncStorage.removeItem(LINK_OPENING_STORAGE_KEY);
    else await AsyncStorage.setItem(LINK_OPENING_STORAGE_KEY, value);
  } catch {
    // Keep the selected preference active for the current screen session.
  }
}

export async function openExternalLink(url: string) {
  if ((await readLinkOpeningPreference()) === 'embedded') {
    await WebBrowser.openBrowserAsync(url);
  } else {
    await Linking.openURL(url);
  }
}
