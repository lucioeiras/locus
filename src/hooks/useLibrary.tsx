import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { ArchiveRetentionDays } from '@/lib/library/archive';
import { ARCHIVE_RETENTION_STORAGE_KEY, getExpiredArchivedIds } from '@/lib/library/archive';
import { LibraryAssetContext } from '@/lib/library/assetContext';
import { getDistinctTags, searchCachedItems, type ItemIndexFilter } from '@/lib/library/cache';
import { getPinnedItems, MAX_PINNED_ITEMS } from '@/lib/library/pinned';
import {
  addAudioToLibrary,
  addBookItemToLibrary,
  addGameItemToLibrary,
  addImageToLibrary,
  addLinkItemToLibrary,
  addMovieItemToLibrary,
  addMusicItemToLibrary,
  addPdfToLibrary,
  addTextItemToLibrary,
  addTvShowItemToLibrary,
  addVideoToLibrary,
  deleteItemsFromLibrary,
  getFolderDisplayName,
  getLibraryDirectory,
  getRecentFolders,
  getSavedLibrarySource,
  getSourceId,
  loadLibrary,
  pickLibraryFolder,
  removeRecentFolder as removeRecentFolderStorage,
  resolveFolderSource,
  resolveImages,
  restoreItemsToLibrary,
  saveLibrarySource,
  saveRecentFolder,
  setRelatedItemsInLibrary,
  updateItemInLibrary,
  updateItemsInLibrary,
  type AddGameOptions,
  type AddImageOptions,
  type AddMovieOptions,
  type AddPdfOptions,
  type AddTvShowOptions,
  type AddVideoOptions,
  type DeletedItemBackup,
  type LibrarySource,
  type LinkUploadItem,
  type LoadResult,
  type PickedAudioAsset,
  type PickedImageAsset,
  type PickedPdfAsset,
  type PickedVideoAsset,
  type SavedFolder,
} from '@/lib/library/storage';
import type {
  BookItem,
  GameItem,
  ImageItem,
  LibraryItem,
  LibraryItemType,
  MovieItem,
  MusicItem,
  NoteItem,
  PdfItem,
  QuoteItem,
  TvShowItem,
  VideoItem,
} from '@/lib/library/types';

export type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; result: LoadResult }
  | { status: 'error'; error: string };

export type LibraryContextValue = {
  source: LibrarySource;
  setSource: (source: LibrarySource) => void;
  state: LibraryState;
  refresh: () => Promise<void>;
  refreshing: boolean;
  recentFolders: SavedFolder[];
  currentFolderName: string;
  selectFolder: (source: LibrarySource) => Promise<void>;
  pickAndOpenFolder: () => Promise<boolean>;
  removeRecentFolder: (id: string) => Promise<void>;
  addImage: (
    asset: PickedImageAsset | PickedImageAsset[],
    options?: AddImageOptions
  ) => Promise<ImageItem>;
  addPdf: (asset: PickedPdfAsset, options?: AddPdfOptions) => Promise<PdfItem>;
  addVideo: (asset: PickedVideoAsset, options?: AddVideoOptions) => Promise<VideoItem>;
  addAudio: (
    asset: PickedAudioAsset,
    options?: { title?: string; note?: string; tags?: string[]; autoTags?: string[] }
  ) => Promise<import('@/lib/library/types').AudioItem>;
  addTextItem: (
    text: string,
    title?: string,
    options?: {
      tags?: string[];
      autoTags?: string[];
      linkedItemId?: string;
      forceNote?: boolean;
      author?: string;
    }
  ) => Promise<NoteItem | QuoteItem>;
  addLinkItem: (
    url: string,
    options?: {
      tags?: string[];
      autoTags?: string[];
      note?: string;
      title?: string;
      preloadedMetadata?: import('@/lib/library/metadata').ResolvedMetadata;
    }
  ) => Promise<LinkUploadItem>;
  addBookItem: (
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
  ) => Promise<BookItem>;
  addMusicItem: (
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
  ) => Promise<MusicItem>;
  addMovieItem: (
    movie: AddMovieOptions,
    options?: {
      tags?: string[];
      autoTags?: string[];
      note?: string;
    }
  ) => Promise<MovieItem>;
  addTvShowItem: (
    show: AddTvShowOptions,
    options?: { tags?: string[]; autoTags?: string[]; note?: string }
  ) => Promise<TvShowItem>;
  addGameItem: (
    game: AddGameOptions,
    options?: {
      tags?: string[];
      autoTags?: string[];
      note?: string;
    }
  ) => Promise<GameItem>;
  deleteItem: (itemId: string) => Promise<void>;
  deleteItems: (itemIds: string[]) => Promise<DeletedItemBackup[]>;
  restoreItems: (backups: DeletedItemBackup[]) => Promise<void>;
  updateItem: (
    itemId: string,
    updates: Partial<import('@/lib/library/types').LibraryItem>
  ) => Promise<import('@/lib/library/types').LibraryItem>;
  updateItems: (
    updates: { itemId: string; updates: Partial<LibraryItem> }[]
  ) => Promise<LibraryItem[]>;
  setItemsPinned: (itemIds: string[], pinned: boolean) => Promise<boolean>;
  setRelatedItems: (itemId: string, relatedIds: string[]) => Promise<void>;
  getTags: () => { tag: string; count: number }[];
  searchItems: (filter: ItemIndexFilter) => import('@/lib/library/types').LibraryItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchTag: string | null;
  selectTag: (tag: string) => void;
  clearSearchTag: () => void;
  searchType: LibraryItemType | null;
  selectCardType: (type: LibraryItemType, label: string) => void;
  isInitialized: boolean;
  hasSavedSource: boolean;
  shouldAutoOpenBoard: boolean;
  consumeAutoOpen: () => void;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [source, setSourceInternal] = useState<LibrarySource | null>(null);
  const [loaded, setLoaded] = useState<{ source: LibrarySource; state: LibraryState } | null>(null);
  const [searchQuery, setSearchQueryState] = useState('');
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<LibraryItemType | null>(null);
  const setSearchQuery = useCallback((query: string) => {
    setSearchType(null);
    setSearchQueryState(query);
  }, []);
  const selectTag = useCallback((tag: string) => {
    setSearchType(null);
    setSearchQueryState('');
    setSearchTag(tag);
  }, []);
  const clearSearchTag = useCallback(() => setSearchTag(null), []);
  const selectCardType = useCallback((type: LibraryItemType, label: string) => {
    setSearchTag(null);
    setSearchType(type);
    setSearchQueryState(label);
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [recentFolders, setRecentFolders] = useState<SavedFolder[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasSavedSource, setHasSavedSource] = useState(false);
  const [shouldAutoOpenBoard, setShouldAutoOpenBoard] = useState(false);
  const hasConsumedAutoOpen = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async (src: LibrarySource) => {
    const id = ++requestId.current;
    let state: LibraryState;
    try {
      let result = await loadLibrary(src);
      let retentionDays: ArchiveRetentionDays = 0;
      try {
        const stored = Number(await AsyncStorage.getItem(ARCHIVE_RETENTION_STORAGE_KEY));
        if ([7, 30, 90].includes(stored)) retentionDays = stored as ArchiveRetentionDays;
      } catch {
        // Retention is optional; unreadable preferences preserve archived cards.
      }
      const expiredIds = getExpiredArchivedIds(result.items, retentionDays);
      if (expiredIds.length > 0) {
        await deleteItemsFromLibrary(src, expiredIds);
        result = await loadLibrary(src);
      }
      state = { status: 'ready', result };
    } catch (e) {
      state = { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    if (id === requestId.current) setLoaded({ source: src, state });
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([getSavedLibrarySource(), getRecentFolders()]).then(([savedSource, recents]) => {
      if (!mounted) return;
      if (!savedSource && process.env.EXPO_PUBLIC_E2E === 'true') {
        const e2eSource: LibrarySource = { kind: 'local', name: 'E2E Library' };
        setSourceInternal(e2eSource);
        setHasSavedSource(true);
        setShouldAutoOpenBoard(true);
        void saveLibrarySource(e2eSource);
        void saveRecentFolder(e2eSource).then(setRecentFolders);
      }
      if (savedSource) {
        const resolved = resolveFolderSource(savedSource);
        setSourceInternal(resolved);
        setHasSavedSource(true);
        if (!hasConsumedAutoOpen.current) {
          setShouldAutoOpenBoard(true);
        }
      }
      setRecentFolders(recents);
      setIsInitialized(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const consumeAutoOpen = useCallback(() => {
    hasConsumedAutoOpen.current = true;
    setShouldAutoOpenBoard(false);
  }, []);

  const setSource = useCallback((newSource: LibrarySource) => {
    hasConsumedAutoOpen.current = true;
    setShouldAutoOpenBoard(false);
    const resolved = resolveFolderSource(newSource);
    setSourceInternal(resolved);
    setHasSavedSource(true);
    saveLibrarySource(resolved);
    saveRecentFolder(resolved).then(setRecentFolders);
  }, []);

  const selectFolder = useCallback(async (newSource: LibrarySource) => {
    hasConsumedAutoOpen.current = true;
    setShouldAutoOpenBoard(false);
    const resolved = resolveFolderSource(newSource);
    setSourceInternal(resolved);
    setHasSavedSource(true);
    await saveLibrarySource(resolved);
    const updated = await saveRecentFolder(resolved);
    setRecentFolders(updated);
  }, []);

  const pickAndOpenFolder = useCallback(async (): Promise<boolean> => {
    try {
      hasConsumedAutoOpen.current = true;
      setShouldAutoOpenBoard(false);
      const picked = await pickLibraryFolder();
      setSourceInternal(picked);
      setHasSavedSource(true);
      const updated = await getRecentFolders();
      setRecentFolders(updated);
      return true;
    } catch {
      return false;
    }
  }, []);

  const removeRecentFolder = useCallback(
    async (id: string) => {
      const updated = await removeRecentFolderStorage(id);
      setRecentFolders(updated);
      if (source && source.kind === 'folder' && source.uri === id) {
        setSourceInternal(null);
        setHasSavedSource(false);
        try {
          await AsyncStorage.removeItem('locus:librarySource');
        } catch {
          // ignore
        }
      }
    },
    [source]
  );

  useEffect(() => {
    if (!source) return;

    let subscription: { remove(): void } | undefined;
    let cancelled = false;

    load(source).then(() => {
      const root = getLibraryDirectory(source);
      if (cancelled || !root.exists) return;
      try {
        subscription = root.watch(() => load(source), { debounce: 300 });
      } catch {
        // Watching is a nice-to-have; pull-to-refresh still works.
      }
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [source, load]);

  const refresh = useCallback(async () => {
    if (!source) return;
    setRefreshing(true);
    await load(source);
    setRefreshing(false);
  }, [source, load]);

  const activeSource = source ?? { kind: 'local', name: 'App Library' };

  const state: LibraryState = !source
    ? { status: 'loading' }
    : loaded && loaded.source === source
      ? loaded.state
      : { status: 'loading' };

  const currentFolderName = getFolderDisplayName(activeSource);

  const addImage = useCallback(
    async (asset: PickedImageAsset | PickedImageAsset[], options?: AddImageOptions) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addImageToLibrary(targetSource, asset, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addPdf = useCallback(
    async (asset: PickedPdfAsset, options?: AddPdfOptions) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addPdfToLibrary(targetSource, asset, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addVideo = useCallback(
    async (asset: PickedVideoAsset, options?: AddVideoOptions) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) setSource(targetSource);
      const item = await addVideoToLibrary(targetSource, asset, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addAudio = useCallback(
    async (
      asset: PickedAudioAsset,
      options?: { title?: string; note?: string; tags?: string[]; autoTags?: string[] }
    ) => {
      const targetSource = source ?? { kind: 'local' as const, name: 'App Library' };
      if (!source) setSource(targetSource);
      const item = await addAudioToLibrary(targetSource, asset, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addTextItem = useCallback(
    async (
      text: string,
      title?: string,
      options?: {
        tags?: string[];
        autoTags?: string[];
        linkedItemId?: string;
        forceNote?: boolean;
        author?: string;
      }
    ) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addTextItemToLibrary(targetSource, text, title, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addLinkItem = useCallback(
    async (
      url: string,
      options?: {
        tags?: string[];
        autoTags?: string[];
        note?: string;
        title?: string;
        preloadedMetadata?: import('@/lib/library/metadata').ResolvedMetadata;
      }
    ) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addLinkItemToLibrary(targetSource, url, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addBookItem = useCallback(
    async (
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
    ) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addBookItemToLibrary(targetSource, book, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addMusicItem = useCallback(
    async (
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
    ) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addMusicItemToLibrary(targetSource, music, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addMovieItem = useCallback(
    async (
      movie: AddMovieOptions,
      options?: {
        tags?: string[];
        autoTags?: string[];
        note?: string;
      }
    ) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addMovieItemToLibrary(targetSource, movie, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addTvShowItem = useCallback(
    async (
      show: AddTvShowOptions,
      options?: { tags?: string[]; autoTags?: string[]; note?: string }
    ) => {
      const targetSource = source ?? { kind: 'local' as const, name: 'App Library' };
      if (!source) setSource(targetSource);
      const item = await addTvShowItemToLibrary(targetSource, show, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const addGameItem = useCallback(
    async (
      game: AddGameOptions,
      options?: {
        tags?: string[];
        autoTags?: string[];
        note?: string;
      }
    ) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      if (!source) {
        setSource(targetSource);
      }
      const item = await addGameItemToLibrary(targetSource, game, options);
      await load(targetSource);
      return item;
    },
    [source, setSource, load]
  );

  const deleteItems = useCallback(
    async (itemIds: string[]): Promise<DeletedItemBackup[]> => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      const idSet = new Set(itemIds);

      // Optimistically remove items from current ready state for instantaneous UI feedback
      setLoaded((prev) => {
        if (prev && prev.state.status === 'ready') {
          return {
            ...prev,
            state: {
              ...prev.state,
              result: {
                ...prev.state.result,
                items: prev.state.result.items.filter((item) => !idSet.has(item.id)),
              },
            },
          };
        }
        return prev;
      });

      const backups = await deleteItemsFromLibrary(targetSource, itemIds);
      await load(targetSource);
      return backups;
    },
    [source, load]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      await deleteItems([itemId]);
    },
    [deleteItems]
  );

  const restoreItems = useCallback(
    async (backups: DeletedItemBackup[]): Promise<void> => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      await restoreItemsToLibrary(targetSource, backups);
      await load(targetSource);
    },
    [source, load]
  );

  const updateItem = useCallback(
    async (itemId: string, updates: Partial<import('@/lib/library/types').LibraryItem>) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      const updated = await updateItemInLibrary(targetSource, itemId, updates);

      setLoaded((prev) => {
        if (prev && prev.state.status === 'ready') {
          return {
            ...prev,
            state: {
              ...prev.state,
              result: {
                ...prev.state.result,
                items: prev.state.result.items.map((i) => (i.id === itemId ? updated : i)),
              },
            },
          };
        }
        return prev;
      });

      return updated;
    },
    [source]
  );

  const updateItems = useCallback(
    async (
      updates: { itemId: string; updates: Partial<LibraryItem> }[]
    ): Promise<LibraryItem[]> => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      const updatedItems = await updateItemsInLibrary(targetSource, updates);

      const updatesById = new Map(updatedItems.map((item) => [item.id, item]));
      setLoaded((prev) => {
        if (
          prev &&
          getSourceId(prev.source) === getSourceId(targetSource) &&
          prev.state.status === 'ready'
        ) {
          return {
            ...prev,
            state: {
              ...prev.state,
              result: {
                ...prev.state.result,
                items: prev.state.result.items.map((item) => updatesById.get(item.id) ?? item),
              },
            },
          };
        }
        return prev;
      });
      return updatedItems;
    },
    [source]
  );

  const setItemsPinned = useCallback(
    async (itemIds: string[], pinned: boolean): Promise<boolean> => {
      let currentItems = loaded?.state.status === 'ready' ? loaded.state.result.items : [];
      const selected = currentItems.filter((item) => itemIds.includes(item.id));
      if (selected.length === 0) return false;
      const itemsToChange = selected.filter((item) => Boolean(item.pinnedAt) !== pinned);
      if (
        pinned &&
        currentItems.filter((item) => item.pinnedAt).length + itemsToChange.length >
          MAX_PINNED_ITEMS
      ) {
        return false;
      }

      if (pinned) {
        if (itemsToChange.length === 0) return true;

        const orderedItems = [...itemsToChange, ...getPinnedItems(currentItems)];
        const firstPinnedAt = Date.now();
        await updateItems(
          orderedItems.map((item, index) => ({
            itemId: item.id,
            updates: { pinnedAt: new Date(firstPinnedAt + index).toISOString() },
          }))
        );
        return true;
      }

      for (const item of itemsToChange) await updateItem(item.id, { pinnedAt: undefined });
      return true;
    },
    [loaded, updateItem, updateItems]
  );

  const setRelatedItems = useCallback(
    async (itemId: string, relatedIds: string[]) => {
      const targetSource = source ?? { kind: 'local' as const, name: 'App Library' };
      try {
        const updated = await setRelatedItemsInLibrary(targetSource, itemId, relatedIds);
        const byId = new Map(updated.map((item) => [item.id, item]));
        setLoaded((prev) => {
          if (
            !prev ||
            getSourceId(prev.source) !== getSourceId(targetSource) ||
            prev.state.status !== 'ready'
          )
            return prev;
          return {
            ...prev,
            state: {
              ...prev.state,
              result: {
                ...prev.state.result,
                items: prev.state.result.items.map((item) => byId.get(item.id) ?? item),
              },
            },
          };
        });
      } catch (error) {
        await load(targetSource);
        throw error;
      }
    },
    [source, load]
  );

  const getTags = useCallback(() => {
    const targetSource = source ?? { kind: 'local', name: 'App Library' };
    return getDistinctTags(getSourceId(targetSource));
  }, [source]);

  const searchItems = useCallback(
    (filter: ItemIndexFilter) => {
      const targetSource = source ?? { kind: 'local', name: 'App Library' };
      const root = getLibraryDirectory(targetSource);
      const cachedMatches = searchCachedItems(getSourceId(targetSource), filter);
      return cachedMatches.map((item) => resolveImages(item, root));
    },
    [source]
  );

  const value: LibraryContextValue = {
    source: activeSource,
    setSource,
    state,
    refresh,
    refreshing,
    recentFolders,
    currentFolderName,
    selectFolder,
    pickAndOpenFolder,
    removeRecentFolder,
    addImage,
    addPdf,
    addVideo,
    addAudio,
    addTextItem,
    addLinkItem,
    addBookItem,
    addMusicItem,
    addMovieItem,
    addTvShowItem,
    addGameItem,
    deleteItem,
    deleteItems,
    restoreItems,
    updateItem,
    updateItems,
    setItemsPinned,
    setRelatedItems,
    getTags,
    searchItems,
    searchQuery,
    setSearchQuery,
    searchTag,
    selectTag,
    clearSearchTag,
    searchType,
    selectCardType,
    isInitialized,
    hasSavedSource,
    shouldAutoOpenBoard,
    consumeAutoOpen,
  };

  return (
    <LibraryContext.Provider value={value}>
      <LibraryAssetContext.Provider
        value={Platform.OS === 'web' ? null : getLibraryDirectory(activeSource).uri}
      >
        {children}
      </LibraryAssetContext.Provider>
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}
