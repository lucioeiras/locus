import { decodeHTML } from 'entities';
import { TRACKABLE_TYPES, validDate, parseDayKey } from './activity';
import {
  ITEM_TYPES,
  MEDIA_PROGRESS_STATUSES,
  type LibraryItem,
  type LibraryItemType,
} from './types';
import { parseAudioWaveform } from './audioWaveform';
import { normalizeRelatedIds } from './related';
import { ARCHIVED_TAG } from './archive';

/**
 * Lightweight runtime validation for item JSON. Files on disk can be edited by
 * hand or synced from other devices, so never trust their shape.
 *
 * Returns the item or throws an Error describing what is wrong.
 */
export function parseItem(raw: unknown): LibraryItem {
  if (!isObject(raw)) throw new Error('not a JSON object');

  const { id, type, createdAt } = raw;
  if (typeof id !== 'string' || !id) throw new Error('missing "id"');
  if (typeof type !== 'string' || !ITEM_TYPES.includes(type as LibraryItemType)) {
    throw new Error(`unknown "type": ${String(type)}`);
  }
  if (typeof createdAt !== 'string') throw new Error('missing "createdAt"');

  const required = REQUIRED_FIELDS[type as LibraryItemType];
  for (const field of required) {
    if (typeof raw[field] !== 'string' || !raw[field]) {
      throw new Error(`"${type}" item is missing "${field}"`);
    }
  }

  const item: Record<string, unknown> = {
    version: 1,
    updatedAt: createdAt,
    ...raw,
  };

  if (
    !TRACKABLE_TYPES.includes(type as (typeof TRACKABLE_TYPES)[number]) ||
    item.progressStatus !== 'completed' ||
    typeof item.completedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(item.completedAt) ||
    !validDate(item.completedAt)
  )
    delete item.completedAt;

  const relatedIds = normalizeRelatedIds(item.relatedItemIds, id);
  if (relatedIds.length) item.relatedItemIds = relatedIds;
  else delete item.relatedItemIds;

  if (typeof item.title === 'string') {
    item.title = decodeHTML(item.title);
  }
  if (typeof item.siteTitle === 'string') {
    item.siteTitle = decodeHTML(item.siteTitle);
  }
  if (typeof item.description === 'string') {
    item.description = decodeHTML(item.description);
  }
  if (typeof item.origin === 'string') {
    item.origin = decodeHTML(item.origin);
  }
  if (typeof item.text === 'string') {
    item.text = decodeHTML(item.text);
  }
  if (typeof item.note === 'string') {
    item.note = decodeHTML(item.note);
  }
  if (typeof item.pinnedAt !== 'string' || !validDate(item.pinnedAt)) {
    delete item.pinnedAt;
  }
  if (typeof item.archivedAt !== 'string' || !validDate(item.archivedAt)) {
    delete item.archivedAt;
    if (Array.isArray(item.tags)) {
      const tags = item.tags.filter((tag) => tag !== ARCHIVED_TAG);
      if (tags.length) item.tags = tags;
      else delete item.tags;
    }
  } else {
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => tag !== ARCHIVED_TAG) : [];
    item.tags = [...tags, ARCHIVED_TAG];
  }
  if (item.type === 'note' || item.type === 'quote') {
    if (typeof item.linkedItemId !== 'string' || !item.linkedItemId) {
      delete item.linkedItemId;
    }
  }
  if (item.type === 'tiktok') {
    delete item.progressStatus;
  }
  if (item.type === 'image') {
    if (Array.isArray(item.images)) {
      const images = item.images
        .filter((image): image is string => typeof image === 'string' && !!image)
        .slice(0, 10);
      if (images.length > 1) item.images = images;
      else delete item.images;
    } else {
      delete item.images;
    }
  }
  if (item.type === 'quote') {
    if (typeof item.author === 'string') {
      item.author = decodeHTML(item.author);
    } else {
      delete item.author;
    }
  }
  if (item.type === 'book') {
    if (Array.isArray(item.authors)) {
      item.authors = item.authors.map((a) => (typeof a === 'string' ? decodeHTML(a) : String(a)));
    } else {
      item.authors = [];
    }
    if (typeof item.publisher === 'string') {
      item.publisher = decodeHTML(item.publisher);
    }
    item.readingLogs = Array.isArray(item.readingLogs)
      ? item.readingLogs.filter(
          (log): log is Record<string, unknown> =>
            isObject(log) &&
            typeof log.id === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(String(log.date)) &&
            Number.isInteger(log.page) &&
            (log.page as number) >= 0 &&
            typeof log.createdAt === 'string' &&
            (log.noteId === undefined || typeof log.noteId === 'string')
        )
      : [];
  }
  if (item.type === 'game') {
    item.playLogs = Array.isArray(item.playLogs)
      ? item.playLogs.filter(
          (log) =>
            isObject(log) &&
            typeof log.id === 'string' &&
            !!log.id.trim() &&
            !!parseDayKey(log.date) &&
            typeof log.createdAt === 'string' &&
            !!validDate(log.createdAt) &&
            (log.noteId === undefined || (typeof log.noteId === 'string' && !!log.noteId.trim()))
        )
      : [];
  }
  if (item.type === 'music') {
    if (typeof item.artist === 'string') {
      item.artist = decodeHTML(item.artist);
    }
    if (typeof item.album === 'string') {
      item.album = decodeHTML(item.album);
    }
    if (typeof item.genre === 'string') {
      item.genre = decodeHTML(item.genre);
    }
  }
  if (item.type === 'movie') {
    if (typeof item.originalTitle === 'string') {
      item.originalTitle = decodeHTML(item.originalTitle);
    }
    if (typeof item.overview === 'string') {
      item.overview = decodeHTML(item.overview);
    }
    if (typeof item.director === 'string') {
      item.director = decodeHTML(item.director);
    }
    if (Array.isArray(item.genres)) {
      item.genres = item.genres.map((g) => (typeof g === 'string' ? decodeHTML(g) : String(g)));
    }
    if (Array.isArray(item.cast)) {
      item.cast = item.cast
        .filter((person): person is Record<string, unknown> => isObject(person))
        .map((person) => ({
          ...person,
          name: typeof person.name === 'string' ? decodeHTML(person.name) : '',
          ...(typeof person.character === 'string'
            ? { character: decodeHTML(person.character) }
            : {}),
        }));
    }
  }
  if (item.type === 'tvshow') {
    if (typeof item.originalTitle === 'string') item.originalTitle = decodeHTML(item.originalTitle);
    if (typeof item.overview === 'string') item.overview = decodeHTML(item.overview);
    if (Array.isArray(item.genres)) {
      item.genres = item.genres.map((genre) =>
        typeof genre === 'string' ? decodeHTML(genre) : String(genre)
      );
    }
    item.seasons = Array.isArray(item.seasons)
      ? item.seasons
          .filter(
            (season): season is Record<string, unknown> =>
              isObject(season) &&
              Number.isInteger(season.seasonNumber) &&
              typeof season.name === 'string'
          )
          .map((season) => ({
            ...Object.fromEntries(Object.entries(season).filter(([key]) => key !== 'review')),
            name: decodeHTML(season.name as string),
            progressStatus: MEDIA_PROGRESS_STATUSES.includes(
              season.progressStatus as (typeof MEDIA_PROGRESS_STATUSES)[number]
            )
              ? season.progressStatus
              : 'want',
            ...(typeof season.overview === 'string'
              ? { overview: decodeHTML(season.overview) }
              : {}),
            ...(season.review &&
            isObject(season.review) &&
            (typeof season.review.rating === 'number' || typeof season.review.comments === 'string')
              ? {
                  review: {
                    ...(typeof season.review.rating === 'number'
                      ? { rating: season.review.rating }
                      : {}),
                    ...(typeof season.review.comments === 'string'
                      ? { comments: decodeHTML(season.review.comments) }
                      : {}),
                  },
                }
              : {}),
          }))
      : [];
  }
  if (item.type === 'game') {
    if (typeof item.description === 'string') {
      item.description = decodeHTML(item.description);
    }
    if (Array.isArray(item.platforms)) {
      item.platforms = item.platforms.map((p) =>
        typeof p === 'string' ? decodeHTML(p) : String(p)
      );
    }
    if (Array.isArray(item.genres)) {
      item.genres = item.genres.map((g) => (typeof g === 'string' ? decodeHTML(g) : String(g)));
    }
    if (Array.isArray(item.developers)) {
      item.developers = item.developers.map((d) =>
        typeof d === 'string' ? decodeHTML(d) : String(d)
      );
    }
    if (Array.isArray(item.publishers)) {
      item.publishers = item.publishers.map((p) =>
        typeof p === 'string' ? decodeHTML(p) : String(p)
      );
    }
  }
  if (item.type === 'audio') {
    const waveform = parseAudioWaveform(item.waveform);
    if (waveform) item.waveform = waveform;
    else delete item.waveform;
    if (typeof item.transcript === 'string') {
      item.transcript = decodeHTML(item.transcript);
    } else {
      delete item.transcript;
    }
  }

  return item as unknown as LibraryItem;
}

const REQUIRED_FIELDS: Record<LibraryItemType, string[]> = {
  note: ['text'],
  quote: ['text'],
  image: ['image'],
  pdf: ['pdf'],
  video: ['video'],
  audio: ['audio'],
  link: ['url', 'siteTitle', 'favicon'],
  article: ['url', 'title', 'thumbnail'],
  youtube: ['url', 'title', 'thumbnail'],
  tiktok: ['url', 'title', 'thumbnail'],
  tweet: ['author', 'avatar', 'text'],
  reddit: ['subreddit', 'subredditAvatar', 'title'],
  book: ['isbn', 'title'],
  music: ['title', 'artist', 'cover'],
  movie: ['title', 'poster'],
  tvshow: ['title', 'poster'],
  game: ['title', 'cover'],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
