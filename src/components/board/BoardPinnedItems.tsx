import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
import Sortable, {
  type DragMoveParams,
  type DragStartParams,
  type SortableFlexDragEndParams,
} from 'react-native-sortables';

import {
  getPinnedDropTarget,
  PINNED_DROP_ANIMATION_DURATION,
  schedulePinnedReorder,
  schedulePinnedRemoval,
} from '@/components/board/pinnedDrop';
import { ItemCard } from '@/components/cards/ItemCard';
import type { LibraryItem } from '@/lib/library/types';

const PINNED_CARD_SCALE = 0.7;

function getDefaultAspectRatio(item: LibraryItem): number {
  switch (item.type) {
    case 'book':
      return item.coverAspectRatio && item.coverAspectRatio > 0 ? item.coverAspectRatio : 2 / 3;
    case 'movie':
      return 2 / 3;
    case 'tvshow':
      return 4 / 3;
    case 'game':
    case 'music':
    case 'image':
      return 1;
    default:
      return 1.5;
  }
}

type Props = {
  items: LibraryItem[];
  isEditing: boolean;
  onPress: (item: LibraryItem) => void;
  onReorder: (itemId: string, targetIndex: number) => void | Promise<void>;
  onRemove: (itemId: string) => void | Promise<void>;
};

export function PinnedItemPreview({
  item,
  width,
  onPress,
  onAspectRatioChange,
}: {
  item: LibraryItem;
  width: number;
  onPress?: Props['onPress'];
  onAspectRatioChange?: (ratio: number) => void;
}) {
  const hideTitle = [
    'note',
    'quote',
    'book',
    'music',
    'movie',
    'tvshow',
    'image',
    'video',
    'game',
    'reddit',
  ].includes(item.type);

  return (
    <View
      style={{
        width: width / 0.7,
        height: 100 / 0.7,
        transform: [{ scale: PINNED_CARD_SCALE }],
        transformOrigin: 'top left',
      }}
    >
      <ItemCard
        item={item}
        hideTitleAndAuthor={hideTitle}
        compactAudioWaveform
        stackedAudioControls={item.type === 'audio'}
        compactTikTokThumbnail
        compactMedia={item.type === 'tweet' || item.type === 'reddit'}
        fixedHeight={100 / 0.7}
        fixedHeightBackgroundColor={item.type === 'music' ? 'transparent' : undefined}
        onPinnedAspectRatioChange={onAspectRatioChange}
        onPress={onPress}
      />
    </View>
  );
}

type PinnedSortableCardProps = {
  item: LibraryItem;
  width: number;
  onPress: Props['onPress'];
  onAspectRatioChange: (itemId: string, ratio: number) => void;
};

function arePinnedCardPropsEqual(previous: PinnedSortableCardProps, next: PinnedSortableCardProps) {
  if (
    previous.item.id !== next.item.id ||
    previous.width !== next.width ||
    previous.onPress !== next.onPress ||
    previous.onAspectRatioChange !== next.onAspectRatioChange
  ) {
    return false;
  }

  const {
    pinnedAt: _previousPinnedAt,
    updatedAt: _previousUpdatedAt,
    ...previousPreview
  } = previous.item;
  const { pinnedAt: _nextPinnedAt, updatedAt: _nextUpdatedAt, ...nextPreview } = next.item;
  return JSON.stringify(previousPreview) === JSON.stringify(nextPreview);
}

const PinnedSortableCard = memo(function PinnedSortableCard({
  item,
  width,
  onPress,
  onAspectRatioChange,
}: PinnedSortableCardProps) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const handleAspectRatioChange = useCallback(
    (ratio: number) => onAspectRatioChange(item.id, ratio),
    [item.id, onAspectRatioChange]
  );

  return (
    <View
      style={{
        width,
        height: 100,
        overflow: item.type === 'music' ? 'visible' : 'hidden',
      }}
    >
      <Sortable.Touchable onTap={handlePress} style={{ width, height: 100 }}>
        <PinnedItemPreview
          item={item}
          width={width}
          onAspectRatioChange={handleAspectRatioChange}
        />
      </Sortable.Touchable>
    </View>
  );
}, arePinnedCardPropsEqual);

export function BoardPinnedItems({ items, isEditing, onPress, onReorder, onRemove }: Props) {
  const containerRef = useRef<View>(null);
  const scrollViewRef = useAnimatedRef<ScrollView>();
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const draggedItemIdRef = useRef<string | null>(null);
  const dragStartedRef = useRef(false);
  const isEditingRef = useRef(isEditing);
  const onPressRef = useRef(onPress);
  useLayoutEffect(() => {
    isEditingRef.current = isEditing;
    onPressRef.current = onPress;
  }, [isEditing, onPress]);
  const [loadedAspectRatios, setLoadedAspectRatios] = useState<Record<string, number>>({});
  const handlePinnedCardPress = useCallback((item: LibraryItem) => {
    if (!isEditingRef.current) onPressRef.current(item);
  }, []);
  const getCardWidth = useCallback(
    (item: LibraryItem) => {
      const ratio = loadedAspectRatios[item.id] ?? getDefaultAspectRatio(item);
      // Music artwork occupies about 78% of its card width; compensate so the artwork is 100px tall.
      return (100 * ratio) / (item.type === 'music' ? 0.78 : 1);
    },
    [loadedAspectRatios]
  );
  const handleAspectRatioChange = useCallback((itemId: string, ratio: number) => {
    if (Number.isFinite(ratio) && ratio > 0) {
      setLoadedAspectRatios((previous) => ({ ...previous, [itemId]: ratio }));
    }
  }, []);

  const handleDragStart = useCallback(
    ({ fromIndex }: DragStartParams) => {
      dragStartedRef.current = true;
      draggedItemIdRef.current = items[fromIndex]?.id ?? null;
      lastTouchRef.current = null;
    },
    [items]
  );
  const handleDragMove = useCallback(({ touchData }: DragMoveParams) => {
    lastTouchRef.current = { x: touchData.absoluteX, y: touchData.absoluteY };
  }, []);
  const handleDragEnd = useCallback(
    ({ toIndex }: SortableFlexDragEndParams) => {
      if (!dragStartedRef.current) return;
      dragStartedRef.current = false;

      const itemId = draggedItemIdRef.current;
      draggedItemIdRef.current = null;
      if (!itemId) return;
      const touch = lastTouchRef.current;
      lastTouchRef.current = null;
      if (!touch) {
        if (toIndex !== items.findIndex((item) => item.id === itemId)) {
          schedulePinnedReorder(onReorder, itemId, toIndex);
        }
        return;
      }

      containerRef.current?.measureInWindow((x, y, width, height) => {
        const target = getPinnedDropTarget(touch, { x, y, width, height }, toIndex);
        if (target.type === 'remove') {
          // Let Sortables finish its drop animation before changing its children.
          schedulePinnedRemoval(onRemove, itemId);
        } else if (target.index !== items.findIndex((item) => item.id === itemId)) {
          schedulePinnedReorder(onReorder, itemId, target.index);
        }
      });
    },
    [items, onRemove, onReorder]
  );

  const cardElements = useMemo(
    () =>
      items.map((item) => (
        <PinnedSortableCard
          key={item.id}
          item={item}
          width={getCardWidth(item)}
          onPress={handlePinnedCardPress}
          onAspectRatioChange={handleAspectRatioChange}
        />
      )),
    [getCardWidth, handleAspectRatioChange, handlePinnedCardPress, items]
  );

  return (
    <View
      ref={containerRef}
      testID="pinned-cards-container"
      className="mx-3 mb-3 mt-5 rounded-xl border border-theme-raised p-3"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <ScrollView
        ref={scrollViewRef}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews={false}
        style={{ marginHorizontal: -12 }}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        scrollEventThrottle={16}
      >
        <Sortable.Flex
          scrollableRef={scrollViewRef}
          autoScrollDirection="horizontal"
          flexDirection="row"
          flexWrap="nowrap"
          alignItems="flex-start"
          overflow="hidden"
          gap={8}
          overDrag="both"
          dragActivationDelay={350}
          dragActivationFailOffset={12}
          activationAnimationDuration={120}
          dropAnimationDuration={PINNED_DROP_ANIMATION_DURATION}
          activeItemScale={1.04}
          inactiveItemOpacity={1}
          itemEntering={null}
          itemExiting={null}
          reorderTriggerOrigin="touch"
          bringToFrontWhenActive
          sortEnabled={!isEditing}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          {cardElements}
        </Sortable.Flex>
      </ScrollView>
    </View>
  );
}
