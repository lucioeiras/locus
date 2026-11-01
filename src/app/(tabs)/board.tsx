import { useAppTheme } from '@/lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { BlurTargetView } from 'expo-blur';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Plus, TriangleAlert } from 'lucide-react-native';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { BoardAddModals } from '@/components/board/BoardAddModals';
import { BoardPinnedItems } from '@/components/board/BoardPinnedItems';
import { BoardTypeFilters } from '@/components/board/BoardTypeFilters';
import { Button } from '@/components/Button';
import { ItemCard } from '@/components/cards/ItemCard';
import { LocalizedText } from '@/components/LocalizedText';
import { CardSelectionBar } from '@/components/menus/CardSelectionBar';
import {
  clearOverlayIfCurrent,
  useFloatingTabOverlay,
} from '@/components/menus/FloatingTabOverlay';
import { RestoreToast } from '@/components/menus/RestoreToast';
import { SearchBar } from '@/components/menus/SearchBar';
import { useLibrary } from '@/hooks/useLibrary';
import { translate, useLocalization } from '@/lib/i18n';
import { CARD_TYPE_LABELS, matchesAddedDay, parseDayKey } from '@/lib/library/activity';
import type { ArchiveRetentionDays } from '@/lib/library/archive';
import {
  ARCHIVE_RETENTION_STORAGE_KEY,
  archiveUpdates,
  filterArchivedItems,
  isArchived,
} from '@/lib/library/archive';
import { parseAudioWaveform } from '@/lib/library/audioWaveform';
import { isLinkableItem, type LinkableItem } from '@/lib/library/links';
import { matchesStatus, STATUS_FOLDERS } from '@/lib/library/organize';
import { getPinnedItems, MAX_PINNED_ITEMS, movePinnedItem } from '@/lib/library/pinned';
import type {
  DeletedItemBackup,
  PickedAudioAsset,
  PickedImageAsset,
  PickedPdfAsset,
  PickedVideoAsset,
} from '@/lib/library/storage';
import type { MediaProgressStatus } from '@/lib/library/types';
import { type LibraryItem, type LibraryItemType } from '@/lib/library/types';

type BoardGridContextType = {
  lastIndices: { col0: number; col1: number };
  totalItems: number;
  animateReorder: boolean;
  reportItemCol: (index: number, col: number) => void;
};

type AddControlItem =
  | 'note'
  | 'link'
  | 'book'
  | 'music'
  | 'movie'
  | 'tvshow'
  | 'game'
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'all';

type AddControlAction = {
  item: AddControlItem;
  token?: string;
  imageAsset?: PickedImageAsset;
  imageAssets?: PickedImageAsset[];
  pdfAsset?: PickedPdfAsset;
};

const BoardGridContext = createContext<BoardGridContextType>({
  lastIndices: { col0: -1, col1: -1 },
  totalItems: 0,
  animateReorder: false,
  reportItemCol: () => {},
});

export default function BoardScreen() {
  const { colors: themeColors } = useAppTheme();
  const { language } = useLocalization();
  const locale = language === 'pt' ? 'pt-BR' : 'en-US';
  const boardListRef = useRef<FlashListRef<LibraryItem>>(null);
  const {
    state,
    refresh,
    refreshing,
    deleteItems,
    restoreItems,
    searchItems,
    searchQuery,
    searchTag,
    searchType,
    setSearchQuery,
    clearSearchTag,
    updateItem,
    updateItems,
    setItemsPinned,
  } = useLibrary();
  const searchBlurTargetRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const setFloatingTabOverlay = useFloatingTabOverlay();
  const {
    newNote,
    newLink,
    newBook,
    newMusic,
    newMovie,
    newTvShow,
    newGame,
    newEntertainment,
    newImageUri,
    newImageAssets,
    newImageFileName,
    newImageMimeType,
    newImageTimestamp,
    newPdfUri,
    newPdfFileName,
    newPdfTimestamp,
    newVideoUri,
    newVideoFileName,
    newVideoFileSize,
    newVideoTimestamp,
    newAudioUri,
    newAudioDuration,
    newAudioWaveform,
    newAudioTimestamp,
    controlAddItem,
    controlToken,
    folderKind,
    folderKey,
    addedOn,
    activityToken,
  } = useLocalSearchParams<{
    newNote?: string;
    newLink?: string;
    newBook?: string;
    newMusic?: string;
    newMovie?: string;
    newTvShow?: string;
    newGame?: string;
    newEntertainment?: string;
    newImageUri?: string;
    newImageAssets?: string;
    newImageFileName?: string;
    newImageMimeType?: string;
    newImageTimestamp?: string;
    newPdfUri?: string;
    newPdfFileName?: string;
    newPdfTimestamp?: string;
    newVideoUri?: string;
    newVideoFileName?: string;
    newVideoFileSize?: string;
    newVideoTimestamp?: string;
    newAudioUri?: string;
    newAudioDuration?: string;
    newAudioWaveform?: string;
    newAudioTimestamp?: string;
    controlAddItem?: AddControlItem;
    controlToken?: string;
    addedOn?: string;
    activityToken?: string;
    folderKind?: 'status' | 'tag';
    folderKey?: string;
  }>();
  const [isNoteDrawerOpen, setIsNoteDrawerOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
  const [isMovieModalOpen, setIsMovieModalOpen] = useState(false);
  const [isTvShowModalOpen, setIsTvShowModalOpen] = useState(false);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [isEntertainmentModalOpen, setIsEntertainmentModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<PickedImageAsset | null>(null);
  const [pendingImages, setPendingImages] = useState<PickedImageAsset[]>([]);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<PickedPdfAsset | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<PickedVideoAsset | null>(null);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<PickedAudioAsset | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveRetentionDays, setArchiveRetentionDays] = useState<ArchiveRetentionDays>(0);
  const typeFilterScrollOffsetRef = useRef(0);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [exitingCardIds, setExitingCardIds] = useState<Set<string>>(new Set());
  const [enteringCardIds, setEnteringCardIds] = useState<Set<string>>(new Set());
  const [animateReorder, setAnimateReorder] = useState(false);
  const [optimisticPinnedOrder, setOptimisticPinnedOrder] = useState<string[] | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<DeletedItemBackup[] | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [selectedType, setSelectedType] = useState<{
    type: LibraryItemType;
    folderId: string;
  } | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<{
    status: MediaProgressStatus;
    folderId: string;
  } | null>(null);
  const addedDate = parseDayKey(addedOn);
  useEffect(() => {
    AsyncStorage.getItem(ARCHIVE_RETENTION_STORAGE_KEY)
      .then((stored) => {
        const days = Number(stored);
        if ([7, 30, 90].includes(days)) setArchiveRetentionDays(days as ArchiveRetentionDays);
      })
      .catch(() => {});
  }, []);
  const activeDay = addedDate ? addedOn : null;
  const clearDateFilter = useCallback(() => router.setParams({ addedOn: '' }), []);
  const activeFolderKind =
    folderKey && (folderKind === 'status' || folderKind === 'tag') ? folderKind : null;
  const activeFolderKey = activeFolderKind ? folderKey : null;
  const folderLabel =
    activeFolderKind === 'status'
      ? translate(STATUS_FOLDERS.find((folder) => folder.key === activeFolderKey)?.title ?? '')
      : activeFolderKey;

  const clearFolderFilter = useCallback(() => {
    setSelectedType(null);
    router.setParams({ folderKind: '', folderKey: '' });
  }, []);
  const handleSearchChange = useCallback((text: string) => setSearchQuery(text), [setSearchQuery]);
  const itemColsRef = useRef<Map<number, number>>(new Map());
  const [lastIndices, setLastIndices] = useState<{
    col0: number;
    col1: number;
  }>({
    col0: -1,
    col1: -1,
  });
  const lastOpenedNoteRef = useRef<string | null>(null);
  const lastOpenedLinkRef = useRef<string | null>(null);
  const lastOpenedBookRef = useRef<string | null>(null);
  const lastOpenedMusicRef = useRef<string | null>(null);
  const lastOpenedMovieRef = useRef<string | null>(null);
  const lastOpenedTvShowRef = useRef<string | null>(null);
  const lastOpenedGameRef = useRef<string | null>(null);
  const lastOpenedEntertainmentRef = useRef<string | null>(null);
  const lastOpenedImageRef = useRef<string | null>(null);
  const lastOpenedPdfRef = useRef<string | null>(null);
  const lastOpenedVideoRef = useRef<string | null>(null);
  const lastOpenedAudioRef = useRef<string | null>(null);
  const lastOpenedControlRef = useRef<string | null>(null);

  const activeAddModalRef = useRef<Exclude<AddControlItem, 'all'> | null>(null);
  const queuedControlActionRef = useRef<AddControlAction | null>(null);

  const openControlAction = useCallback((action: AddControlAction) => {
    if (action.item === 'all') {
      activeAddModalRef.current = null;
      router.replace('/add');
      return;
    }

    activeAddModalRef.current = action.item;
    switch (action.item) {
      case 'note':
        setIsNoteDrawerOpen(true);
        break;
      case 'link':
        setIsLinkModalOpen(true);
        break;
      case 'book':
        setIsBookModalOpen(true);
        break;
      case 'music':
        setIsMusicModalOpen(true);
        break;
      case 'movie':
        setIsMovieModalOpen(true);
        break;
      case 'tvshow':
        setIsTvShowModalOpen(true);
        break;
      case 'game':
        setIsGameModalOpen(true);
        break;
      case 'image':
        if (!action.imageAsset && !action.imageAssets?.length) {
          activeAddModalRef.current = null;
          router.replace({
            pathname: '/add',
            params: {
              controlItem: 'image',
              controlToken: action.token ?? Date.now().toString(),
            },
          });
          break;
        }
        setPendingImages(action.imageAssets ?? (action.imageAsset ? [action.imageAsset] : []));
        setPendingImage(action.imageAsset ?? action.imageAssets?.[0] ?? null);
        setIsImageModalOpen(true);
        break;
      case 'pdf':
        if (!action.pdfAsset) {
          activeAddModalRef.current = null;
          router.replace({
            pathname: '/add',
            params: {
              controlItem: 'pdf',
              controlToken: action.token ?? Date.now().toString(),
            },
          });
          break;
        }
        setPendingPdf(action.pdfAsset ?? null);
        setIsPdfModalOpen(true);
        break;
      case 'video':
        activeAddModalRef.current = null;
        router.replace({
          pathname: '/add',
          params: {
            controlItem: 'video',
            controlToken: action.token ?? Date.now().toString(),
          },
        });
        break;
      case 'audio':
        activeAddModalRef.current = null;
        router.replace({
          pathname: '/add',
          params: {
            controlItem: 'audio',
            controlToken: action.token ?? Date.now().toString(),
          },
        });
        break;
    }
  }, []);

  const requestControlAction = useCallback(
    (action: AddControlAction) => {
      if (!activeAddModalRef.current) {
        openControlAction(action);
        return;
      }

      queuedControlActionRef.current = action;
      setIsNoteDrawerOpen(false);
      setIsLinkModalOpen(false);
      setIsBookModalOpen(false);
      setIsMusicModalOpen(false);
      setIsMovieModalOpen(false);
      setIsGameModalOpen(false);
      setIsEntertainmentModalOpen(false);
      setIsImageModalOpen(false);
      setIsPdfModalOpen(false);
      setIsVideoModalOpen(false);
      setIsAudioModalOpen(false);
    },
    [openControlAction]
  );

  const handleAddModalDismiss = useCallback(() => {
    activeAddModalRef.current = null;
    const queuedAction = queuedControlActionRef.current;
    if (!queuedAction) return;

    queuedControlActionRef.current = null;
    openControlAction(queuedAction);
  }, [openControlAction]);

  const closeAddModal = useCallback((item: Exclude<AddControlItem, 'all'>) => {
    if (!queuedControlActionRef.current) {
      activeAddModalRef.current = null;
    }

    switch (item) {
      case 'note':
        setIsNoteDrawerOpen(false);
        break;
      case 'link':
        setIsLinkModalOpen(false);
        break;
      case 'book':
        setIsBookModalOpen(false);
        break;
      case 'music':
        setIsMusicModalOpen(false);
        break;
      case 'movie':
        setIsMovieModalOpen(false);
        break;
      case 'tvshow':
        setIsTvShowModalOpen(false);
        break;
      case 'game':
        setIsGameModalOpen(false);
        break;
      case 'image':
        setIsImageModalOpen(false);
        setPendingImage(null);
        setPendingImages([]);
        break;
      case 'pdf':
        setIsPdfModalOpen(false);
        setPendingPdf(null);
        break;
      case 'video':
        setIsVideoModalOpen(false);
        setPendingVideo(null);
        break;
      case 'audio':
        setIsAudioModalOpen(false);
        setPendingAudio(null);
        break;
    }
  }, []);

  useEffect(() => {
    const token = newAudioTimestamp || newAudioUri;
    if (!newAudioUri || !token || token === lastOpenedAudioRef.current) return;
    lastOpenedAudioRef.current = token;
    activeAddModalRef.current = 'audio';
    let waveform: number[] | undefined;
    try {
      waveform = parseAudioWaveform(newAudioWaveform ? JSON.parse(newAudioWaveform) : undefined);
    } catch {
      waveform = undefined;
    }
    setPendingAudio({
      uri: newAudioUri,
      durationMs: Number(newAudioDuration) || undefined,
      waveform,
    });
    setIsAudioModalOpen(true);
  }, [newAudioUri, newAudioDuration, newAudioWaveform, newAudioTimestamp]);

  useEffect(() => {
    if (!controlAddItem || !controlToken) return;
    const requestKey = `${controlAddItem}:${controlToken}`;
    if (requestKey === lastOpenedControlRef.current) return;
    lastOpenedControlRef.current = requestKey;
    requestControlAction({ item: controlAddItem, token: controlToken });
  }, [controlAddItem, controlToken, requestControlAction]);

  useEffect(() => {
    if (newNote && newNote !== lastOpenedNoteRef.current) {
      lastOpenedNoteRef.current = newNote;
      requestControlAction({ item: 'note' });
    }
  }, [newNote, requestControlAction]);

  useEffect(() => {
    if (newLink && newLink !== lastOpenedLinkRef.current) {
      lastOpenedLinkRef.current = newLink;
      requestControlAction({ item: 'link' });
    }
  }, [newLink, requestControlAction]);

  useEffect(() => {
    if (newBook && newBook !== lastOpenedBookRef.current) {
      lastOpenedBookRef.current = newBook;
      requestControlAction({ item: 'book' });
    }
  }, [newBook, requestControlAction]);

  useEffect(() => {
    if (newMusic && newMusic !== lastOpenedMusicRef.current) {
      lastOpenedMusicRef.current = newMusic;
      requestControlAction({ item: 'music' });
    }
  }, [newMusic, requestControlAction]);

  useEffect(() => {
    if (newMovie && newMovie !== lastOpenedMovieRef.current) {
      lastOpenedMovieRef.current = newMovie;
      requestControlAction({ item: 'movie' });
    }
  }, [newMovie, requestControlAction]);

  useEffect(() => {
    if (newTvShow && newTvShow !== lastOpenedTvShowRef.current) {
      lastOpenedTvShowRef.current = newTvShow;
      requestControlAction({ item: 'tvshow' });
    }
  }, [newTvShow, requestControlAction]);

  useEffect(() => {
    if (newGame && newGame !== lastOpenedGameRef.current) {
      lastOpenedGameRef.current = newGame;
      requestControlAction({ item: 'game' });
    }
  }, [newGame, requestControlAction]);

  useEffect(() => {
    if (newEntertainment && newEntertainment !== lastOpenedEntertainmentRef.current) {
      lastOpenedEntertainmentRef.current = newEntertainment;
      activeAddModalRef.current = 'book';
      setIsEntertainmentModalOpen(true);
    }
  }, [newEntertainment]);

  useEffect(() => {
    const pdfToken = newPdfTimestamp || newPdfUri;
    if (newPdfUri && pdfToken && pdfToken !== lastOpenedPdfRef.current) {
      lastOpenedPdfRef.current = pdfToken;
      requestControlAction({
        item: 'pdf',
        pdfAsset: { uri: newPdfUri, fileName: newPdfFileName },
      });
    }
  }, [newPdfUri, newPdfFileName, newPdfTimestamp, requestControlAction]);

  useEffect(() => {
    const parsedAssets = newImageAssets
      ? (() => {
          try {
            return JSON.parse(newImageAssets) as PickedImageAsset[];
          } catch {
            return [];
          }
        })()
      : [];
    const imageToken = newImageTimestamp || newImageUri || newImageAssets;
    if (parsedAssets.length > 0 && imageToken && imageToken !== lastOpenedImageRef.current) {
      lastOpenedImageRef.current = imageToken;
      requestControlAction({ item: 'image', imageAssets: parsedAssets.slice(0, 10) });
      return;
    }
    if (newImageUri && imageToken && imageToken !== lastOpenedImageRef.current) {
      lastOpenedImageRef.current = imageToken;
      requestControlAction({
        item: 'image',
        imageAsset: {
          uri: newImageUri,
          fileName: newImageFileName,
          mimeType: newImageMimeType,
        },
      });
    }
  }, [
    newImageUri,
    newImageAssets,
    newImageFileName,
    newImageMimeType,
    newImageTimestamp,
    requestControlAction,
  ]);

  useEffect(() => {
    const token = newVideoTimestamp || newVideoUri;
    if (!newVideoUri || !token || token === lastOpenedVideoRef.current) return;
    lastOpenedVideoRef.current = token;
    activeAddModalRef.current = 'video';
    setPendingVideo({
      uri: newVideoUri,
      fileName: newVideoFileName,
      fileSize: Number(newVideoFileSize) || undefined,
    });
    setIsVideoModalOpen(true);
  }, [newVideoUri, newVideoFileName, newVideoFileSize, newVideoTimestamp]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const toggleCardSelection = useCallback((itemId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleCardLongPress = useCallback(
    (item: LibraryItem) => {
      if (!isEditing) {
        setIsEditing(true);
        setSelectedCardIds(new Set([item.id]));
      } else {
        toggleCardSelection(item.id);
      }
    },
    [isEditing, toggleCardSelection]
  );

  const handleCardPress = useCallback(
    (item: LibraryItem) => {
      if (isEditing) {
        toggleCardSelection(item.id);
      } else {
        router.push({
          pathname: '/card/[id]',
          params: { id: item.id },
        });
      }
    },
    [isEditing, toggleCardSelection]
  );

  const handleCancelEdition = useCallback(() => {
    setIsEditing(false);
    setSelectedCardIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    const idsToDelete = Array.from(selectedCardIds);
    if (idsToDelete.length === 0) return;

    try {
      setIsEditing(false);
      setSelectedCardIds(new Set());
      setExitingCardIds(new Set(idsToDelete));
      await new Promise<void>((resolve) => setTimeout(resolve, 360));

      setAnimateReorder(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const deletion = deleteItems(idsToDelete);
      setTimeout(() => setAnimateReorder(false), 320);
      const backups = await deletion;
      setExitingCardIds(new Set());

      if (backups.length > 0) {
        setRestoreBackup(backups);
        setIsToastVisible(true);
      }
    } catch (error) {
      setAnimateReorder(false);
      setExitingCardIds(new Set());
      console.error('Failed to delete cards:', error);
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Failed to delete cards'
      );
    }
  }, [deleteItems, selectedCardIds]);

  const handleRemoveSelectedFromFolder = useCallback(async () => {
    if (activeFolderKind !== 'tag' || !activeFolderKey || selectedCardIds.size === 0) return;
    const selected =
      state.status === 'ready'
        ? state.result.items.filter((item) => selectedCardIds.has(item.id))
        : [];
    try {
      await updateItems(
        selected.map((item) => ({
          itemId: item.id,
          updates: { tags: item.tags?.filter((tag) => tag.trim() !== activeFolderKey) ?? [] },
        }))
      );
      handleCancelEdition();
    } catch (error) {
      Alert.alert(
        translate('Could not remove cards from folder'),
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [activeFolderKind, activeFolderKey, selectedCardIds, state, updateItems, handleCancelEdition]);

  const handleRestore = useCallback(async () => {
    if (!restoreBackup || restoreBackup.length === 0) return;
    try {
      const backups = restoreBackup;
      setIsToastVisible(false);
      setRestoreBackup(null);
      setEnteringCardIds(new Set(backups.map((backup) => backup.id)));
      setAnimateReorder(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await restoreItems(backups);
      setTimeout(() => {
        setEnteringCardIds(new Set());
        setAnimateReorder(false);
      }, 360);
    } catch (error) {
      setEnteringCardIds(new Set());
      setAnimateReorder(false);
      console.error('Failed to restore cards:', error);
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Failed to restore cards'
      );
    }
  }, [restoreBackup, restoreItems]);

  const handleDismissToast = useCallback(() => {
    setIsToastVisible(false);
    setRestoreBackup(null);
  }, []);

  const isSearching = searchQuery.trim().length > 0;
  const folderId = `${activeFolderKind ? `${activeFolderKind}:${activeFolderKey}` : ''}:${activityToken ?? ''}`;
  const activeType = searchType ?? (selectedType?.folderId === folderId ? selectedType.type : null);
  const activeStatus =
    activeFolderKind === 'status'
      ? (activeFolderKey as MediaProgressStatus)
      : selectedStatus?.folderId === folderId
        ? selectedStatus.status
        : null;
  const hasActiveFilter =
    isSearching ||
    activeType !== null ||
    activeFolderKind !== null ||
    searchTag !== null ||
    activeDay !== null ||
    activeStatus !== null ||
    showArchived;

  const handleTypeFilter = useCallback(
    (type: LibraryItemType) => {
      if (searchType) setSearchQuery('');
      setSelectedType(activeType === type ? null : { type, folderId });
    },
    [activeType, folderId, searchType, setSearchQuery]
  );

  const handleStatusFilter = useCallback(
    (status: MediaProgressStatus) => {
      const targetFolderId = activeFolderKind === 'status' ? `:${activityToken ?? ''}` : folderId;
      if (activeFolderKind === 'status') {
        router.setParams({ folderKind: '', folderKey: '' });
      }
      setSelectedStatus(activeStatus === status ? null : { status, folderId: targetFolderId });
    },
    [activeFolderKind, activeStatus, activityToken, folderId]
  );

  const displayedItems = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (!hasActiveFilter) return filterArchivedItems(state.result.items, showArchived);
    const matches =
      activeType || (isSearching && !searchType)
        ? searchItems({
            ...(activeType ? { type: activeType } : {}),
            ...(isSearching && !searchType ? { searchQuery } : {}),
          })
        : state.result.items;
    return matches.filter(
      (item) =>
        (showArchived ? isArchived(item) : !isArchived(item)) &&
        (!activeStatus || matchesStatus(item, activeStatus)) &&
        (!activeDay || matchesAddedDay(item, activeDay)) &&
        (!searchTag || item.tags?.some((tag) => tag.trim() === searchTag && tag !== 'Archived')) &&
        (activeFolderKind !== 'status' ||
          matchesStatus(item, activeFolderKey as MediaProgressStatus)) &&
        (activeFolderKind !== 'tag' || item.tags?.some((tag) => tag.trim() === activeFolderKey))
    );
  }, [
    state,
    hasActiveFilter,
    activeDay,
    activeType,
    activeStatus,
    isSearching,
    searchQuery,
    searchType,
    searchTag,
    searchItems,
    activeFolderKind,
    activeFolderKey,
    showArchived,
  ]);

  const selectedItems = useMemo(
    () =>
      state.status === 'ready'
        ? state.result.items.filter((item) => selectedCardIds.has(item.id))
        : [],
    [state, selectedCardIds]
  );

  const persistedPinnedItems = useMemo(
    () =>
      state.status === 'ready'
        ? filterArchivedItems(getPinnedItems(state.result.items), false)
        : [],
    [state]
  );
  const pinnedItems = useMemo(() => {
    if (!optimisticPinnedOrder) return persistedPinnedItems;
    const itemsById = new Map(persistedPinnedItems.map((item) => [item.id, item]));
    const reordered = optimisticPinnedOrder
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is LibraryItem => Boolean(item));
    const includedIds = new Set(reordered.map((item) => item.id));
    return [...reordered, ...persistedPinnedItems.filter((item) => !includedIds.has(item.id))];
  }, [optimisticPinnedOrder, persistedPinnedItems]);

  const selectedPinnedCount = selectedItems.filter((item) => item.pinnedAt).length;
  const selectedUnpinnedCount = selectedItems.length - selectedPinnedCount;
  const canPinSelected =
    selectedUnpinnedCount > 0 && pinnedItems.length + selectedUnpinnedCount <= MAX_PINNED_ITEMS;
  const pinActionLabel = canPinSelected
    ? 'Pin selected cards'
    : selectedPinnedCount > 0
      ? 'Unpin selected cards'
      : undefined;

  const handleToggleSelectedPins = useCallback(async () => {
    if (!pinActionLabel) return;
    try {
      const succeeded = await setItemsPinned(
        Array.from(selectedCardIds),
        pinActionLabel === 'Pin selected cards'
      );
      if (!succeeded) Alert.alert(translate('Could not update pinned cards'));
      else if (pinActionLabel === 'Pin selected cards') {
        handleCancelEdition();
        boardListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    } catch (error) {
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Could not update pinned cards'
      );
    }
  }, [handleCancelEdition, pinActionLabel, selectedCardIds, setItemsPinned]);

  const selectedArchivedCount = selectedItems.filter(isArchived).length;
  const archiveActionLabel =
    selectedItems.length > 0 && selectedArchivedCount === selectedItems.length
      ? 'Unarchive selected cards'
      : 'Archive selected cards';
  const handleToggleSelectedArchive = useCallback(async () => {
    if (!selectedItems.length) return;
    const shouldUnarchive = selectedItems.every(isArchived);
    const archivedAt = new Date().toISOString();
    try {
      await updateItems(
        selectedItems.map((item) => ({
          itemId: item.id,
          updates: archiveUpdates(item, shouldUnarchive ? null : archivedAt),
        }))
      );
      handleCancelEdition();
    } catch (error) {
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Could not archive cards'
      );
    }
  }, [selectedItems, updateItems, handleCancelEdition]);

  const handleReorderPinnedItem = useCallback(
    async (itemId: string, targetIndex: number) => {
      const reordered = movePinnedItem(pinnedItems, itemId, targetIndex);
      if (reordered.every((item, index) => item.id === pinnedItems[index]?.id)) return;
      setOptimisticPinnedOrder(reordered.map((item) => item.id));
      const firstPinnedAt = Date.now();
      try {
        await updateItems(
          reordered.map((item, index) => ({
            itemId: item.id,
            updates: {
              pinnedAt: new Date(firstPinnedAt + index).toISOString(),
            },
          }))
        );
      } catch (error) {
        Alert.alert(
          translate('Error'),
          error instanceof Error ? error.message : 'Could not reorder pinned cards'
        );
      } finally {
        setOptimisticPinnedOrder(null);
      }
    },
    [pinnedItems, updateItems]
  );

  const handleRemovePinnedItem = useCallback(
    async (itemId: string) => {
      try {
        const succeeded = await setItemsPinned([itemId], false);
        if (!succeeded) Alert.alert(translate('Could not remove pinned card'));
      } catch (error) {
        Alert.alert(
          translate('Error'),
          error instanceof Error ? error.message : 'Could not remove pinned card'
        );
      }
    },
    [setItemsPinned]
  );

  const reportItemCol = useCallback(
    (index: number, col: number) => {
      itemColsRef.current.set(index, col);
      const total = displayedItems.length;
      if (total === 0) return;

      if (index >= total - 2) {
        let col0 = -1;
        let col1 = -1;
        for (let i = total - 1; i >= 0; i--) {
          const c = itemColsRef.current.get(i);
          if (c === 0 && col0 === -1) col0 = i;
          if (c === 1 && col1 === -1) col1 = i;
          if (col0 !== -1 && col1 !== -1) break;
        }

        setLastIndices((prev) => {
          if (prev.col0 === col0 && prev.col1 === col1) return prev;
          return { col0, col1 };
        });
      }
    },
    [displayedItems.length]
  );

  const gridContextValue = useMemo(
    () => ({
      lastIndices,
      totalItems: displayedItems.length,
      animateReorder,
      reportItemCol,
    }),
    [lastIndices, displayedItems.length, animateReorder, reportItemCol]
  );

  const extraData = useMemo(
    () => ({
      isEditing,
      selectedCardIds,
      searchQuery,
      libraryState: state,
      lastIndices,
      totalItems: displayedItems.length,
    }),
    [isEditing, selectedCardIds, searchQuery, lastIndices, displayedItems.length, state]
  );

  const linkableItems = useMemo(() => {
    const linkedItems = new Map<string, LinkableItem>();
    if (state.status === 'ready') {
      for (const item of state.result.items) {
        if (isLinkableItem(item)) linkedItems.set(item.id, item);
      }
    }
    return linkedItems;
  }, [state]);

  const handleNoteTextChange = useCallback(
    (itemId: string, text: string) => {
      updateItem(itemId, { text } as Partial<LibraryItem>).catch((error) => {
        Alert.alert(
          translate('Error'),
          error instanceof Error ? error.message : 'Could not update note'
        );
      });
    },
    [updateItem]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LibraryItem>) => (
      <BoardDeleteAnimatedCard
        isExiting={exitingCardIds.has(item.id)}
        isEntering={enteringCardIds.has(item.id)}
      >
        <ItemCard
          item={item}
          compactAudioWaveform
          linkedItem={
            (item.type === 'note' || item.type === 'quote') && item.linkedItemId
              ? linkableItems.get(item.linkedItemId)
              : undefined
          }
          isEditing={isEditing}
          onNoteTextChange={handleNoteTextChange}
          isSelected={selectedCardIds.has(item.id)}
          onPress={handleCardPress}
          onLongPress={handleCardLongPress}
        />
      </BoardDeleteAnimatedCard>
    ),
    [
      isEditing,
      selectedCardIds,
      exitingCardIds,
      enteringCardIds,
      handleCardPress,
      handleCardLongPress,
      handleNoteTextChange,
      linkableItems,
    ]
  );

  const renderHeader = useCallback(() => {
    if (state.status !== 'ready') return null;
    const hasIssues = state.result.issues.length > 0;
    const hasDownloads = state.result.pendingDownloads > 0;

    return (
      <View
        testID="board-list-header"
        className={hasActiveFilter ? 'mb-3 pb-2' : 'pb-2'}
        style={{ zIndex: 100, elevation: 100 }}
      >
        <BoardTypeFilters
          selectedType={activeType}
          onSelect={handleTypeFilter}
          selectedStatus={activeStatus}
          onSelectStatus={handleStatusFilter}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((value) => !value)}
          scrollOffsetRef={typeFilterScrollOffsetRef}
        />
        {showArchived && (
          <Text className="mx-4 mt-5 text-center font-sans text-sm text-theme-secondary">
            {archiveRetentionDays === 0
              ? translate('Archived cards are not deleted automatically.')
              : translate('Archived cards are deleted after %{count} days.', {
                  count: archiveRetentionDays,
                })}
          </Text>
        )}

        {!hasActiveFilter && pinnedItems.length > 0 && (
          <BoardPinnedItems
            items={pinnedItems}
            isEditing={isEditing}
            onPress={handleCardPress}
            onReorder={handleReorderPinnedItem}
            onRemove={handleRemovePinnedItem}
          />
        )}

        {hasIssues && (
          <View className="mb-4 flex-row gap-2 rounded-xl bg-theme-amber/10 p-3">
            <TriangleAlert size={16} color={themeColors.amber} />
            <Text className="flex-1 font-sans text-xs text-theme-amber">
              {state.result.issues.length} <LocalizedText>file(s) skipped:</LocalizedText>{' '}
              {state.result.issues.map((i) => `${i.file} (${i.reason})`).join(', ')}
            </Text>
          </View>
        )}

        {hasDownloads && (
          <Text className="mb-4 font-sans text-xs text-theme-muted">
            {state.result.pendingDownloads}{' '}
            <LocalizedText>item(s) still downloading from iCloud…</LocalizedText>
          </Text>
        )}
      </View>
    );
  }, [
    state,
    activeType,
    handleTypeFilter,
    activeStatus,
    handleStatusFilter,
    showArchived,
    archiveRetentionDays,
    hasActiveFilter,
    pinnedItems,
    isEditing,
    handleCardPress,
    handleReorderPinnedItem,
    handleRemovePinnedItem,
    themeColors.amber,
  ]);

  const renderEmpty = useCallback(() => {
    if (hasActiveFilter) {
      const typeLabel = activeType ? translate(CARD_TYPE_LABELS[activeType]).toLowerCase() : null;
      const queryLabel = isSearching && !searchType ? searchQuery.trim() : null;
      return (
        <Centered
          title={translate('No results found')}
          message={
            activeDay
              ? translate('No cards added on %{date} match your filters', {
                  date: parseDayKey(activeDay)?.toLocaleDateString(locale) ?? '',
                })
              : typeLabel
                ? translate(queryLabel ? 'No %{type} matching "%{query}"' : 'No %{type}', {
                    type: typeLabel,
                    query: queryLabel ?? '',
                  })
                : activeStatus
                  ? translate('No cards with status %{status}', {
                      status: translate(
                        activeStatus === 'want'
                          ? 'Want to'
                          : activeStatus === 'in-progress'
                            ? 'In progress'
                            : activeStatus === 'completed'
                              ? 'Done'
                              : 'Abandoned'
                      ),
                    })
                  : activeFolderKind
                    ? translate(
                        searchTag && queryLabel
                          ? 'No cards in %{folder} with tag #%{tag} matching "%{query}"'
                          : searchTag
                            ? 'No cards in %{folder} with tag #%{tag}'
                            : queryLabel
                              ? 'No cards in %{folder} matching "%{query}"'
                              : 'No cards in %{folder}',
                        {
                          folder: folderLabel ?? translate('this folder'),
                          tag: searchTag ?? '',
                          query: queryLabel ?? '',
                        }
                      )
                    : searchTag
                      ? translate(
                          queryLabel
                            ? 'No cards with tag #%{tag} matching "%{query}"'
                            : 'No cards with tag #%{tag}',
                          { tag: searchTag, query: queryLabel ?? '' }
                        )
                      : translate('No cards matching "%{query}"', {
                          query: queryLabel ?? '',
                        })
          }
        >
          <Pressable
            onPress={() => {
              setSearchQuery('');
              clearSearchTag();
              setSelectedType(null);
              setSelectedStatus(null);
              clearFolderFilter();
              clearDateFilter();
            }}
            className="mt-6 rounded-full bg-theme-raised px-5 py-2.5 active:opacity-80"
          >
            <Text className="font-sans-medium text-sm text-theme-heading">
              <LocalizedText>Clear filters</LocalizedText>
            </Text>
          </Pressable>
        </Centered>
      );
    }

    return (
      <Centered
        title={translate('Start your collection here')}
        message={translate('Keep everything you want to revisit here')}
      >
        <Pressable
          onPress={() => router.push('/add')}
          className="mt-8 flex-row items-center justify-center gap-2 rounded-full bg-theme-foreground px-5 py-3"
        >
          <Plus size={18} color={themeColors.inverse} />
          <Text className="font-sans-semibold text-base text-theme-inverse">
            <LocalizedText>Add new item</LocalizedText>
          </Text>
        </Pressable>
      </Centered>
    );
  }, [
    hasActiveFilter,
    activeDay,
    activeType,
    activeStatus,
    isSearching,
    searchType,
    searchQuery,
    searchTag,
    setSearchQuery,
    clearSearchTag,
    activeFolderKind,
    folderLabel,
    clearFolderFilter,
    clearDateFilter,
    locale,
    themeColors.inverse,
  ]);

  useFocusEffect(
    useCallback(() => {
      const overlay = (
        <>
          <SearchBar
            value={searchQuery}
            onChangeText={handleSearchChange}
            blurTarget={searchBlurTargetRef}
            bottomOffset={48 + insets.bottom}
            trailingAction={
              <Button
                accessibilityLabel={translate('Add new item')}
                variant="primary"
                shadowColor={themeColors.foreground}
                shadowOpacity={0.24}
                icon={<Plus size={24} color={themeColors.canvas} strokeWidth={2} />}
                onPress={() => router.push('/add')}
              />
            }
            filters={[
              ...(activeDay
                ? [
                    {
                      kind: 'date' as const,
                      label: parseDayKey(activeDay)!.toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'numeric',
                      }),
                      onRemove: clearDateFilter,
                    },
                  ]
                : []),
              ...(activeFolderKind
                ? [
                    {
                      kind: 'folder' as const,
                      label: folderLabel ?? activeFolderKey ?? '',
                      status:
                        activeFolderKind === 'status'
                          ? (activeFolderKey as MediaProgressStatus)
                          : undefined,
                      onRemove: clearFolderFilter,
                    },
                  ]
                : []),
              ...(searchTag
                ? [
                    {
                      kind: 'tag' as const,
                      label: searchTag,
                      onRemove: clearSearchTag,
                    },
                  ]
                : []),
            ]}
            visible={state.status === 'ready' && !isEditing}
          />
          <CardSelectionBar
            visible={isEditing}
            selectedCount={selectedCardIds.size}
            bottomOffset={60 + insets.bottom}
            onDelete={handleDeleteSelected}
            onAddToFolder={() => setIsFolderPickerOpen(true)}
            removeFromFolderLabel={
              activeFolderKind === 'tag' ? 'Remove selected cards from folder' : undefined
            }
            onRemoveFromFolder={
              activeFolderKind === 'tag' ? handleRemoveSelectedFromFolder : undefined
            }
            pinActionLabel={pinActionLabel}
            onTogglePin={handleToggleSelectedPins}
            archiveActionLabel={archiveActionLabel}
            onToggleArchive={handleToggleSelectedArchive}
            onCancel={handleCancelEdition}
          />
          <RestoreToast
            visible={isToastVisible && !isEditing}
            count={restoreBackup?.length ?? 0}
            bottomOffset={130 + insets.bottom}
            onRestore={handleRestore}
            onDismiss={handleDismissToast}
          />
        </>
      );
      setFloatingTabOverlay(overlay);

      return () => setFloatingTabOverlay((current) => clearOverlayIfCurrent(current, overlay));
    }, [
      setFloatingTabOverlay,
      searchQuery,
      handleSearchChange,
      insets.bottom,
      activeFolderKind,
      locale,
      folderLabel,
      activeFolderKey,
      clearFolderFilter,
      clearDateFilter,
      activeDay,
      archiveActionLabel,
      handleToggleSelectedArchive,
      searchTag,
      clearSearchTag,
      state.status,
      isEditing,
      selectedCardIds.size,
      pinActionLabel,
      handleToggleSelectedPins,
      handleDeleteSelected,
      handleRemoveSelectedFromFolder,
      handleCancelEdition,
      handleRestore,
      handleDismissToast,
      isToastVisible,
      restoreBackup?.length,
      themeColors.foreground,
      themeColors.canvas,
    ])
  );

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <Sortable.PortalProvider>
        <View className="flex-1 bg-theme-canvas">
          {state.status === 'loading' && (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={themeColors.secondary} />
            </View>
          )}

          {state.status === 'error' && (
            <Centered title={translate("Couldn't open the library")} message={state.error}>
              <Pressable
                onPress={goBack}
                className="mt-6 rounded-full bg-theme-raised px-5 py-2.5 active:opacity-80"
              >
                <Text className="font-sans-medium text-sm text-theme-heading">
                  <LocalizedText>Choose another folder</LocalizedText>
                </Text>
              </Pressable>
            </Centered>
          )}

          {state.status === 'ready' && (
            <View className="flex-1">
              <View className="flex-1">
                <BlurTargetView ref={searchBlurTargetRef} style={{ flex: 1 }}>
                  <BoardGridContext.Provider value={gridContextValue}>
                    <FlashList<LibraryItem>
                      ref={boardListRef}
                      data={displayedItems}
                      renderItem={renderItem}
                      keyExtractor={keyExtractor}
                      numColumns={2}
                      masonry
                      optimizeItemArrangement
                      maintainVisibleContentPosition={{ disabled: true }}
                      extraData={extraData}
                      CellRendererComponent={CellRenderer}
                      contentContainerStyle={styles.contentContainer}
                      showsVerticalScrollIndicator={false}
                      keyboardDismissMode="on-drag"
                      keyboardShouldPersistTaps="handled"
                      onScrollBeginDrag={() => setAnimateReorder(false)}
                      onMomentumScrollBegin={() => setAnimateReorder(false)}
                      refreshControl={
                        <RefreshControl
                          refreshing={refreshing}
                          onRefresh={refresh}
                          tintColor={themeColors.secondary}
                        />
                      }
                      ListHeaderComponent={renderHeader()}
                      ListEmptyComponent={renderEmpty}
                    />
                  </BoardGridContext.Provider>
                </BlurTargetView>
              </View>
            </View>
          )}

          <BoardAddModals
            isNoteDrawerOpen={isNoteDrawerOpen}
            isLinkModalOpen={isLinkModalOpen}
            isBookModalOpen={isBookModalOpen}
            isMusicModalOpen={isMusicModalOpen}
            isMovieModalOpen={isMovieModalOpen}
            isTvShowModalOpen={isTvShowModalOpen}
            isGameModalOpen={isGameModalOpen}
            isEntertainmentModalOpen={isEntertainmentModalOpen}
            isImageModalOpen={isImageModalOpen}
            isPdfModalOpen={isPdfModalOpen}
            isVideoModalOpen={isVideoModalOpen}
            isAudioModalOpen={isAudioModalOpen}
            isFolderPickerOpen={isFolderPickerOpen}
            pendingImage={pendingImage}
            pendingImages={pendingImages}
            pendingPdf={pendingPdf}
            pendingVideo={pendingVideo}
            pendingAudio={pendingAudio}
            selectedItems={selectedItems}
            onClose={closeAddModal}
            onDismiss={handleAddModalDismiss}
            onCloseEntertainment={() => {
              if (!queuedControlActionRef.current) activeAddModalRef.current = null;
              setIsEntertainmentModalOpen(false);
            }}
            onCloseFolderPicker={() => setIsFolderPickerOpen(false)}
            onAddedToFolder={handleCancelEdition}
          />
        </View>
      </Sortable.PortalProvider>
    </View>
  );
}

type CellRendererProps = {
  style?: {
    left?: number;
    [key: string]: any;
  };
  children?: React.ReactNode;
  index?: number;
  [key: string]: any;
};

function BoardDeleteAnimatedCard({
  children,
  isExiting,
  isEntering,
}: {
  children: React.ReactNode;
  isExiting: boolean;
  isEntering: boolean;
}) {
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(isExiting ? 0 : 1, { duration: 360 }),
      transform: [{ scale: withTiming(isExiting ? 0.92 : 1, { duration: 360 }) }],
    }),
    [isExiting]
  );

  return (
    <Animated.View
      style={[styles.cardWrapper, animatedStyle]}
      entering={isEntering ? FadeInDown.duration(320) : undefined}
    >
      {children}
    </Animated.View>
  );
}

const CellRenderer = forwardRef<View, CellRendererProps>((props, ref) => {
  const { style, children, index, ...rest } = props;
  const { reportItemCol, animateReorder } = useContext(BoardGridContext);
  const isLeftColumn = !style?.left || style.left < 1;

  useEffect(() => {
    if (typeof index === 'number') {
      reportItemCol(index, isLeftColumn ? 0 : 1);
    }
  }, [index, isLeftColumn, reportItemCol]);

  return (
    <Animated.View
      ref={ref}
      {...rest}
      style={[style]}
      layout={animateReorder ? LinearTransition.duration(260) : undefined}
    >
      {children}
    </Animated.View>
  );
});

CellRenderer.displayName = 'CellRenderer';

function Centered({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="font-sans-medium text-lg text-theme-bright">{title}</Text>
      <Text className="mt-2 text-center font-sans text-base text-theme-muted">{message}</Text>
      {children}
    </View>
  );
}

function keyExtractor(item: LibraryItem): string {
  return item.id;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 4,
    paddingTop: 64,
    paddingBottom: 200,
    flexGrow: 1,
  },
  cardWrapper: {
    width: '100%',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
});
