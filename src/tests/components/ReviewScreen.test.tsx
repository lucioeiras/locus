import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import ReviewScreen from '@/app/(tabs)/review';
import { FloatingTabOverlayProvider } from '@/components/menus/FloatingTabOverlay';
import type { LibraryState } from '@/hooks/useLibrary';
import type { LibraryItem } from '@/lib/library/types';

const mockPush = jest.fn();
const mockDeleteItems = jest.fn();
const mockRestoreItems = jest.fn();
const mockSpringDestinations: number[] = [];
const mockSharedValueWrites: number[][] = [];
let mockDeferSpringCompletion = false;
let mockSpringCompletion: ((finished: boolean) => void) | undefined;
const mockGestureCallbacks: {
  onUpdate?: (event: { translationX: number }) => void;
  onEnd?: (event: { translationX: number; velocityX: number }) => void;
} = {};
let mockState: LibraryState;

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
  };
});
jest.mock('@/hooks/useLibrary', () => ({
  useLibrary: () => ({
    source: { kind: 'local', name: 'Test library' },
    state: mockState,
    deleteItems: (...args: unknown[]) => mockDeleteItems(...args),
    restoreItems: (...args: unknown[]) => mockRestoreItems(...args),
  }),
}));
jest.mock('@/lib/library/storage', () => ({ getSourceId: () => 'test-source' }));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (...args: unknown[]) => unknown, ...args: unknown[]) =>
    callback(...args),
}));
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { cubic: 'cubic', out: (easing: unknown) => easing },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number, input: number[], output: number[]) => {
      if (value <= input[0]) return output[0];
      for (let index = 1; index < input.length; index += 1) {
        if (value <= input[index]) {
          const progress = (value - input[index - 1]) / (input[index] - input[index - 1]);
          return output[index - 1] + progress * (output[index] - output[index - 1]);
        }
      }
      return output[output.length - 1];
    },
    useAnimatedStyle: (getStyle: () => unknown) => getStyle(),
    useSharedValue: (value: number) => {
      const reference = React.useRef(
        null as null | { value: number; get: () => number; set: (next: number) => void }
      );
      if (!reference.current) {
        const writes = [value];
        mockSharedValueWrites.push(writes);
        reference.current = {
          value,
          get() {
            return this.value;
          },
          set(nextValue: number) {
            this.value = nextValue;
            writes.push(nextValue);
          },
        };
      }
      return reference.current;
    },
    withSpring: (toValue: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
      if (typeof toValue === 'number') mockSpringDestinations.push(toValue);
      if (mockDeferSpringCompletion) mockSpringCompletion = callback;
      else callback?.(true);
      return toValue;
    },
    withTiming: (toValue: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
      if (typeof toValue === 'number') mockSpringDestinations.push(toValue);
      if (mockDeferSpringCompletion) mockSpringCompletion = callback;
      else callback?.(true);
      return toValue;
    },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const gesture = {
    activeOffsetX: () => gesture,
    failOffsetY: () => gesture,
    enabled: () => gesture,
    onUpdate: (callback: (event: { translationX: number }) => void) => {
      mockGestureCallbacks.onUpdate = callback;
      return gesture;
    },
    onEnd: (callback: (event: { translationX: number; velocityX: number }) => void) => {
      mockGestureCallbacks.onEnd = callback;
      return gesture;
    },
  };
  return {
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/Button', () => ({
  Button: ({
    accessibilityLabel,
    onPress,
    text,
  }: {
    accessibilityLabel: string;
    onPress: () => void;
    text?: string;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
      >
        <Text>{text ?? accessibilityLabel}</Text>
      </Pressable>
    );
  },
}));
jest.mock('@/components/cards/ItemCard', () => ({
  ItemCard: ({ item, onPress }: { item: LibraryItem; onPress: (item: LibraryItem) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID="review-item-card" onPress={() => onPress(item)}>
        <Text>{item.id}</Text>
      </Pressable>
    );
  },
}));
jest.mock('@/components/menus/RestoreToast', () => ({
  RestoreToast: ({ visible, onRestore }: { visible: boolean; onRestore: () => void }) => {
    if (!visible) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityLabel="Restore deleted cards" onPress={onRestore}>
        <Text>Restore deleted cards</Text>
      </Pressable>
    );
  },
}));

const first: LibraryItem = {
  id: 'first',
  type: 'note',
  text: 'First note',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const second = { ...first, id: 'second', text: 'Second note' };
const ready = (items: LibraryItem[]) => {
  mockState = { status: 'ready', result: { items, issues: [], pendingDownloads: 0 } };
};
const renderReview = () => render(<ReviewScreen />, { wrapper: FloatingTabOverlayProvider });

beforeEach(() => {
  jest.clearAllMocks();
  mockSpringDestinations.length = 0;
  mockSharedValueWrites.length = 0;
  mockDeferSpringCompletion = false;
  mockSpringCompletion = undefined;
  mockDeleteItems.mockResolvedValue([{}]);
  mockRestoreItems.mockResolvedValue(undefined);
  ready([first, second]);
});

it('shows loading, error, and empty-library states', async () => {
  mockState = { status: 'loading' };
  const view = await renderReview();
  expect(screen.getByLabelText('Loading cards')).toBeTruthy();

  mockState = { status: 'error', error: 'Unavailable' };
  await view.rerender(<ReviewScreen />);
  expect(screen.getByText('Could not load your library.')).toBeTruthy();

  ready([]);
  await view.rerender(<ReviewScreen />);
  expect(screen.getByText('No cards to review yet')).toBeTruthy();
});

it('keeps a card, advances, and opens its detail page when tapped', async () => {
  await renderReview();
  const initialCard = within(screen.getByTestId('review-current-card'));
  const renderedId = initialCard.getByText(/first|second/).props.children;

  await fireEvent.press(initialCard.getByTestId('review-item-card'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/card/[id]', params: { id: renderedId } });

  await fireEvent.press(screen.getByLabelText('Keep card'));
  expect(
    within(screen.getByTestId('review-current-card')).getByText(
      renderedId === 'first' ? 'second' : 'first'
    )
  ).toBeTruthy();
  expect(mockDeleteItems).not.toHaveBeenCalled();
});

const book = (
  progressStatus?: 'want' | 'in-progress' | 'completed' | 'abandoned'
): LibraryItem => ({
  ...first,
  id: 'book',
  type: 'book',
  title: 'Book',
  isbn: '',
  authors: [],
  progressStatus,
});

it.each(['in-progress', 'completed'] as const)(
  'excludes %s cards from review and subsequent rounds',
  async (status) => {
    ready([first, book(status)]);
    await renderReview();

    expect(screen.queryByText('book')).toBeNull();
    expect(screen.queryByTestId('review-background-card-book')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Keep card'));
    expect(within(screen.getByTestId('review-current-card')).getByText('first')).toBeTruthy();
    expect(screen.queryByText('book')).toBeNull();
  }
);

it('excludes archived cards from review and its background previews', async () => {
  ready([first, { ...book('want'), archivedAt: '2026-10-30T12:00:00.000Z' }]);
  await renderReview();

  expect(screen.queryByTestId('review-background-card-book')).toBeNull();
  expect(screen.queryByText('Book')).toBeNull();
  expect(within(screen.getByTestId('review-current-card')).getByText('first')).toBeTruthy();
});

it.each(['want', 'abandoned', undefined] as const)(
  'keeps cards with status %s eligible for review',
  async (status) => {
    ready([book(status)]);
    await renderReview();

    expect(within(screen.getByTestId('review-current-card')).getByText('book')).toBeTruthy();
  }
);

it.each(['in-progress', 'completed'] as const)(
  'shows the empty state when every card is %s',
  async (status) => {
    ready([book(status)]);
    await renderReview();

    expect(screen.getByText('No cards to review yet')).toBeTruthy();
    expect(screen.queryByTestId('review-current-card')).toBeNull();
    expect(screen.queryByText('book')).toBeNull();
  }
);

it.each(['in-progress', 'completed'] as const)(
  'removes a queued card when its status changes to %s',
  async (status) => {
    ready([book('want'), first]);
    const view = await renderReview();

    ready([book(status), first]);
    await view.rerender(<ReviewScreen />);

    expect(screen.queryByText('book')).toBeNull();
    expect(within(screen.getByTestId('review-current-card')).getByText('first')).toBeTruthy();
  }
);

it('shows the next card underneath the outgoing card immediately after keeping', async () => {
  mockDeferSpringCompletion = true;
  await renderReview();
  const initialId = within(screen.getByTestId('review-current-card')).getByText(/first|second/)
    .props.children;

  await fireEvent.press(screen.getByLabelText('Keep card'));

  expect(
    within(screen.getByTestId('review-current-card')).getByText(
      initialId === 'first' ? 'second' : 'first'
    )
  ).toBeTruthy();
  expect(within(screen.getByTestId('review-outgoing-card')).getByText(initialId)).toBeTruthy();

  await act(async () => mockSpringCompletion?.(true));
  expect(screen.queryByTestId('review-outgoing-card')).toBeNull();
});

it('deletes after a left drag crosses the swipe threshold', async () => {
  await renderReview();
  const initialId = within(screen.getByTestId('review-current-card')).getByText(/first|second/)
    .props.children;

  await act(async () => {
    mockGestureCallbacks.onUpdate?.({ translationX: -80 });
    mockGestureCallbacks.onEnd?.({ translationX: -140, velocityX: 0 });
    await Promise.resolve();
  });

  expect(mockDeleteItems).toHaveBeenCalledWith([initialId]);
  expect(mockSpringDestinations[0]).toBeLessThan(0);
});

it('continues the outgoing card from the gesture release position', async () => {
  mockDeferSpringCompletion = true;
  await renderReview();

  await act(async () => {
    mockGestureCallbacks.onUpdate?.({ translationX: -140 });
    mockGestureCallbacks.onEnd?.({ translationX: -140, velocityX: 0 });
    await Promise.resolve();
  });

  expect(mockSharedValueWrites[0].at(-1)).toBe(-140);
  expect(mockSharedValueWrites[1]).toContain(-140);
});

it('keeps after a right drag crosses the swipe threshold', async () => {
  await renderReview();
  const initialId = within(screen.getByTestId('review-current-card')).getByText(/first|second/)
    .props.children;

  await act(async () => {
    mockGestureCallbacks.onUpdate?.({ translationX: 80 });
    mockGestureCallbacks.onEnd?.({ translationX: 140, velocityX: 0 });
    await Promise.resolve();
  });

  expect(
    within(screen.getByTestId('review-current-card')).getByText(
      initialId === 'first' ? 'second' : 'first'
    )
  ).toBeTruthy();
  expect(mockDeleteItems).not.toHaveBeenCalled();
  expect(mockSpringDestinations[0]).toBeGreaterThan(0);
});

it('deletes a card and restores it through the undo action', async () => {
  await renderReview();
  const currentId = within(screen.getByTestId('review-current-card')).getByText(/first|second/)
    .props.children;

  await fireEvent.press(screen.getByLabelText('Delete card'));
  expect(mockDeleteItems).toHaveBeenCalledWith([currentId]);
  expect(screen.getByLabelText('Restore deleted cards')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Restore deleted cards'));
  expect(mockRestoreItems).toHaveBeenCalledWith([{}]);
});

it('advances and shows the restore toast while deletion is still persisting', async () => {
  let resolveDelete: ((backups: object[]) => void) | undefined;
  mockDeleteItems.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
  );

  await renderReview();
  const initialId = within(screen.getByTestId('review-current-card')).getByText(/first|second/)
    .props.children;

  await fireEvent.press(screen.getByLabelText('Delete card'));

  expect(
    within(screen.getByTestId('review-current-card')).getByText(
      initialId === 'first' ? 'second' : 'first'
    )
  ).toBeTruthy();
  expect(screen.getByLabelText('Restore deleted cards')).toBeTruthy();

  await act(async () => {
    resolveDelete?.([{}]);
  });
});
