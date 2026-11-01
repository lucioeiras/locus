import type { MusicMetadata } from './itunes';

type LyricsRecord = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

class LyricsRequestTimeoutError extends Error {
  constructor() {
    super('The lyrics service took too long to respond. Please try again.');
    this.name = 'LyricsRequestTimeoutError';
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function lyricsText(record: LyricsRecord): string | null {
  if (record.instrumental) return null;
  const text =
    record.plainLyrics || record.syncedLyrics?.replace(/^\[\d{2}:\d{2}(?:\.\d+)?\]\s*/gm, '');
  return text?.trim() || null;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Lrclib-Client': 'Locus/1.0 (https://github.com/lucioeiras)',
      },
    });

    if (response.status === 404) return null;
    if (response.status === 429 || response.status === 503) {
      throw new Error('Lyrics are temporarily unavailable. Please try again later.');
    }
    if (!response.ok) throw new Error('Could not load lyrics. Please try again.');
    return await response.json();
  } catch (error) {
    if (timedOut) throw new LyricsRequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** Returns null when LRCLIB has no lyrics for this iTunes song. */
export async function getSongLyrics(
  song: MusicMetadata,
  signal?: AbortSignal
): Promise<string | null> {
  // Search by title and artist first, which covers the common case without
  // requiring LRCLIB's exact-signature lookup.
  const search = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
  let results: LyricsRecord[] | null = null;
  try {
    const response = await getJson(`https://lrclib.net/api/search?${search}`, signal);
    results = Array.isArray(response) ? (response as LyricsRecord[]) : null;
  } catch (error) {
    if (signal?.aborted || !(error instanceof LyricsRequestTimeoutError)) throw error;
  }

  const match = results?.find((record) => {
    if (normalize(record.trackName || '') !== normalize(song.title)) return false;
    const artist = normalize(record.artistName || '');
    const requestedArtist = normalize(song.artist);
    if (artist !== requestedArtist && !artist.includes(requestedArtist)) return false;
    if (song.durationMs && typeof record.duration === 'number') {
      return Math.abs(record.duration - song.durationMs / 1000) <= 3;
    }
    return true;
  });
  const searchedLyrics = match ? lyricsText(match) : null;
  if (searchedLyrics) return searchedLyrics;

  const params = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
  if (song.album) params.set('album_name', song.album);
  if (song.durationMs) {
    const seconds = Math.round(song.durationMs / 1000);
    if (seconds >= 1 && seconds <= 3600) params.set('duration', String(seconds));
  }

  try {
    const exact = (await getJson(
      `https://lrclib.net/api/get?${params}`,
      signal
    )) as LyricsRecord | null;
    return exact ? lyricsText(exact) : null;
  } catch (error) {
    if (signal?.aborted || !(error instanceof LyricsRequestTimeoutError)) throw error;
    return null;
  }
}
