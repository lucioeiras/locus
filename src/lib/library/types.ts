/**
 * On-disk schema for library items.
 *
 * Every item is a single `<id>.json` file at the root of the library folder.
 * Local images live in `images/` and are referenced by a path *relative to the
 * library root* (e.g. `"images/abc.jpg"`). Remote URLs (`https://…`) and
 * `data:` URIs are also accepted, so an item can be saved before its assets
 * are downloaded.
 *
 * Keep this file free of React Native imports.
 */

export const SCHEMA_VERSION = 1 as const;

/** Reading, watching, or playing progress for trackable library items. */
export const MEDIA_PROGRESS_STATUSES = ['want', 'in-progress', 'completed', 'abandoned'] as const;
export type MediaProgressStatus = (typeof MEDIA_PROGRESS_STATUSES)[number];

/** Relative path inside the library (`images/foo.jpg`) or a remote/data URI. */
export type ImageRef = string;

/** Relative path inside the library (`pdfs/foo.pdf`) or a remote/data URI. */
export type PdfRef = string;

type BaseItem = {
  /** Stable unique id. Should match the file name (`<id>.json`). */
  id: string;
  /** Schema version, for future migrations. */
  version: typeof SCHEMA_VERSION;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  autoTags?: string[];
  /** User-selected, bidirectional relationships with other cards. */
  relatedItemIds?: string[];
  /** ISO-8601 timestamp set when this card is pinned to the board. */
  pinnedAt?: string;
  /** ISO timestamp set when the card was archived. */
  archivedAt?: string;
  note?: string;
};

/** A personal review score from 0.5 to 7, in half-star increments. */
export type MediaReview = {
  rating: number;
  comments?: string;
};

export type NoteItem = BaseItem & {
  type: 'note';
  text: string;
  title?: string;
  linkedItemId?: string;
};
export type QuoteItem = BaseItem & {
  type: 'quote';
  text: string;
  title?: string;
  author?: string;
  linkedItemId?: string;
};
export type ImageItem = BaseItem & {
  type: 'image';
  image: ImageRef;
  /** Additional images in this card, including `image` as the first entry. */
  images?: ImageRef[];
  title?: string;
  note?: string;
};
export type PdfItem = BaseItem & {
  type: 'pdf';
  pdf: PdfRef;
  originalFileName?: string;
  fileSize?: number;
  title?: string;
  note?: string;
};
export type VideoItem = BaseItem & {
  type: 'video';
  video: string;
  originalFileName?: string;
  fileSize?: number;
  title?: string;
};
export type AudioItem = BaseItem & {
  type: 'audio';
  audio: string;
  durationMs?: number;
  waveform?: number[];
  transcript?: string;
  title?: string;
};

export type LinkItem = BaseItem & {
  type: 'link';
  url: string;
  siteTitle: string;
  description: string;
  favicon: ImageRef;
  title?: string;
};

export type ArticleItem = BaseItem & {
  type: 'article';
  /** ISO timestamp of the current completion; absent for legacy cards. */
  completedAt?: string;
  progressStatus?: Exclude<MediaProgressStatus, 'abandoned'>;
  url: string;
  title: string;
  origin: string;
  thumbnail: ImageRef;
};

export type YouTubeItem = BaseItem & {
  type: 'youtube';
  /** ISO timestamp of the current completion; absent for legacy cards. */
  completedAt?: string;
  progressStatus?: Exclude<MediaProgressStatus, 'abandoned'>;
  url: string;
  title: string;
  thumbnail: ImageRef;
};

export type TikTokItem = BaseItem & {
  type: 'tiktok';
  url: string;
  title: string;
  thumbnail: ImageRef;
};

export type TweetVideo = {
  url: string;
  thumbnail?: ImageRef;
  width?: number;
  height?: number;
  aspectRatio?: number;
};

export type TweetItem = BaseItem & {
  type: 'tweet';
  url: string;
  author: string;
  avatar: ImageRef;
  text: string;
  images?: ImageRef[];
  video?: TweetVideo;
};

export type RedditItem = BaseItem & {
  type: 'reddit';
  url: string;
  subreddit: string;
  subredditAvatar: ImageRef;
  title: string;
  text?: string;
  image?: ImageRef;
};

export type BookItem = BaseItem & {
  type: 'book';
  review?: MediaReview;
  /** ISO timestamp of the current completion; absent for legacy cards. */
  completedAt?: string;
  progressStatus?: MediaProgressStatus;
  isbn: string;
  title: string;
  authors: string[];
  cover?: ImageRef;
  coverAspectRatio?: number;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  readingLogs?: BookReadingLog[];
  url?: string;
};

export type BookReadingLog = {
  id: string;
  /** Local calendar date in YYYY-MM-DD format. */
  date: string;
  page: number;
  createdAt: string;
  noteId?: string;
};

export type MusicItem = BaseItem & {
  type: 'music';
  musicKind?: 'song' | 'album';
  title: string;
  artist: string;
  album?: string;
  cover: ImageRef;
  previewUrl?: string;
  externalUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  genre?: string;
};

export type MovieItem = BaseItem & {
  type: 'movie';
  review?: MediaReview;
  /** ISO timestamp of the current completion; absent for legacy cards. */
  completedAt?: string;
  progressStatus?: MediaProgressStatus;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  poster: ImageRef;
  backdrop?: ImageRef;
  releaseDate?: string;
  releaseYear?: string;
  overview?: string;
  voteAverage?: number;
  genres?: string[];
  director?: string;
  runtime?: number;
  cast?: {
    id: number;
    name: string;
    character?: string;
    profilePath?: string;
  }[];
};

export type TvShowSeason = {
  tmdbId?: number;
  seasonNumber: number;
  name: string;
  poster?: ImageRef;
  overview?: string;
  airDate?: string;
  episodeCount?: number;
  progressStatus: MediaProgressStatus;
  completedAt?: string;
  review?: { rating?: number; comments?: string };
};

export type TvShowItem = BaseItem & {
  type: 'tvshow';
  completedAt?: string;
  progressStatus?: MediaProgressStatus;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  poster: ImageRef;
  backdrop?: ImageRef;
  firstAirDate?: string;
  releaseYear?: string;
  overview?: string;
  voteAverage?: number;
  genres?: string[];
  seasons: TvShowSeason[];
};

export type GamePlayLog = {
  id: string;
  /** Local calendar date in YYYY-MM-DD format. */
  date: string;
  createdAt: string;
  noteId?: string;
};

export type GameItem = BaseItem & {
  type: 'game';
  review?: MediaReview;
  /** ISO timestamp of the current completion; absent for legacy cards. */
  completedAt?: string;
  progressStatus?: MediaProgressStatus;
  playLogs?: GamePlayLog[];
  rawgId?: number;
  title: string;
  cover: ImageRef;
  platforms?: string[];
  genres?: string[];
  released?: string;
  releaseYear?: string;
  rating?: number;
  metacritic?: number;
  description?: string;
  developers?: string[];
  publishers?: string[];
  esrbRating?: string;
  website?: string;
};

export type LibraryItem =
  | NoteItem
  | QuoteItem
  | ImageItem
  | PdfItem
  | VideoItem
  | AudioItem
  | LinkItem
  | ArticleItem
  | YouTubeItem
  | TikTokItem
  | TweetItem
  | RedditItem
  | BookItem
  | MusicItem
  | MovieItem
  | TvShowItem
  | GameItem;

export type LibraryItemType = LibraryItem['type'];

export const ITEM_TYPES: readonly LibraryItemType[] = [
  'note',
  'quote',
  'audio',
  'image',
  'video',
  'pdf',
  'link',
  'article',
  'youtube',
  'tiktok',
  'tweet',
  'reddit',
  'book',
  'music',
  'movie',
  'tvshow',
  'game',
];

/** Name of the sub-folder holding local image assets. */
export const IMAGES_DIR = 'images';

/** Name of the sub-folder holding local PDF assets. */
export const PDFS_DIR = 'pdfs';
export const VIDEOS_DIR = 'videos';
export const AUDIOS_DIR = 'audios';
