import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { parseItem } from './parse';
import { TRACKABLE_TYPES } from './activity';
import { normalizeRelatedIds } from './related';
import { parseAudioWaveform } from './audioWaveform';
import { isQuoteText } from './quotes';
import { resolveUrlMetadata, type ResolvedMetadata } from './metadata';
import {
  clearSourceCache,
  getAllCachedItems,
  getCachedMtimes,
  removeCachedItems,
  upsertCachedItems,
} from './cache';
import {
  IMAGES_DIR,
  PDFS_DIR,
  VIDEOS_DIR,
  AUDIOS_DIR,
  SCHEMA_VERSION,
  type ArticleItem,
  type BookItem,
  type GameItem,
  type ImageItem,
  type ImageRef,
  type LibraryItem,
  type LinkItem,
  type MovieItem,
  type TvShowItem,
  type MusicItem,
  type NoteItem,
  type PdfItem,
  type PdfRef,
  type VideoItem,
  type AudioItem,
  type QuoteItem,
  type RedditItem,
  type TikTokItem,
  type TweetItem,
  type YouTubeItem,
} from './types';

// The native module won't exist if running in Expo Go.
let LocusLibraryAccess: {
  bookmarkFolder: (uri: string) => string | null;
  resolveBookmark: (base64: string) => string | null;
} | null = null;

try {
  LocusLibraryAccess =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../modules/locus-library-access/src/LocusLibraryAccessModule').default;
} catch {
  // Fallback for environments without custom native modules
}

/**
 * Where the library is read from.
 *
 * - `local`: `<App Documents>/Library`. With `enableFileSharing` this shows up in
 *   the Files app under "On My iPhone › Locus" and in Finder when the phone is
 *   plugged in, so you can drop files in by hand.
 * - `folder`: any folder the user picked with the system document picker,
 *   including folders inside iCloud Drive. iOS grants security-scoped access for
 *   the current session only (see README notes on persisting it).
 */
export type LibrarySource =
  | { kind: 'local'; name?: string }
  | { kind: 'folder'; uri: string; bookmark?: string; name?: string };

export type SavedFolder = {
  id: string;
  name: string;
  source: LibrarySource;
  lastOpenedAt: number;
};

export const LOCAL_LIBRARY_NAME = 'Library';

export function getFolderDisplayName(source: LibrarySource): string {
  if (source.name) return source.name;
  if (source.kind === 'local') return LOCAL_LIBRARY_NAME;
  try {
    const cleaned = source.uri.replace(/\/+$/, '');
    const segment = cleaned.split('/').pop();
    if (segment) return decodeURIComponent(segment);
  } catch {
    // fallback
  }
  return 'Folder';
}

export function getLibraryDirectory(source: LibrarySource): Directory {
  return source.kind === 'local'
    ? new Directory(Paths.document, LOCAL_LIBRARY_NAME)
    : new Directory(source.uri);
}

export function getSourceId(source: LibrarySource): string {
  return source.kind === 'local' ? 'local' : source.uri;
}

const STORAGE_KEY = 'locus:librarySource';
const RECENT_FOLDERS_KEY = 'locus:recentFolders';
const FOLDERS_FILE_NAME = '.locus-folders.json';
const LEGACY_FOLDERS_FILE_NAME = '.astera-folders.json';
const FOLDERS_SCHEMA_VERSION = 1;

function getLegacyFoldersKey(source: LibrarySource): string {
  return `locus:folders:${getSourceId(source)}`;
}

function parseFolderNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((name): name is string => typeof name === 'string');
}

/**
 * Loads user-created folder names from the library directory. Existing names
 * stored in AsyncStorage are migrated on first read so they become part of the
 * same portable library as the item JSON files.
 */
export async function getLibraryFolders(source: LibrarySource): Promise<string[]> {
  const root = getLibraryDirectory(source);
  const foldersFile = new File(root, FOLDERS_FILE_NAME);
  const legacyFoldersFile = new File(root, LEGACY_FOLDERS_FILE_NAME);
  const metadataFile = foldersFile.exists ? foldersFile : legacyFoldersFile;

  if (metadataFile.exists) {
    const parsed: unknown = JSON.parse(await metadataFile.text());
    if (
      parsed &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      parsed.version === FOLDERS_SCHEMA_VERSION &&
      'folders' in parsed
    ) {
      const folders = parseFolderNames(parsed.folders);
      if (metadataFile === legacyFoldersFile) await saveLibraryFolders(source, folders);
      return folders;
    }
    throw new Error('The folder metadata file has an unsupported format.');
  }

  let legacyFolders: string[] = [];
  try {
    const legacy = await AsyncStorage.getItem(getLegacyFoldersKey(source));
    legacyFolders = parseFolderNames(legacy ? JSON.parse(legacy) : []);
  } catch (error) {
    console.warn('Failed to read legacy folder metadata', error);
  }

  if (legacyFolders.length > 0) {
    await saveLibraryFolders(source, legacyFolders);
  }
  return legacyFolders;
}

/** Saves user-created folder names next to the library's item JSON files. */
export async function saveLibraryFolders(source: LibrarySource, names: string[]): Promise<void> {
  const root = getLibraryDirectory(source);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });

  const foldersFile = new File(root, FOLDERS_FILE_NAME);
  if (!foldersFile.exists) {
    foldersFile.create({ intermediates: true, overwrite: true });
  }
  foldersFile.write(JSON.stringify({ version: FOLDERS_SCHEMA_VERSION, folders: names }, null, 2));
}

export const DEFAULT_LOCAL_FOLDER: SavedFolder = {
  id: 'local',
  name: 'App Library',
  source: { kind: 'local', name: 'App Library' },
  lastOpenedAt: 0,
};

export async function getSavedLibrarySource(): Promise<LibrarySource | null> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed: LibrarySource = JSON.parse(saved);
    if (parsed.kind === 'local') return { kind: 'local', name: parsed.name || 'App Library' };

    if (parsed.kind === 'folder') {
      if (parsed.bookmark && LocusLibraryAccess) {
        const uri = LocusLibraryAccess.resolveBookmark(parsed.bookmark);
        if (uri) {
          return { kind: 'folder', uri, bookmark: parsed.bookmark, name: parsed.name };
        }
      }
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to load library source', e);
  }
  return null;
}

export async function saveLibrarySource(source: LibrarySource) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(source));
  } catch (e) {
    console.warn('Failed to save library source', e);
  }
}

export function resolveFolderSource(source: LibrarySource): LibrarySource {
  if (source.kind === 'folder' && source.bookmark && LocusLibraryAccess) {
    try {
      const uri = LocusLibraryAccess.resolveBookmark(source.bookmark);
      if (uri) {
        return { ...source, uri };
      }
    } catch (e) {
      console.warn('Failed to resolve bookmark', e);
    }
  }
  return source;
}

export async function getRecentFolders(): Promise<SavedFolder[]> {
  try {
    const saved = await AsyncStorage.getItem(RECENT_FOLDERS_KEY);
    if (!saved) {
      const lastSource = await getSavedLibrarySource();
      if (lastSource?.kind === 'folder') {
        const initial: SavedFolder[] = [
          {
            id: lastSource.uri,
            name: getFolderDisplayName(lastSource),
            source: lastSource,
            lastOpenedAt: Date.now(),
          },
          DEFAULT_LOCAL_FOLDER,
        ];
        await AsyncStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(initial));
        return initial;
      }
      return [DEFAULT_LOCAL_FOLDER];
    }
    const parsed: SavedFolder[] = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [DEFAULT_LOCAL_FOLDER];

    if (!parsed.some((f) => f.id === 'local' || f.source.kind === 'local')) {
      parsed.push(DEFAULT_LOCAL_FOLDER);
    }
    return parsed;
  } catch (e) {
    console.warn('Failed to load recent folders', e);
    return [DEFAULT_LOCAL_FOLDER];
  }
}

export async function saveRecentFolder(source: LibrarySource): Promise<SavedFolder[]> {
  try {
    const list = await getRecentFolders();
    const id = source.kind === 'local' ? 'local' : source.uri;
    const name = source.name || getFolderDisplayName(source);
    const updatedSource = { ...source, name };

    const filtered = list.filter((f) => f.id !== id);
    const entry: SavedFolder = {
      id,
      name,
      source: updatedSource,
      lastOpenedAt: Date.now(),
    };

    const nextList = [entry, ...filtered];
    await AsyncStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(nextList));
    return nextList;
  } catch (e) {
    console.warn('Failed to save recent folder', e);
    return [];
  }
}

export async function removeRecentFolder(id: string): Promise<SavedFolder[]> {
  try {
    clearSourceCache(id);
    const list = await getRecentFolders();
    const filtered = list.filter((f) => f.id !== id);
    if (!filtered.some((f) => f.id === 'local')) {
      filtered.push(DEFAULT_LOCAL_FOLDER);
    }
    await AsyncStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (e) {
    console.warn('Failed to remove recent folder', e);
    return [];
  }
}

/** Opens the system folder picker (Files / iCloud Drive). Throws if cancelled. */
export async function pickLibraryFolder(): Promise<LibrarySource> {
  const dir = await Directory.pickDirectoryAsync();
  const bookmark = LocusLibraryAccess?.bookmarkFolder(dir.uri) ?? undefined;
  const name = dir.name || getFolderDisplayName({ kind: 'folder', uri: dir.uri });
  const source: LibrarySource = { kind: 'folder', uri: dir.uri, bookmark, name };
  await saveLibrarySource(source);
  await saveRecentFolder(source);
  return source;
}

export type LoadIssue = { file: string; reason: string };

export type LoadResult = {
  items: LibraryItem[];
  /** Files that exist but could not be parsed. */
  issues: LoadIssue[];
  /** iCloud files that are not downloaded to this device yet. */
  pendingDownloads: number;
};

/**
 * Reads every `*.json` file at the root of the library folder, using an expo-sqlite
 * cache indexed by file modification time (`lastModified`).
 * Only files that are newly added or whose modification time changed are read from disk.
 * Unchanged files are served instantaneously from SQLite.
 */
export async function loadLibrary(source: LibrarySource): Promise<LoadResult> {
  const root = getLibraryDirectory(source);
  const sourceId = getSourceId(source);

  if (!root.exists) {
    if (source.kind === 'local') root.create({ intermediates: true, idempotent: true });
    removeCachedItems(sourceId, Array.from(getCachedMtimes(sourceId).keys()));
    return { items: [], issues: [], pendingDownloads: 0 };
  }

  const entries = root.list();
  let pendingDownloads = 0;
  const jsonFiles: File[] = [];

  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    // iCloud keeps not-yet-downloaded files as hidden `.name.json.icloud` placeholders.
    if (entry.name.startsWith('.') && entry.name.endsWith('.json.icloud')) {
      pendingDownloads++;
      continue;
    }
    if (entry.name.startsWith('.') || !entry.name.toLowerCase().endsWith('.json')) continue;
    jsonFiles.push(entry);
  }

  const cachedMtimes = getCachedMtimes(sourceId);
  const currentDiskIds = new Set<string>();

  type FileToRead = {
    file: File;
    id: string;
    mtime: number;
  };

  const filesToRead: FileToRead[] = [];

  for (const file of jsonFiles) {
    const fileName = file.name;
    const id = fileName.slice(0, -5); // strip .json
    currentDiskIds.add(id);

    // Get file modification time
    let mtime = 0;
    try {
      mtime =
        file.lastModified ??
        (file as unknown as { modificationTime?: number }).modificationTime ??
        0;
    } catch {
      mtime = 0;
    }

    const cachedMtime = cachedMtimes.get(id);
    if (cachedMtime === undefined || cachedMtime !== mtime) {
      filesToRead.push({ file, id, mtime });
    }
  }

  // Find files that were removed from disk and purge them from cache
  const deletedIds: string[] = [];
  for (const cachedId of cachedMtimes.keys()) {
    if (!currentDiskIds.has(cachedId)) {
      deletedIds.push(cachedId);
    }
  }
  if (deletedIds.length > 0) {
    removeCachedItems(sourceId, deletedIds);
  }

  // Read only changed / new files from disk
  const issues: LoadIssue[] = [];
  if (filesToRead.length > 0) {
    const readResults = await Promise.allSettled(
      filesToRead.map(async ({ file, id, mtime }) => {
        const rawJson = await file.text();
        const parsed = parseItem(JSON.parse(rawJson));
        return { id, mtime, rawJson, item: parsed };
      })
    );

    const entriesToUpsert: {
      id: string;
      mtime: number;
      rawJson: string;
      item: LibraryItem;
    }[] = [];

    readResults.forEach((result, i) => {
      const { file, id } = filesToRead[i];
      if (result.status === 'fulfilled') {
        entriesToUpsert.push(result.value);
      } else {
        issues.push({ file: file.name, reason: errorMessage(result.reason) });
        // If file could not be parsed, remove any stale cached entry
        removeCachedItems(sourceId, [id]);
      }
    });

    if (entriesToUpsert.length > 0) {
      upsertCachedItems(sourceId, entriesToUpsert);
    }
  }

  // Load all items from SQLite cache
  const { items: cachedItems, corruptIds } = getAllCachedItems(sourceId);
  if (corruptIds.length > 0) {
    removeCachedItems(sourceId, corruptIds);
  }

  // Resolve image references relative to this library's root
  const items = cachedItems.map((item) => resolveImages(item, root));

  return { items, issues, pendingDownloads };
}

/** Turns `images/foo.jpg` into an absolute `file://` URI; leaves URLs untouched. */
export function resolveImageRef(ref: ImageRef, root: Directory): string {
  if (/^(https?:|data:|file:)/i.test(ref)) return ref;
  const relative = ref.replace(/^\.?\//, '');
  return new File(root, relative).uri;
}

/** Turns `pdfs/foo.pdf` into an absolute `file://` URI; leaves URLs untouched. */
export function resolvePdfRef(ref: PdfRef, root: Directory): string {
  if (/^(https?:|data:|file:)/i.test(ref)) return ref;
  const relative = ref.replace(/^\.?\//, '');
  return new File(root, relative).uri;
}

export function resolveImages(item: LibraryItem, root: Directory): LibraryItem {
  const r = (ref: ImageRef) => resolveImageRef(ref, root);
  switch (item.type) {
    case 'image':
      return { ...item, image: r(item.image), images: item.images?.map(r) };
    case 'pdf':
      return { ...item, pdf: resolvePdfRef(item.pdf, root) };
    case 'video':
      return { ...item, video: resolvePdfRef(item.video, root) };
    case 'audio':
      return { ...item, audio: resolvePdfRef(item.audio, root) };
    case 'link':
      return { ...item, favicon: r(item.favicon) };
    case 'article':
    case 'youtube':
    case 'tiktok':
      return { ...item, thumbnail: r(item.thumbnail) };
    case 'tweet':
      return {
        ...item,
        avatar: r(item.avatar),
        images: item.images?.map(r),
        video: item.video
          ? {
              ...item.video,
              thumbnail: item.video.thumbnail ? r(item.video.thumbnail) : undefined,
            }
          : undefined,
      };
    case 'reddit':
      return {
        ...item,
        subredditAvatar: r(item.subredditAvatar),
        image: item.image ? r(item.image) : undefined,
      };
    case 'book':
      return {
        ...item,
        cover: item.cover ? r(item.cover) : undefined,
      };
    case 'music':
      return {
        ...item,
        cover: r(item.cover),
      };
    case 'movie':
      return {
        ...item,
        poster: r(item.poster),
        backdrop: item.backdrop ? r(item.backdrop) : undefined,
      };
    case 'tvshow':
      return {
        ...item,
        poster: r(item.poster),
        backdrop: item.backdrop ? r(item.backdrop) : undefined,
        seasons: item.seasons.map((season) => ({
          ...season,
          poster: season.poster ? r(season.poster) : undefined,
        })),
      };
    case 'game':
      return {
        ...item,
        cover: r(item.cover),
      };
    default:
      return item;
  }
}

export function getImagesDirectory(source: LibrarySource): Directory {
  return new Directory(getLibraryDirectory(source), IMAGES_DIR);
}

export function getPdfsDirectory(source: LibrarySource): Directory {
  return new Directory(getLibraryDirectory(source), PDFS_DIR);
}

export function getVideosDirectory(source: LibrarySource): Directory {
  return new Directory(getLibraryDirectory(source), VIDEOS_DIR);
}

export function getAudiosDirectory(source: LibrarySource): Directory {
  return new Directory(getLibraryDirectory(source), AUDIOS_DIR);
}

export type PickedAudioAsset = {
  uri: string;
  durationMs?: number;
  fileName?: string;
  waveform?: number[];
};

export async function addAudioToLibrary(
  source: LibrarySource,
  asset: PickedAudioAsset,
  options?: { title?: string; note?: string; tags?: string[]; autoTags?: string[] }
): Promise<AudioItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  const dir = getAudiosDirectory(source);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const id = generateId();
  const extension = (asset.fileName ?? asset.uri.split(/[?#]/)[0].split('/').pop() ?? '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const fileName = `${id}.${extension || 'm4a'}`;
  const destination = new File(dir, fileName);
  const sourceFile = new File(asset.uri);
  try {
    await sourceFile.copy(destination, { overwrite: true });
  } catch {
    const buffer = await sourceFile.arrayBuffer();
    destination.create({ intermediates: true, overwrite: true });
    destination.write(new Uint8Array(buffer));
  }
  const waveform = parseAudioWaveform(asset.waveform);
  const now = new Date().toISOString();
  const item: AudioItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'audio',
    audio: `${AUDIOS_DIR}/${fileName}`,
    ...(options?.title?.trim() ? { title: options.title.trim() } : {}),
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
    ...(options?.tags?.filter(Boolean).length ? { tags: options.tags.filter(Boolean) } : {}),
    ...(options?.autoTags?.filter(Boolean).length
      ? { autoTags: options.autoTags.filter(Boolean) }
      : {}),
    ...(asset.durationMs ? { durationMs: asset.durationMs } : {}),
    ...(waveform ? { waveform } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const jsonFile = new File(root, `${id}.json`);
  jsonFile.create({ intermediates: true, overwrite: true });
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);
  upsertCachedItems(getSourceId(source), [
    { id, mtime: jsonFile.lastModified ?? Date.now(), rawJson: jsonText, item },
  ]);
  return item;
}

export type PickedVideoAsset = { uri: string; fileName?: string | null; fileSize?: number | null };

export type AddVideoOptions = {
  title?: string;
  note?: string;
  tags?: string[];
  autoTags?: string[];
};

export async function addVideoToLibrary(
  source: LibrarySource,
  asset: PickedVideoAsset,
  options?: AddVideoOptions
): Promise<VideoItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  const dir = getVideosDirectory(source);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const id = generateId();
  const ext =
    asset.fileName
      ?.split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'mp4';
  const fileName = `${id}.${ext}`;
  const destination = new File(dir, fileName);
  const sourceFile = new File(asset.uri);
  try {
    await sourceFile.copy(destination, { overwrite: true });
  } catch {
    const buffer = await sourceFile.arrayBuffer();
    destination.create({ intermediates: true, overwrite: true });
    destination.write(new Uint8Array(buffer));
  }
  const now = new Date().toISOString();
  const item: VideoItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'video',
    video: `${VIDEOS_DIR}/${fileName}`,
    ...(asset.fileName ? { originalFileName: asset.fileName } : {}),
    ...(options?.title?.trim() || asset.fileName?.replace(/\.[^.]+$/, '')
      ? { title: options?.title?.trim() || asset.fileName?.replace(/\.[^.]+$/, '') }
      : {}),
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
    ...(options?.tags?.filter(Boolean).length ? { tags: options.tags.filter(Boolean) } : {}),
    ...(options?.autoTags?.filter(Boolean).length
      ? { autoTags: options.autoTags.filter(Boolean) }
      : {}),
    ...(asset.fileSize ? { fileSize: asset.fileSize } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const jsonFile = new File(root, `${id}.json`);
  jsonFile.create({ intermediates: true, overwrite: true });
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  const mtime = jsonFile.lastModified ?? Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);
  return item;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export type PickedImageAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  assetId?: string | null;
};

export type AddImageOptions = {
  title?: string;
  note?: string;
  tags?: string[];
  autoTags?: string[];
};

/**
 * Copies a picked image into the library's `images/` folder and writes the
 * corresponding `<id>.json` metadata file to the root of the library.
 */
export async function addImageToLibrary(
  source: LibrarySource,
  asset: PickedImageAsset | PickedImageAsset[],
  options?: AddImageOptions
): Promise<ImageItem> {
  const assets = Array.isArray(asset) ? asset.slice(0, 10) : [asset];
  if (assets.length === 0) throw new Error('Select at least one image.');
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const imagesDir = getImagesDirectory(source);
  if (!imagesDir.exists) {
    imagesDir.create({ intermediates: true, idempotent: true });
  }

  const id = generateId();

  const getExtension = (asset: PickedImageAsset) => {
    let ext = 'jpg';
    if (asset.fileName && asset.fileName.includes('.')) {
      const parts = asset.fileName.split('.');
      const potentialExt = parts[parts.length - 1].toLowerCase();
      if (potentialExt && potentialExt.length <= 5 && /^[a-z0-9]+$/.test(potentialExt)) {
        ext = potentialExt;
      }
    } else if (asset.mimeType) {
      const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/heic': 'heic',
        'image/heif': 'heif',
        'image/svg+xml': 'svg',
      };
      if (mimeMap[asset.mimeType]) ext = mimeMap[asset.mimeType];
    } else if (asset.uri.includes('.')) {
      const cleanUri = asset.uri.split('?')[0];
      const parts = cleanUri.split('.');
      const potentialExt = parts[parts.length - 1].toLowerCase();
      if (potentialExt && potentialExt.length <= 5 && /^[a-z0-9]+$/.test(potentialExt)) {
        ext = potentialExt;
      }
    }
    return ext;
  };
  const relativeImagePaths: string[] = [];
  for (const [index, pickedAsset] of assets.entries()) {
    const imageFileName = `${id}${index ? `-${index + 1}` : ''}.${getExtension(pickedAsset)}`;
    const targetImageFile = new File(imagesDir, imageFileName);
    const sourceFile = new File(pickedAsset.uri);
    try {
      await sourceFile.copy(targetImageFile, { overwrite: true });
    } catch (copyError) {
      console.warn('sourceFile.copy failed, using arrayBuffer copy fallback', copyError);
      const buffer = await sourceFile.arrayBuffer();
      if (!targetImageFile.exists) {
        targetImageFile.create({ intermediates: true, overwrite: true });
      }
      targetImageFile.write(new Uint8Array(buffer));
    }
    relativeImagePaths.push(`${IMAGES_DIR}/${imageFileName}`);
  }

  const now = new Date().toISOString();
  const trimmedTitle = options?.title?.trim();
  const trimmedNote = options?.note?.trim();
  const tags = options?.tags?.filter(Boolean);
  const autoTags = options?.autoTags?.filter(Boolean);

  const item: ImageItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'image',
    image: relativeImagePaths[0],
    ...(relativeImagePaths.length > 1 ? { images: relativeImagePaths } : {}),
    ...(trimmedTitle ? { title: trimmedTitle } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(autoTags && autoTags.length > 0 ? { autoTags } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  // Update SQLite cache immediately with modification time
  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export type PickedPdfAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type AddPdfOptions = {
  title?: string;
  note?: string;
  tags?: string[];
  autoTags?: string[];
};

/**
 * Copies a picked PDF into the library's `pdfs/` folder and writes the
 * corresponding `<id>.json` metadata file to the root of the library.
 */
export async function addPdfToLibrary(
  source: LibrarySource,
  asset: PickedPdfAsset,
  options?: AddPdfOptions
): Promise<PdfItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const pdfsDir = getPdfsDirectory(source);
  if (!pdfsDir.exists) {
    pdfsDir.create({ intermediates: true, idempotent: true });
  }

  const id = generateId();

  let ext = 'pdf';
  if (asset.fileName && asset.fileName.includes('.')) {
    const parts = asset.fileName.split('.');
    const potentialExt = parts[parts.length - 1].toLowerCase();
    if (potentialExt === 'pdf') {
      ext = 'pdf';
    }
  }

  const pdfFileName = `${id}.${ext}`;
  const relativePdfPath = `${PDFS_DIR}/${pdfFileName}`;

  const sourceFile = new File(asset.uri);
  const targetPdfFile = new File(pdfsDir, pdfFileName);

  try {
    await sourceFile.copy(targetPdfFile, { overwrite: true });
  } catch (copyError) {
    console.warn('sourceFile.copy failed, using arrayBuffer copy fallback', copyError);
    const buffer = await sourceFile.arrayBuffer();
    if (!targetPdfFile.exists) {
      targetPdfFile.create({ intermediates: true, overwrite: true });
    }
    targetPdfFile.write(new Uint8Array(buffer));
  }

  const fileSize =
    typeof asset.fileSize === 'number' && asset.fileSize > 0 ? asset.fileSize : targetPdfFile.size;

  const now = new Date().toISOString();
  const trimmedTitle =
    options?.title?.trim() ||
    (asset.fileName ? asset.fileName.replace(/\.pdf$/i, '').trim() : undefined);
  const trimmedNote = options?.note?.trim();
  const tags = options?.tags?.filter(Boolean);
  const autoTags = options?.autoTags?.filter(Boolean);

  const item: PdfItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'pdf',
    pdf: relativePdfPath,
    ...(asset.fileName ? { originalFileName: asset.fileName } : {}),
    ...(fileSize > 0 ? { fileSize } : {}),
    ...(trimmedTitle ? { title: trimmedTitle } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(autoTags && autoTags.length > 0 ? { autoTags } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  // Update SQLite cache immediately with modification time
  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

/**
 * Creates a note or quote item file in the root of the library folder.
 * Automatically verifies if the text is a quote (starts and ends with ") or a note.
 */
export async function addTextItemToLibrary(
  source: LibrarySource,
  rawText: string,
  title?: string,
  options?: {
    tags?: string[];
    autoTags?: string[];
    linkedItemId?: string;
    forceNote?: boolean;
    author?: string;
  }
): Promise<NoteItem | QuoteItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const trimmed = rawText.trim();
  const isQuote = !options?.forceNote && isQuoteText(trimmed);

  const cleanText = isQuote ? trimmed.slice(1, -1).trim() : trimmed;
  const itemType: 'quote' | 'note' = isQuote ? 'quote' : 'note';

  const id = generateId();
  const now = new Date().toISOString();

  const item: NoteItem | QuoteItem = {
    id,
    version: SCHEMA_VERSION,
    type: itemType,
    text: cleanText,
    ...(title ? { title } : {}),
    ...(isQuote && options?.author?.trim() ? { author: options.author.trim() } : {}),
    ...(options?.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
    ...(options?.autoTags && options.autoTags.length > 0 ? { autoTags: options.autoTags } : {}),
    ...(options?.linkedItemId ? { linkedItemId: options.linkedItemId } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  if (itemType === 'note') {
    const markdownFile = new File(root, `${id}.md`);
    markdownFile.create({ intermediates: true, overwrite: true });
    markdownFile.write(cleanText);
  }

  // Update SQLite cache immediately with modification time
  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export type LinkUploadItem =
  LinkItem | ArticleItem | YouTubeItem | TikTokItem | RedditItem | TweetItem;

/**
 * Loads metadata for the given URL and saves it as a link, youtube, reddit,
 * tweet, or article .json item file in the root of the library folder.
 */
export async function addLinkItemToLibrary(
  source: LibrarySource,
  url: string,
  options?: {
    tags?: string[];
    autoTags?: string[];
    note?: string;
    title?: string;
    preloadedMetadata?: ResolvedMetadata;
  }
): Promise<LinkUploadItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const metadata = options?.preloadedMetadata ?? (await resolveUrlMetadata(url));
  const id = generateId();
  const now = new Date().toISOString();

  let item: LinkUploadItem;
  switch (metadata.type) {
    case 'youtube':
      item = {
        id,
        version: SCHEMA_VERSION,
        type: 'youtube',
        progressStatus: 'want',
        url: metadata.url,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        createdAt: now,
        updatedAt: now,
      };
      break;
    case 'tiktok':
      item = {
        id,
        version: SCHEMA_VERSION,
        type: 'tiktok',
        url: metadata.url,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        createdAt: now,
        updatedAt: now,
      };
      break;
    case 'reddit':
      item = {
        id,
        version: SCHEMA_VERSION,
        type: 'reddit',
        url: metadata.url,
        subreddit: metadata.subreddit,
        subredditAvatar: metadata.subredditAvatar,
        title: metadata.title,
        ...(metadata.text ? { text: metadata.text } : {}),
        ...(metadata.image ? { image: metadata.image } : {}),
        createdAt: now,
        updatedAt: now,
      };
      break;
    case 'tweet':
      item = {
        id,
        version: SCHEMA_VERSION,
        type: 'tweet',
        url: metadata.url,
        author: metadata.author,
        avatar: metadata.avatar,
        text: metadata.text,
        ...(metadata.images?.length ? { images: metadata.images } : {}),
        ...(metadata.video ? { video: metadata.video } : {}),
        createdAt: now,
        updatedAt: now,
      };
      break;
    case 'article':
      item = {
        id,
        version: SCHEMA_VERSION,
        type: 'article',
        progressStatus: 'want',
        url: metadata.url,
        title: metadata.title,
        origin: metadata.origin,
        thumbnail: metadata.thumbnail,
        createdAt: now,
        updatedAt: now,
      };
      break;
    case 'link':
      item = {
        id,
        version: SCHEMA_VERSION,
        type: 'link',
        url: metadata.url,
        siteTitle: metadata.siteTitle,
        description: metadata.description,
        favicon: metadata.favicon,
        createdAt: now,
        updatedAt: now,
      };
      break;
  }

  if (options?.tags?.length) {
    item.tags = options.tags;
  }
  if (options?.autoTags?.length) {
    item.autoTags = options.autoTags;
  }
  if (options?.note) {
    item.note = options.note;
  }
  if (options?.title) {
    if (item.type !== 'tweet') {
      item.title = options.title;
    }
  }

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  // Update SQLite cache immediately with modification time
  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export async function addBookItemToLibrary(
  source: LibrarySource,
  book: {
    isbn: string;
    title: string;
    authors: string[];
    cover?: string;
    coverAspectRatio?: number;
    description?: string;
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    url?: string;
  },
  options?: {
    tags?: string[];
    autoTags?: string[];
    note?: string;
  }
): Promise<BookItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const id = generateId();
  const now = new Date().toISOString();

  const item: BookItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'book',
    progressStatus: 'want',
    isbn: book.isbn,
    title: book.title,
    authors: book.authors,
    ...(book.cover ? { cover: book.cover } : {}),
    ...(typeof book.coverAspectRatio === 'number'
      ? { coverAspectRatio: book.coverAspectRatio }
      : {}),
    ...(book.description ? { description: book.description } : {}),
    ...(book.publisher ? { publisher: book.publisher } : {}),
    ...(book.publishedDate ? { publishedDate: book.publishedDate } : {}),
    ...(book.pageCount ? { pageCount: book.pageCount } : {}),
    ...(book.url ? { url: book.url } : {}),
    ...(options?.tags?.length ? { tags: options.tags } : {}),
    ...(options?.autoTags?.length ? { autoTags: options.autoTags } : {}),
    ...(options?.note ? { note: options.note } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export async function addMusicItemToLibrary(
  source: LibrarySource,
  music: {
    musicKind: 'song' | 'album';
    title: string;
    artist: string;
    album?: string;
    cover: string;
    previewUrl?: string;
    externalUrl?: string;
    durationMs?: number;
    releaseDate?: string;
    genre?: string;
  },
  options?: {
    tags?: string[];
    autoTags?: string[];
    note?: string;
  }
): Promise<MusicItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const id = generateId();
  const now = new Date().toISOString();

  const item: MusicItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'music',
    musicKind: music.musicKind,
    title: music.title,
    artist: music.artist,
    cover: music.cover,
    ...(music.album ? { album: music.album } : {}),
    ...(music.previewUrl ? { previewUrl: music.previewUrl } : {}),
    ...(music.externalUrl ? { externalUrl: music.externalUrl } : {}),
    ...(music.durationMs ? { durationMs: music.durationMs } : {}),
    ...(music.releaseDate ? { releaseDate: music.releaseDate } : {}),
    ...(music.genre ? { genre: music.genre } : {}),
    ...(options?.tags?.length ? { tags: options.tags } : {}),
    ...(options?.autoTags?.length ? { autoTags: options.autoTags } : {}),
    ...(options?.note ? { note: options.note } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export type AddMovieOptions = {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  poster: string;
  backdrop?: string;
  releaseDate?: string;
  releaseYear?: string;
  overview?: string;
  voteAverage?: number;
  genres?: string[];
  director?: string;
  runtime?: number;
  cast?: MovieItem['cast'];
};

export async function addMovieItemToLibrary(
  source: LibrarySource,
  movie: AddMovieOptions,
  options?: {
    tags?: string[];
    autoTags?: string[];
    note?: string;
  }
): Promise<MovieItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const id = generateId();
  const now = new Date().toISOString();

  const item: MovieItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'movie',
    progressStatus: 'want',
    tmdbId: movie.tmdbId,
    title: movie.title.trim(),
    poster: movie.poster,
    ...(movie.originalTitle ? { originalTitle: movie.originalTitle } : {}),
    ...(movie.backdrop ? { backdrop: movie.backdrop } : {}),
    ...(movie.releaseDate ? { releaseDate: movie.releaseDate } : {}),
    ...(movie.releaseYear ? { releaseYear: movie.releaseYear } : {}),
    ...(movie.overview ? { overview: movie.overview } : {}),
    ...(typeof movie.voteAverage === 'number' ? { voteAverage: movie.voteAverage } : {}),
    ...(movie.genres && movie.genres.length > 0 ? { genres: movie.genres } : {}),
    ...(movie.director ? { director: movie.director } : {}),
    ...(typeof movie.runtime === 'number' ? { runtime: movie.runtime } : {}),
    ...(movie.cast && movie.cast.length > 0 ? { cast: movie.cast } : {}),
    ...(options?.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
    ...(options?.autoTags && options.autoTags.length > 0 ? { autoTags: options.autoTags } : {}),
    ...(options?.note ? { note: options.note } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export type AddTvShowOptions = Pick<TvShowItem, 'tmdbId' | 'title' | 'poster' | 'seasons'> &
  Partial<
    Pick<
      TvShowItem,
      | 'originalTitle'
      | 'backdrop'
      | 'firstAirDate'
      | 'releaseYear'
      | 'overview'
      | 'voteAverage'
      | 'genres'
    >
  >;

export async function addTvShowItemToLibrary(
  source: LibrarySource,
  show: AddTvShowOptions,
  options?: { tags?: string[]; autoTags?: string[]; note?: string }
): Promise<TvShowItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  const id = generateId();
  const now = new Date().toISOString();
  const item: TvShowItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'tvshow',
    progressStatus: 'want',
    tmdbId: show.tmdbId,
    title: show.title.trim(),
    poster: show.poster,
    seasons: show.seasons.map((season) => ({ ...season, progressStatus: 'want' as const })),
    ...(show.originalTitle ? { originalTitle: show.originalTitle } : {}),
    ...(show.backdrop ? { backdrop: show.backdrop } : {}),
    ...(show.firstAirDate ? { firstAirDate: show.firstAirDate } : {}),
    ...(show.releaseYear ? { releaseYear: show.releaseYear } : {}),
    ...(show.overview ? { overview: show.overview } : {}),
    ...(typeof show.voteAverage === 'number' ? { voteAverage: show.voteAverage } : {}),
    ...(show.genres?.length ? { genres: show.genres } : {}),
    ...(options?.tags?.length ? { tags: options.tags } : {}),
    ...(options?.autoTags?.length ? { autoTags: options.autoTags } : {}),
    ...(options?.note ? { note: options.note } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) jsonFile.create({ intermediates: true, overwrite: true });
  jsonFile.write(JSON.stringify(item, null, 2));
  const mtime = jsonFile.lastModified ?? Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: JSON.stringify(item), item }]);
  return item;
}

export type AddGameOptions = {
  rawgId?: number;
  title: string;
  cover: string;
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

export async function addGameItemToLibrary(
  source: LibrarySource,
  game: AddGameOptions,
  options?: {
    tags?: string[];
    autoTags?: string[];
    note?: string;
  }
): Promise<GameItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    root.create({ intermediates: true, idempotent: true });
  }

  const id = generateId();
  const now = new Date().toISOString();

  const item: GameItem = {
    id,
    version: SCHEMA_VERSION,
    type: 'game',
    progressStatus: 'want',
    title: game.title.trim(),
    cover: game.cover,
    ...(typeof game.rawgId === 'number' ? { rawgId: game.rawgId } : {}),
    ...(game.platforms && game.platforms.length > 0 ? { platforms: game.platforms } : {}),
    ...(game.genres && game.genres.length > 0 ? { genres: game.genres } : {}),
    ...(game.released ? { released: game.released } : {}),
    ...(game.releaseYear ? { releaseYear: game.releaseYear } : {}),
    ...(typeof game.rating === 'number' ? { rating: game.rating } : {}),
    ...(typeof game.metacritic === 'number' ? { metacritic: game.metacritic } : {}),
    ...(game.description ? { description: game.description } : {}),
    ...(game.developers && game.developers.length > 0 ? { developers: game.developers } : {}),
    ...(game.publishers && game.publishers.length > 0 ? { publishers: game.publishers } : {}),
    ...(game.esrbRating ? { esrbRating: game.esrbRating } : {}),
    ...(game.website ? { website: game.website } : {}),
    ...(options?.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
    ...(options?.autoTags && options.autoTags.length > 0 ? { autoTags: options.autoTags } : {}),
    ...(options?.note ? { note: options.note } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const jsonFile = new File(root, `${id}.json`);
  if (!jsonFile.exists) {
    jsonFile.create({ intermediates: true, overwrite: true });
  }
  const jsonText = JSON.stringify(item, null, 2);
  jsonFile.write(jsonText);

  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  upsertCachedItems(getSourceId(source), [{ id, mtime, rawJson: jsonText, item }]);

  return item;
}

export type DeletedImageBackup = {
  fileName: string;
  bytes: Uint8Array;
};

export type DeletedPdfBackup = {
  fileName: string;
  bytes: Uint8Array;
};

export type DeletedItemBackup = {
  id: string;
  jsonText: string;
  images?: DeletedImageBackup[];
  pdfs?: DeletedPdfBackup[];
  videos?: { fileName: string; bytes: Uint8Array }[];
  audios?: { fileName: string; bytes: Uint8Array }[];
};

function extractImageRefsFromItem(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const rec = item as Record<string, unknown>;
  const refs: string[] = [];

  const add = (val: unknown) => {
    if (typeof val === 'string' && val.trim().length > 0) {
      refs.push(val.trim());
    }
  };

  add(rec.image);
  add(rec.favicon);
  add(rec.thumbnail);
  add(rec.avatar);
  add(rec.subredditAvatar);
  add(rec.cover);
  add(rec.poster);
  add(rec.backdrop);

  if (Array.isArray(rec.images)) {
    for (const img of rec.images) {
      add(img);
    }
  }

  return refs;
}

function getItemImageFileNames(
  parsed: Record<string, unknown>,
  availableImageFiles: File[],
  imagesDirUri: string
): Set<string> {
  const result = new Set<string>();
  const refs = extractImageRefsFromItem(parsed);
  const normalizedImagesDir = imagesDirUri.replace(/\/+$/, '');

  for (const ref of refs) {
    if (/^(https?:|data:)/i.test(ref)) continue;

    const clean = ref.split('?')[0].split('#')[0];

    // If it's a file URI inside imagesDir
    if (clean.startsWith('file:') && clean.startsWith(normalizedImagesDir + '/')) {
      const fileName = decodeURIComponent(clean.slice(normalizedImagesDir.length + 1));
      result.add(fileName);
      continue;
    }

    // Relative path like "images/xyz.jpg" or "./images/xyz.jpg"
    const relative = clean.replace(/^\.?\//, '');
    if (relative.startsWith(`${IMAGES_DIR}/`)) {
      const fileName = decodeURIComponent(relative.slice(IMAGES_DIR.length + 1));
      result.add(fileName);
      continue;
    }

    // Direct filename match in imagesDir
    const directMatch = availableImageFiles.find((f) => f.name === relative || f.name === clean);
    if (directMatch) {
      result.add(directMatch.name);
    }
  }

  // Check if any file in imagesDir starts with `${parsed.id}.` (e.g. `<id>.jpg`)
  if (typeof parsed.id === 'string' && parsed.id) {
    const idPrefix = `${parsed.id}.`;
    for (const f of availableImageFiles) {
      if (f.name.startsWith(idPrefix)) {
        result.add(f.name);
      }
    }
  }

  return result;
}

function extractPdfRefsFromItem(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const rec = item as Record<string, unknown>;
  const refs: string[] = [];

  if (typeof rec.pdf === 'string' && rec.pdf.trim().length > 0) {
    refs.push(rec.pdf.trim());
  }

  return refs;
}

function getItemPdfFileNames(
  parsed: Record<string, unknown>,
  availablePdfFiles: File[],
  pdfsDirUri: string
): Set<string> {
  const result = new Set<string>();
  const refs = extractPdfRefsFromItem(parsed);
  const normalizedPdfsDir = pdfsDirUri.replace(/\/+$/, '');

  for (const ref of refs) {
    if (/^(https?:|data:)/i.test(ref)) continue;

    const clean = ref.split('?')[0].split('#')[0];

    // If it's a file URI inside pdfsDir
    if (clean.startsWith('file:') && clean.startsWith(normalizedPdfsDir + '/')) {
      const fileName = decodeURIComponent(clean.slice(normalizedPdfsDir.length + 1));
      result.add(fileName);
      continue;
    }

    // Relative path like "pdfs/xyz.pdf" or "./pdfs/xyz.pdf"
    const relative = clean.replace(/^\.?\//, '');
    if (relative.startsWith(`${PDFS_DIR}/`)) {
      const fileName = decodeURIComponent(relative.slice(PDFS_DIR.length + 1));
      result.add(fileName);
      continue;
    }

    // Direct filename match in pdfsDir
    const directMatch = availablePdfFiles.find((f) => f.name === relative || f.name === clean);
    if (directMatch) {
      result.add(directMatch.name);
    }
  }

  // Check if any file in pdfsDir starts with `${parsed.id}.` (e.g. `<id>.pdf`)
  if (typeof parsed.id === 'string' && parsed.id) {
    const idPrefix = `${parsed.id}.`;
    for (const f of availablePdfFiles) {
      if (f.name.startsWith(idPrefix)) {
        result.add(f.name);
      }
    }
  }

  return result;
}

/**
 * Deletes multiple cards from the library and returns backups of their JSON contents
 * (and any deleted image/pdf files) so they can be restored if needed.
 */
export async function deleteItemsFromLibrary(
  source: LibrarySource,
  itemIds: string[]
): Promise<DeletedItemBackup[]> {
  const root = getLibraryDirectory(source);
  if (!root.exists || itemIds.length === 0) return [];

  const idSet = new Set(itemIds);
  const backups: DeletedItemBackup[] = [];
  const entries = root.list();

  const jsonFiles: File[] = [];
  for (const entry of entries) {
    if (
      entry instanceof File &&
      entry.name.toLowerCase().endsWith('.json') &&
      !entry.name.startsWith('.')
    ) {
      jsonFiles.push(entry);
    }
  }

  type ParsedEntry = {
    file: File;
    text: string;
    parsed: Record<string, unknown>;
  };

  const toDelete: ParsedEntry[] = [];
  const toRetain: ParsedEntry[] = [];

  for (const file of jsonFiles) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.id === 'string') {
        if (idSet.has(parsed.id)) {
          toDelete.push({ file, text, parsed });
        } else {
          toRetain.push({ file, text, parsed });
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }

  const imagesDir = getImagesDirectory(source);
  const availableImageFiles: File[] = [];
  const imageFileByName = new Map<string, File>();

  if (imagesDir.exists) {
    try {
      const imgEntries = imagesDir.list();
      for (const entry of imgEntries) {
        if (entry instanceof File && !entry.name.startsWith('.')) {
          availableImageFiles.push(entry);
          imageFileByName.set(entry.name, entry);
        }
      }
    } catch (e) {
      console.warn('Failed to list images directory:', e);
    }
  }

  const pdfsDir = getPdfsDirectory(source);
  const availablePdfFiles: File[] = [];
  const videosDir = getVideosDirectory(source);
  const audiosDir = getAudiosDirectory(source);
  const pdfFileByName = new Map<string, File>();
  const availableVideoFiles: File[] = [];
  const videoFileByName = new Map<string, File>();
  const availableAudioFiles: File[] = [];
  const audioFileByName = new Map<string, File>();

  if (pdfsDir.exists) {
    try {
      const pdfEntries = pdfsDir.list();
      for (const entry of pdfEntries) {
        if (entry instanceof File && !entry.name.startsWith('.')) {
          availablePdfFiles.push(entry);
          pdfFileByName.set(entry.name, entry);
        }
      }
    } catch (e) {
      console.warn('Failed to list pdfs directory:', e);
    }
  }

  if (videosDir.exists) {
    try {
      for (const entry of videosDir.list()) {
        if (entry instanceof File && !entry.name.startsWith('.')) {
          availableVideoFiles.push(entry);
          videoFileByName.set(entry.name, entry);
        }
      }
    } catch (e) {
      console.warn('Failed to list videos directory:', e);
    }
  }
  if (audiosDir.exists) {
    try {
      for (const entry of audiosDir.list()) {
        if (entry instanceof File && !entry.name.startsWith('.')) {
          availableAudioFiles.push(entry);
          audioFileByName.set(entry.name, entry);
        }
      }
    } catch (e) {
      console.warn('Failed to list audios directory:', e);
    }
  }

  // Collect file names retained by remaining items so we never delete a file used by another card
  const retainedImageFileNames = new Set<string>();
  const retainedPdfFileNames = new Set<string>();
  const retainedVideoFileNames = new Set<string>();
  const retainedAudioFileNames = new Set<string>();
  for (const item of toRetain) {
    const fileNames = getItemImageFileNames(item.parsed, availableImageFiles, imagesDir.uri);
    for (const name of fileNames) {
      retainedImageFileNames.add(name);
    }
    const pdfNames = getItemPdfFileNames(item.parsed, availablePdfFiles, pdfsDir.uri);
    for (const name of pdfNames) {
      retainedPdfFileNames.add(name);
    }
    const videoRef = typeof item.parsed.video === 'string' ? item.parsed.video : '';
    const videoName = decodeURIComponent(videoRef.split('/').pop() ?? '');
    if (videoName && availableVideoFiles.some((file) => file.name === videoName))
      retainedVideoFileNames.add(videoName);
    const audioRef = typeof item.parsed.audio === 'string' ? item.parsed.audio : '';
    const audioName = decodeURIComponent(audioRef.split('/').pop() ?? '');
    if (audioName && availableAudioFiles.some((file) => file.name === audioName))
      retainedAudioFileNames.add(audioName);
  }

  // Track already deleted/backed-up files to handle multiple cards referencing the same file
  const processedImages = new Set<string>();
  const processedPdfs = new Set<string>();
  const processedVideos = new Set<string>();
  const processedAudios = new Set<string>();

  for (const item of toDelete) {
    const itemImageFileNames = getItemImageFileNames(
      item.parsed,
      availableImageFiles,
      imagesDir.uri
    );
    const itemImageBackups: DeletedImageBackup[] = [];

    for (const fileName of itemImageFileNames) {
      if (retainedImageFileNames.has(fileName)) {
        // Still referenced by another card that is not being deleted
        continue;
      }

      const imageFile = imageFileByName.get(fileName);
      if (imageFile && imageFile.exists) {
        // Read image bytes for backup if not already processed
        if (!processedImages.has(fileName)) {
          try {
            const bytes = await imageFile.bytes();
            itemImageBackups.push({ fileName, bytes });
          } catch {
            try {
              const buffer = await imageFile.arrayBuffer();
              itemImageBackups.push({ fileName, bytes: new Uint8Array(buffer) });
            } catch (e) {
              console.warn(`Failed to read image ${fileName} for backup:`, e);
            }
          }

          // Delete the image file from images/
          try {
            imageFile.delete();
          } catch (e) {
            console.warn(`Failed to delete image file ${fileName}:`, e);
          }

          processedImages.add(fileName);
        }
      }
    }

    const itemPdfFileNames = getItemPdfFileNames(item.parsed, availablePdfFiles, pdfsDir.uri);
    const itemPdfBackups: DeletedPdfBackup[] = [];

    for (const fileName of itemPdfFileNames) {
      if (retainedPdfFileNames.has(fileName)) {
        continue;
      }

      const pdfFile = pdfFileByName.get(fileName);
      if (pdfFile && pdfFile.exists) {
        if (!processedPdfs.has(fileName)) {
          try {
            const bytes = await pdfFile.bytes();
            itemPdfBackups.push({ fileName, bytes });
          } catch {
            try {
              const buffer = await pdfFile.arrayBuffer();
              itemPdfBackups.push({ fileName, bytes: new Uint8Array(buffer) });
            } catch (e) {
              console.warn(`Failed to read pdf ${fileName} for backup:`, e);
            }
          }

          try {
            pdfFile.delete();
          } catch (e) {
            console.warn(`Failed to delete pdf file ${fileName}:`, e);
          }

          processedPdfs.add(fileName);
        }
      }
    }

    const videoRef = typeof item.parsed.video === 'string' ? item.parsed.video : '';
    const videoName = decodeURIComponent(videoRef.split('/').pop() ?? '');
    const videoBackups: { fileName: string; bytes: Uint8Array }[] = [];
    const videoFile = videoFileByName.get(videoName);
    if (
      videoFile &&
      !retainedVideoFileNames.has(videoName) &&
      videoFile.exists &&
      !processedVideos.has(videoName)
    ) {
      try {
        videoBackups.push({ fileName: videoName, bytes: await videoFile.bytes() });
      } catch {
        /* keep deletion usable if backup read fails */
      }
      try {
        videoFile.delete();
      } catch (e) {
        console.warn(`Failed to delete video file ${videoName}:`, e);
      }
      processedVideos.add(videoName);
    }

    const audioRef = typeof item.parsed.audio === 'string' ? item.parsed.audio : '';
    const audioName = decodeURIComponent(audioRef.split('/').pop() ?? '');
    const audioBackups: { fileName: string; bytes: Uint8Array }[] = [];
    const audioFile = audioFileByName.get(audioName);
    if (
      audioFile &&
      !retainedAudioFileNames.has(audioName) &&
      audioFile.exists &&
      !processedAudios.has(audioName)
    ) {
      try {
        audioBackups.push({ fileName: audioName, bytes: await audioFile.bytes() });
      } catch {
        /* keep deletion usable if backup read fails */
      }
      try {
        audioFile.delete();
      } catch (e) {
        console.warn(`Failed to delete audio file ${audioName}:`, e);
      }
      processedAudios.add(audioName);
    }

    // Delete the card's JSON file
    try {
      item.file.delete();
    } catch (e) {
      console.warn(`Failed to delete JSON file ${item.file.name}:`, e);
    }

    backups.push({
      id: item.parsed.id as string,
      jsonText: item.text,
      ...(itemImageBackups.length > 0 ? { images: itemImageBackups } : {}),
      ...(itemPdfBackups.length > 0 ? { pdfs: itemPdfBackups } : {}),
      ...(videoBackups.length > 0 ? { videos: videoBackups } : {}),
      ...(audioBackups.length > 0 ? { audios: audioBackups } : {}),
    });
  }

  // Remove deleted items from SQLite cache
  removeCachedItems(
    getSourceId(source),
    toDelete.map((i) => i.parsed.id as string)
  );

  return backups;
}

/**
 * Restores previously deleted items to the library folder from their backup JSON
 * and restores any associated images and pdfs.
 */
export async function restoreItemsToLibrary(
  source: LibrarySource,
  backups: DeletedItemBackup[]
): Promise<void> {
  const root = getLibraryDirectory(source);
  if (!root.exists || backups.length === 0) return;

  const imagesDir = getImagesDirectory(source);
  const pdfsDir = getPdfsDirectory(source);
  const videosDir = getVideosDirectory(source);
  const audiosDir = getAudiosDirectory(source);

  for (const backup of backups) {
    try {
      const jsonFile = new File(root, `${backup.id}.json`);
      if (!jsonFile.exists) {
        jsonFile.create({ intermediates: true, overwrite: true });
      }
      const jsonText = backup.jsonText;
      jsonFile.write(jsonText);

      // Restore to SQLite cache
      try {
        const parsed = parseItem(JSON.parse(jsonText));
        const mtime =
          jsonFile.lastModified ??
          (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
          Date.now();
        upsertCachedItems(getSourceId(source), [
          { id: backup.id, mtime, rawJson: jsonText, item: parsed },
        ]);
      } catch (cacheErr) {
        console.warn(`Failed to cache restored item ${backup.id}:`, cacheErr);
      }

      if (backup.images && backup.images.length > 0) {
        if (!imagesDir.exists) {
          imagesDir.create({ intermediates: true, idempotent: true });
        }
        for (const img of backup.images) {
          try {
            const restoredImageFile = new File(imagesDir, img.fileName);
            if (!restoredImageFile.exists) {
              restoredImageFile.create({ intermediates: true, overwrite: true });
            }
            restoredImageFile.write(img.bytes);
          } catch (imgErr) {
            console.error(`Failed to restore image ${img.fileName}:`, imgErr);
          }
        }
      }

      if (backup.pdfs && backup.pdfs.length > 0) {
        if (!pdfsDir.exists) {
          pdfsDir.create({ intermediates: true, idempotent: true });
        }
        for (const pdf of backup.pdfs) {
          try {
            const restoredPdfFile = new File(pdfsDir, pdf.fileName);
            if (!restoredPdfFile.exists) {
              restoredPdfFile.create({ intermediates: true, overwrite: true });
            }
            restoredPdfFile.write(pdf.bytes);
          } catch (pdfErr) {
            console.error(`Failed to restore pdf ${pdf.fileName}:`, pdfErr);
          }
        }
      }

      if (backup.videos?.length) {
        if (!videosDir.exists) videosDir.create({ intermediates: true, idempotent: true });
        for (const video of backup.videos) {
          const restored = new File(videosDir, video.fileName);
          if (!restored.exists) restored.create({ intermediates: true, overwrite: true });
          restored.write(video.bytes);
        }
      }
      if (backup.audios?.length) {
        if (!audiosDir.exists) audiosDir.create({ intermediates: true, idempotent: true });
        for (const audio of backup.audios) {
          const restored = new File(audiosDir, audio.fileName);
          if (!restored.exists) restored.create({ intermediates: true, overwrite: true });
          restored.write(audio.bytes);
        }
      }
    } catch (e) {
      console.error(`Failed to restore item ${backup.id}:`, e);
    }
  }
}

/**
 * Deletes a single card's JSON file and related image from the library folder.
 */
export async function deleteItemFromLibrary(source: LibrarySource, itemId: string): Promise<void> {
  await deleteItemsFromLibrary(source, [itemId]);
}

/**
 * Updates an existing card's JSON file in the library folder and returns the resolved item.
 */
export async function updateItemInLibrary(
  source: LibrarySource,
  itemId: string,
  updates: Partial<LibraryItem>
): Promise<LibraryItem> {
  const root = getLibraryDirectory(source);
  if (!root.exists) {
    throw new Error('Library directory not found');
  }

  const jsonFile = new File(root, `${itemId}.json`);
  if (!jsonFile.exists) {
    throw new Error(`Card ${itemId} not found`);
  }

  const text = await jsonFile.text();
  const rawItem = JSON.parse(text);

  const now = new Date().toISOString();
  const updatedRaw = {
    ...rawItem,
    ...updates,
    id: itemId,
    updatedAt: now,
  };

  if (TRACKABLE_TYPES.includes(rawItem.type)) {
    if (updatedRaw.progressStatus !== 'completed') delete updatedRaw.completedAt;
    else if (rawItem.progressStatus !== 'completed') updatedRaw.completedAt = now;
    else if (rawItem.completedAt !== undefined) updatedRaw.completedAt = rawItem.completedAt;
    else delete updatedRaw.completedAt;
  }

  if (rawItem.type === 'note' && typeof updatedRaw.text === 'string') {
    const markdownFile = new File(root, `${itemId}.md`);
    markdownFile.create({ intermediates: true, overwrite: true });
    markdownFile.write(updatedRaw.text);
  }

  if (
    rawItem.image &&
    typeof rawItem.image === 'string' &&
    !rawItem.image.startsWith('file:') &&
    !rawItem.image.startsWith('http')
  ) {
    updatedRaw.image = rawItem.image;
  }
  if (
    rawItem.pdf &&
    typeof rawItem.pdf === 'string' &&
    !rawItem.pdf.startsWith('file:') &&
    !rawItem.pdf.startsWith('http')
  ) {
    updatedRaw.pdf = rawItem.pdf;
  }
  if (
    rawItem.thumbnail &&
    typeof rawItem.thumbnail === 'string' &&
    !rawItem.thumbnail.startsWith('file:') &&
    !rawItem.thumbnail.startsWith('http')
  ) {
    updatedRaw.thumbnail = rawItem.thumbnail;
  }
  if (
    rawItem.favicon &&
    typeof rawItem.favicon === 'string' &&
    !rawItem.favicon.startsWith('file:') &&
    !rawItem.favicon.startsWith('http')
  ) {
    updatedRaw.favicon = rawItem.favicon;
  }
  if (
    rawItem.cover &&
    typeof rawItem.cover === 'string' &&
    !rawItem.cover.startsWith('file:') &&
    !rawItem.cover.startsWith('http')
  ) {
    updatedRaw.cover = rawItem.cover;
  }

  if ('tags' in updates) {
    if (updates.tags && updates.tags.length > 0) {
      updatedRaw.tags = updates.tags.filter(Boolean);
    } else {
      delete updatedRaw.tags;
    }
  }

  if ('autoTags' in updates) {
    if (updates.autoTags && updates.autoTags.length > 0) {
      updatedRaw.autoTags = updates.autoTags.filter(Boolean);
    } else {
      delete updatedRaw.autoTags;
    }
  }

  const jsonText = JSON.stringify(updatedRaw, null, 2);
  jsonFile.write(jsonText);

  // Update SQLite cache
  const mtime =
    jsonFile.lastModified ??
    (jsonFile as unknown as { modificationTime?: number }).modificationTime ??
    Date.now();
  const resolvedItem = resolveImages(parseItem(updatedRaw), root);
  upsertCachedItems(getSourceId(source), [
    { id: itemId, mtime, rawJson: jsonText, item: parseItem(updatedRaw) },
  ]);

  return resolvedItem;
}

type LibraryItemUpdate = { itemId: string; updates: Partial<LibraryItem> };

type FileSnapshot = { file: File; existed: boolean; text?: string };

// Serialize batch edits and retain their source files so a failed write can be rolled back.
let itemUpdateQueue: Promise<unknown> = Promise.resolve();

export function updateItemsInLibrary(
  source: LibrarySource,
  updates: LibraryItemUpdate[]
): Promise<LibraryItem[]> {
  const operation = itemUpdateQueue.then(async () => {
    if (updates.length === 0) return [];
    const root = getLibraryDirectory(source);
    if (!root.exists) throw new Error('Library directory not found');

    const snapshots: FileSnapshot[] = [];
    const seen = new Set<string>();
    for (const { itemId, updates: itemUpdates } of updates) {
      const jsonFile = new File(root, `${itemId}.json`);
      if (!jsonFile.exists) throw new Error(`Card ${itemId} not found`);
      const jsonText = await jsonFile.text();
      const raw = JSON.parse(jsonText);
      if (!seen.has(jsonFile.name)) {
        snapshots.push({ file: jsonFile, existed: true, text: jsonText });
        seen.add(jsonFile.name);
      }
      if (raw.type === 'note' && 'text' in itemUpdates && typeof itemUpdates.text === 'string') {
        const markdownFile = new File(root, `${itemId}.md`);
        if (!seen.has(markdownFile.name)) {
          snapshots.push({
            file: markdownFile,
            existed: markdownFile.exists,
            text: markdownFile.exists ? await markdownFile.text() : undefined,
          });
          seen.add(markdownFile.name);
        }
      }
    }

    try {
      const updated: LibraryItem[] = [];
      for (const { itemId, updates: itemUpdates } of updates) {
        updated.push(await updateItemInLibrary(source, itemId, itemUpdates));
      }
      return updated;
    } catch (error) {
      let restored = true;
      for (const snapshot of snapshots.reverse()) {
        try {
          if (snapshot.existed) snapshot.file.write(snapshot.text ?? '');
          else if (snapshot.file.exists) snapshot.file.delete();
        } catch {
          restored = false;
        }
      }
      try {
        clearSourceCache(getSourceId(source));
      } catch {
        restored = false;
      }
      throw new Error(
        restored
          ? `Could not save all card updates. ${errorMessage(error)}`
          : 'Could not save or restore every card update. Review the library and try again.'
      );
    }
  });
  itemUpdateQueue = operation.catch(() => undefined);
  return operation;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Serialize relationship batches so overlapping edits read the latest files.
let relatedWriteQueue: Promise<unknown> = Promise.resolve();

export function setRelatedItemsInLibrary(
  source: LibrarySource,
  itemId: string,
  relatedIds: string[]
): Promise<LibraryItem[]> {
  const operation = relatedWriteQueue.then(async () => {
    const root = getLibraryDirectory(source);
    if (!root.exists) throw new Error('Library directory not found');
    const records: { file: File; text: string; raw: Record<string, unknown>; item: LibraryItem }[] =
      [];
    for (const file of root.list()) {
      if (!(file instanceof File) || !file.name.endsWith('.json') || file.name.startsWith('.'))
        continue;
      const text = await file.text();
      let raw: Record<string, unknown>;
      let item: LibraryItem;
      try {
        raw = JSON.parse(text);
        item = parseItem(raw);
      } catch {
        // Unrelated invalid cards must not prevent access to valid local data.
        continue;
      }
      if (file.name !== `${item.id}.json`) continue;
      records.push({ file, text, raw, item });
    }
    const current = records.find((record) => record.item.id === itemId);
    if (!current) throw new Error('Card not found');
    const available = new Set(records.map((record) => record.item.id));
    const selected = new Set(normalizeRelatedIds(relatedIds, itemId));
    for (const id of selected) {
      if (!available.has(id)) throw new Error('A selected card is no longer available');
    }
    // Keep dangling references for delete/restore compatibility.
    const currentIds = [
      ...selected,
      ...(current.item.relatedItemIds ?? []).filter((id) => !available.has(id)),
    ];
    const changes = records.flatMap((record) => {
      const previous = record.item.relatedItemIds ?? [];
      const next =
        record === current
          ? currentIds
          : selected.has(record.item.id)
            ? [...new Set([...previous, itemId])]
            : previous.filter((id) => id !== itemId);
      if (previous.length === next.length && previous.every((id) => next.includes(id))) return [];
      const raw: Record<string, unknown> = { ...record.raw, updatedAt: new Date().toISOString() };
      if (next.length) raw.relatedItemIds = next;
      else delete raw.relatedItemIds;
      return [{ ...record, updatedRaw: raw, updatedText: JSON.stringify(raw, null, 2) }];
    });
    const attempted: typeof changes = [];
    try {
      for (const change of changes) {
        attempted.push(change);
        change.file.write(change.updatedText);
      }
      upsertCachedItems(
        getSourceId(source),
        changes.map((change) => ({
          id: change.item.id,
          mtime: change.file.lastModified ?? Date.now(),
          rawJson: change.updatedText,
          item: parseItem(change.updatedRaw),
        }))
      );
    } catch {
      let restored = true;
      for (const change of attempted.reverse()) {
        try {
          change.file.write(change.text);
        } catch {
          restored = false;
        }
      }
      // Force the subsequent reload to rebuild the cache from the actual files.
      try {
        clearSourceCache(getSourceId(source));
      } catch {
        restored = false;
      }
      throw new Error(
        restored
          ? 'Could not save related cards. Please try again.'
          : 'Could not save all related cards or restore every change. Review the current relationships and try again.'
      );
    }
    return changes.map((change) => resolveImages(parseItem(change.updatedRaw), root));
  });
  relatedWriteQueue = operation.catch(() => undefined);
  return operation;
}
