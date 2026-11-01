import BoardScreen from '@/app/(tabs)/board';
import type { LibraryItem } from '@/lib/library/types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect as mockUseEffect } from 'react';
import { Pressable as MockPressable, Text as MockText, View as MockView } from 'react-native';

let mockParams: Record<string, string> = {};
const mockSetParams = jest.fn();
const mockOverlay = jest.fn();
let mockQuery = '';
let mockTag: string | null = null;
const mockSetQuery = jest.fn();
const mockClearTag = jest.fn();
const mockSetItemsPinned = jest.fn();
const mockScrollToOffset = jest.fn();
const mockFlashListProps = jest.fn();
const mockItems: LibraryItem[] = [
  {
    id: 'today',
    type: 'note',
    version: 1,
    text: 'Today note',
    pinnedAt: '2026-10-12T12:00:00.000Z',
    tags: ['keep'],
    createdAt: new Date(2026, 9, 13, 12).toISOString(),
    updatedAt: '',
  },
  {
    id: 'yesterday',
    type: 'note',
    version: 1,
    text: 'Yesterday note',
    createdAt: new Date(2026, 9, 12, 12).toISOString(),
    updatedAt: '',
  },
];
jest.mock('expo-router', () => ({
  router: { setParams: (...args: unknown[]) => mockSetParams(...args) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => mockUseEffect(callback, [callback]),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/hooks/useLibrary', () => ({
  useLibrary: () => ({
    state: { status: 'ready', result: { items: mockItems, issues: [], pendingDownloads: 0 } },
    searchQuery: mockQuery,
    searchTag: mockTag,
    searchType: null,
    setSearchQuery: mockSetQuery,
    clearSearchTag: mockClearTag,
    setItemsPinned: (...args: unknown[]) => mockSetItemsPinned(...args),
    searchItems: ({ type, searchQuery }: { type?: string; searchQuery?: string }) =>
      mockItems.filter(
        (item) =>
          (!type || item.type === type) &&
          (!searchQuery || ('text' in item && (item.text ?? '').includes(searchQuery)))
      ),
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-reanimated', () => ({
  useAnimatedRef: () => ({ current: null }),
}));
jest.mock('react-native-sortables', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable: TestPressable, View: TestView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      PortalProvider: ({ children }: { children: React.ReactNode }) => children,
      Flex: ({ children }: { children: React.ReactNode }) => <TestView>{children}</TestView>,
      Touchable: ({ children, onTap }: { children: React.ReactNode; onTap?: () => void }) => (
        <TestPressable onPress={onTap}>{children}</TestPressable>
      ),
    },
  };
});
jest.mock('@/components/menus/FloatingTabOverlay', () => ({
  useFloatingTabOverlay: () => mockOverlay,
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: (() => {
    const React = jest.requireActual<typeof import('react')>('react');
    const MockFlashList = React.forwardRef(
      (
        {
          data,
          renderItem,
          ListHeaderComponent,
          ListEmptyComponent,
          maintainVisibleContentPosition,
        }: any,
        ref: any
      ) => {
        mockFlashListProps({ maintainVisibleContentPosition });
        React.useImperativeHandle(ref, () => ({
          scrollToOffset: (...args: unknown[]) => mockScrollToOffset(...args),
        }));
        const renderListComponent = (component: any) =>
          React.isValidElement(component)
            ? component
            : component
              ? React.createElement(component)
              : null;
        return (
          <MockView>
            {renderListComponent(ListHeaderComponent)}
            {data.length
              ? data.map((item: LibraryItem) => (
                  <MockView key={item.id}>{renderItem({ item, index: 0 })}</MockView>
                ))
              : renderListComponent(ListEmptyComponent)}
          </MockView>
        );
      }
    );
    MockFlashList.displayName = 'MockFlashList';
    return MockFlashList;
  })(),
}));
jest.mock('@/components/cards/ItemCard', () => ({
  ItemCard: ({
    item,
    isSelected,
    onPress,
    onLongPress,
  }: {
    item: LibraryItem;
    isSelected?: boolean;
    onPress?: (item: LibraryItem) => void;
    onLongPress?: (item: LibraryItem) => void;
  }) => (
    <MockPressable
      testID={`card-${item.id}-${isSelected ? 'selected' : 'not-selected'}`}
      onPress={() => onPress?.(item)}
      onLongPress={() => onLongPress?.(item)}
      accessibilityState={{ selected: isSelected }}
    >
      <MockText>{'text' in item ? item.text : item.id}</MockText>
    </MockPressable>
  ),
}));
jest.mock('@/components/menus/CardSelectionBar', () => ({
  CardSelectionBar: ({
    visible,
    selectedCount,
    pinActionLabel,
    onTogglePin,
  }: {
    visible: boolean;
    selectedCount: number;
    pinActionLabel?: string;
    onTogglePin?: () => void;
  }) =>
    visible ? (
      <>
        <MockText>{`${selectedCount} selected`}</MockText>
        {pinActionLabel ? (
          <MockPressable testID="pin-selected-cards" onPress={onTogglePin}>
            <MockText>{pinActionLabel}</MockText>
          </MockPressable>
        ) : null}
      </>
    ) : null,
}));
jest.mock('@/components/menus/RestoreToast', () => ({ RestoreToast: () => null }));
jest.mock('@/components/modals/AddToFolderModal', () => ({ AddToFolderModal: () => null }));
jest.mock('@/components/modals/NewAudioModal', () => ({ NewAudioModal: () => null }));
jest.mock('@/components/modals/NewBookModal', () => ({ NewBookModal: () => null }));
jest.mock('@/components/modals/NewEntertainmentModal', () => ({
  NewEntertainmentModal: () => null,
}));
jest.mock('@/components/modals/NewGameModal', () => ({ NewGameModal: () => null }));
jest.mock('@/components/modals/NewImageModal', () => ({ NewImageModal: () => null }));
jest.mock('@/components/modals/NewLinkModal', () => ({ NewLinkModal: () => null }));
jest.mock('@/components/modals/NewMovieModal', () => ({ NewMovieModal: () => null }));
jest.mock('@/components/modals/NewTvShowModal', () => ({ NewTvShowModal: () => null }));
jest.mock('@/components/modals/NewMusicModal', () => ({ NewMusicModal: () => null }));
jest.mock('@/components/modals/NewNoteModal', () => ({ NewNoteModal: () => null }));
jest.mock('@/components/modals/NewPdfModal', () => ({ NewPdfModal: () => null }));
jest.mock('@/components/modals/NewVideoModal', () => ({ NewVideoModal: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { addedOn: '2026-10-13', activityToken: '1' };
  mockQuery = '';
  mockTag = null;
  mockSetItemsPinned.mockResolvedValue(true);
});
it('filters loaded cards by the selected day', async () => {
  await render(<BoardScreen />);
  expect(screen.getByText('Today note')).toBeTruthy();
  expect(screen.queryByText('Yesterday note')).toBeNull();
});
it('preserves the board scroll offset when search results change', async () => {
  mockParams = {};
  const view = await render(<BoardScreen />);

  mockQuery = 'Today';
  await view.rerender(<BoardScreen />);
  mockQuery = '';
  await view.rerender(<BoardScreen />);

  expect(mockFlashListProps).toHaveBeenLastCalledWith({
    maintainVisibleContentPosition: { disabled: true },
  });
});
it('ignores invalid dates', async () => {
  mockParams.addedOn = '2026-02-31';
  await render(<BoardScreen />);
  expect(screen.getByText('Yesterday note')).toBeTruthy();
});
it('combines the day with text and tag filters and clears all filters from the empty state', async () => {
  mockQuery = 'Yesterday';
  mockTag = 'keep';
  await render(<BoardScreen />);
  expect(screen.getByText('No results found')).toBeTruthy();
  await fireEvent.press(screen.getByText('Clear filters'));
  expect(mockSetQuery).toHaveBeenCalledWith('');
  expect(mockClearTag).toHaveBeenCalled();
  expect(mockSetParams).toHaveBeenCalledWith({ addedOn: '' });
});
it('combines date and type filters and resets type when opening the day again', async () => {
  const view = await render(<BoardScreen />);
  await fireEvent.press(screen.getByText('Books'));
  expect(screen.getByText('No results found')).toBeTruthy();
  mockParams = { ...mockParams, activityToken: '2' };
  await view.rerender(<BoardScreen />);
  expect(screen.getByText('Today note')).toBeTruthy();
});

it('keeps the type filter when the date filter is removed', async () => {
  const view = await render(<BoardScreen />);
  await fireEvent.press(screen.getByText('Books'));
  mockParams = { ...mockParams, addedOn: '' };
  await view.rerender(<BoardScreen />);
  expect(screen.getByText('No results found')).toBeTruthy();
  expect(screen.queryByText('Today note')).toBeNull();
});

it('shows pinned cards only when the board has no active filters', async () => {
  mockParams = {};
  const view = await render(<BoardScreen />);
  expect(screen.getByTestId('pinned-cards-container')).toBeTruthy();

  mockQuery = 'Today';
  await view.rerender(<BoardScreen />);
  expect(screen.queryByTestId('pinned-cards-container')).toBeNull();
});

it('adds breathing room below the filters when the pinned row is hidden', async () => {
  mockParams = {};
  const view = await render(<BoardScreen />);
  expect(screen.getByTestId('board-list-header').props.className).toBe('pb-2');

  mockQuery = 'Today';
  await view.rerender(<BoardScreen />);
  expect(screen.getByTestId('board-list-header').props.className).toBe('mb-3 pb-2');
});

it('keeps the pinned row visible but excludes it from card selection', async () => {
  mockParams = {};
  await render(<BoardScreen />);
  expect(screen.getByTestId('pinned-cards-container')).toBeTruthy();

  const duplicateCards = screen.getAllByText('Today note');
  await fireEvent(duplicateCards[1], 'longPress');
  expect(screen.getByTestId('pinned-cards-container')).toBeTruthy();
  expect(screen.getByTestId('card-today-selected')).toBeTruthy();

  const pinnedCardWhileSelecting = screen.getAllByTestId('card-today-not-selected')[0];
  await fireEvent(pinnedCardWhileSelecting, 'longPress');
  await fireEvent.press(pinnedCardWhileSelecting);
  expect(screen.getByTestId('card-today-selected')).toBeTruthy();
});

it('exits selection and scrolls to the top after pinning selected cards', async () => {
  mockParams = {};
  await render(<BoardScreen />);

  await fireEvent(screen.getByTestId('card-yesterday-not-selected'), 'longPress');
  const overlayView = await render(mockOverlay.mock.calls.at(-1)?.[0]);
  await fireEvent.press(overlayView.getByTestId('pin-selected-cards'));

  expect(mockSetItemsPinned).toHaveBeenCalledWith(['yesterday'], true);
  expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  await overlayView.rerender(mockOverlay.mock.calls.at(-1)?.[0]);
  expect(overlayView.queryByTestId('pin-selected-cards')).toBeNull();
});
