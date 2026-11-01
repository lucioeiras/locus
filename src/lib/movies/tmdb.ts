import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveLocale } from '@/lib/i18n/locale';

export const STORAGE_KEY_TMDB_API_KEY = '@locus_tmdb_api_key';

export type TmdbMovieResult = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  genre_ids?: number[];
};

export type TmdbMovieDetails = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  runtime?: number;
  genres?: { id: number; name: string }[];
  tagline?: string;
  credits?: {
    cast?: {
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }[];
    crew?: { id: number; name: string; job?: string; department?: string }[];
  };
};

export type TmdbTvShowResult = {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
};

export type TmdbTvShowDetails = TmdbTvShowResult & {
  genres?: { id: number; name: string }[];
  seasons?: {
    id: number;
    season_number: number;
    name: string;
    poster_path: string | null;
    overview: string;
    air_date: string | null;
    episode_count: number;
  }[];
};

export type TmdbKeyInfo = {
  key: string | null;
  source: 'env' | 'custom' | 'none';
};

/**
 * Returns the effective TMDB API key and its source ('custom', 'env', or 'none').
 */
export async function getTmdbKeyInfo(): Promise<TmdbKeyInfo> {
  try {
    const customKey = await AsyncStorage.getItem(STORAGE_KEY_TMDB_API_KEY);
    if (customKey && customKey.trim()) {
      return { key: customKey.trim(), source: 'custom' };
    }
  } catch (e) {
    console.warn('Failed to read TMDB key from storage', e);
  }

  const envKey = process.env.EXPO_PUBLIC_TMDB_API_KEY;
  if (envKey && envKey.trim()) {
    return { key: envKey.trim(), source: 'env' };
  }

  return { key: null, source: 'none' };
}

/**
 * Returns the effective TMDB API key if set.
 */
export async function getTmdbApiKey(): Promise<string | null> {
  const info = await getTmdbKeyInfo();
  return info.key;
}

/**
 * Persists or clears a custom TMDB API key in AsyncStorage.
 */
export async function setTmdbApiKey(key: string | null): Promise<void> {
  try {
    if (!key || !key.trim()) {
      await AsyncStorage.removeItem(STORAGE_KEY_TMDB_API_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY_TMDB_API_KEY, key.trim());
    }
  } catch (e) {
    console.warn('Failed to save TMDB key to storage', e);
    throw e;
  }
}

/**
 * Formats full URL for TMDB movie poster.
 */
export function getPosterUrl(
  path?: string | null,
  size: 'w185' | 'w342' | 'w500' | 'original' = 'w500'
): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Formats full URL for TMDB movie backdrop.
 */
export function getBackdropUrl(
  path?: string | null,
  size: 'w780' | 'w1280' | 'original' = 'w780'
): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Formats a TMDB profile image URL for a cast member. */
export function getProfileUrl(path?: string | null, size = 'w185'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Extracts 4-digit release year from ISO release date string (YYYY-MM-DD).
 */
export function getReleaseYear(releaseDate?: string): string {
  if (!releaseDate) return '';
  const match = releaseDate.match(/^(\d{4})/);
  return match ? match[1] : '';
}

function buildHeadersAndUrl(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>
): { url: string; headers: Record<string, string> } {
  const isBearer = apiKey.startsWith('ey') || apiKey.length > 50;
  const urlObj = new URL(`https://api.themoviedb.org/3${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (isBearer) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    urlObj.searchParams.set('api_key', apiKey);
  }

  return { url: urlObj.toString(), headers };
}

/**
 * Searches TMDB for movies matching a query string.
 */
export async function searchTmdbMovies(
  query: string,
  language = getActiveLocale()
): Promise<TmdbMovieResult[]> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) {
    throw new Error('TMDB API key is not configured.');
  }

  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const { url, headers } = buildHeadersAndUrl('/search/movie', apiKey, {
    query: cleanQuery,
    include_adult: 'false',
    language,
    page: '1',
  });

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid or unauthorized TMDB API key (401).');
    }
    throw new Error(`Failed to search TMDB: HTTP ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

export async function searchTmdbTvShows(
  query: string,
  language = getActiveLocale()
): Promise<TmdbTvShowResult[]> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) throw new Error('TMDB API key is not configured.');
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  const { url, headers } = buildHeadersAndUrl('/search/tv', apiKey, {
    query: cleanQuery,
    include_adult: 'false',
    language,
    page: '1',
  });
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid or unauthorized TMDB API key (401).');
    throw new Error(`Failed to search TMDB: HTTP ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

export async function getTmdbTvShowDetails(
  tmdbId: number,
  language = getActiveLocale()
): Promise<TmdbTvShowDetails> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) throw new Error('TMDB API key is not configured.');
  const { url, headers } = buildHeadersAndUrl(`/tv/${tmdbId}`, apiKey, { language });
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid or unauthorized TMDB API key (401).');
    throw new Error(`Failed to fetch TV show details: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Fetches full details and credits for a specific TMDB movie ID.
 */
export async function getTmdbMovieDetails(
  tmdbId: number,
  language = getActiveLocale()
): Promise<TmdbMovieDetails> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) {
    throw new Error('TMDB API key is not configured.');
  }

  const { url, headers } = buildHeadersAndUrl(`/movie/${tmdbId}`, apiKey, {
    append_to_response: 'credits',
    language,
  });

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid or unauthorized TMDB API key (401).');
    }
    throw new Error(`Failed to fetch movie details: HTTP ${response.status}`);
  }

  return response.json();
}
