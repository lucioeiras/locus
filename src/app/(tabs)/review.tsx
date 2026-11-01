import { useAppTheme } from '@/lib/theme';
import { colorWithAlpha } from '@/lib/theme/palette';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Button } from '@/components/Button';
import { ItemCard } from '@/components/cards/ItemCard';
import { useFloatingTabOverlay } from '@/components/menus/FloatingTabOverlay';
import { RestoreToast } from '@/components/menus/RestoreToast';
import { useLibrary } from '@/hooks/useLibrary';
import { advanceReviewQueue, createReviewQueue, getReviewSwipeAction } from '@/lib/library/review';
import { isArchived } from '@/lib/library/archive';
import { getSourceId, type DeletedItemBackup } from '@/lib/library/storage';
import type { LibraryItem } from '@/lib/library/types';
import { LocalizedText } from '@/components/LocalizedText';
import { translate, useLocalization } from '@/lib/i18n';

type ReviewQueueState = { sourceId: string; ids: string[] };

export default function ReviewScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  useLocalization();
  const { source, state, deleteItems, restoreItems } = useLibrary();
  const setFloatingTabOverlay = useFloatingTabOverlay();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const sourceId = getSourceId(source);
  const items = useMemo(
    () =>
      state.status === 'ready'
        ? state.result.items.filter(
            (item) =>
              !isArchived(item) &&
              (!('progressStatus' in item) ||
                (item.progressStatus !== 'in-progress' && item.progressStatus !== 'completed'))
          )
        : [],
    [state]
  );
  const availableIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueState | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<DeletedItemBackup[] | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Promise<DeletedItemBackup[]>[]>([]);
  const [outgoingItem, setOutgoingItem] = useState<LibraryItem | null>(null);
  const translateX = useSharedValue(0);
  const outgoingTranslateX = useSharedValue(0);
  const isLeaving = useSharedValue(false);

  if (state.status === 'ready') {
    if (!reviewQueue || reviewQueue.sourceId !== sourceId) {
      setReviewQueue({ sourceId, ids: createReviewQueue(items) });
    } else if (reviewQueue.ids.some((id) => !availableIds.has(id))) {
      setReviewQueue({
        ...reviewQueue,
        ids: reviewQueue.ids.filter((id) => availableIds.has(id)),
      });
    }
  }

  const queue = useMemo(
    () =>
      reviewQueue?.sourceId === sourceId && state.status === 'ready'
        ? reviewQueue.ids.filter((id) => availableIds.has(id))
        : [],
    [availableIds, reviewQueue, sourceId, state.status]
  );
  const currentItem = useMemo(
    () => items.find((item) => item.id === queue[0]) ?? null,
    [items, queue]
  );
  const advanceQueue = useCallback(
    (excludeId?: string) => {
      setReviewQueue((current) => {
        if (!current || current.sourceId !== sourceId) return current;
        const nextItems = excludeId ? items.filter((item) => item.id !== excludeId) : items;
        return {
          sourceId,
          ids: advanceReviewQueue(current.ids, nextItems),
        };
      });
    },
    [items, sourceId]
  );

  const finishSwipe = useCallback(() => {
    setOutgoingItem(null);
    translateX.set(0);
    isLeaving.set(false);
  }, [isLeaving, translateX]);

  const beginSwipe = useCallback(
    (direction: 'keep' | 'delete', startX = 0, _velocity = 0, startsAtGesturePosition = false) => {
      if (!currentItem || outgoingItem) return;

      const item = currentItem;
      isLeaving.set(true);
      setOutgoingItem(item);
      advanceQueue(direction === 'delete' ? item.id : undefined);
      if (!startsAtGesturePosition) outgoingTranslateX.set(startX);

      if (direction === 'delete') {
        setIsToastVisible(true);

        const previousDelete = pendingDeletes[pendingDeletes.length - 1];
        const deletion = new Promise<DeletedItemBackup[]>((resolve, reject) => {
          const startDelete = () => {
            requestAnimationFrame(() => {
              deleteItems([item.id]).then(resolve, reject);
            });
          };
          if (previousDelete) void previousDelete.catch(() => []).then(startDelete);
          else startDelete();
        });
        setPendingDeletes((current) => [...current, deletion]);
        void deletion.then(
          (backups) => {
            if (backups.length > 0) setRestoreBackup((current) => [...(current ?? []), ...backups]);
            setPendingDeletes((current) => current.filter((pending) => pending !== deletion));
          },
          (error: unknown) => {
            setIsToastVisible(false);
            Alert.alert(
              translate('Error'),
              error instanceof Error ? error.message : 'Failed to delete card'
            );
            setPendingDeletes((current) => current.filter((pending) => pending !== deletion));
          }
        );
      }

      const destination = direction === 'keep' ? windowWidth * 1.05 : -windowWidth * 1.05;
      outgoingTranslateX.set(
        withTiming(destination, { duration: 800, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(finishSwipe);
        })
      );
    },
    [
      advanceQueue,
      currentItem,
      deleteItems,
      finishSwipe,
      isLeaving,
      outgoingItem,
      outgoingTranslateX,
      pendingDeletes,
      windowWidth,
    ]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
          if (!isLeaving.value) translateX.set(event.translationX);
        })
        .onEnd((event) => {
          if (isLeaving.value) return;
          if (outgoingItem) {
            translateX.set(withSpring(0, { damping: 16, stiffness: 180 }));
            return;
          }
          const action = getReviewSwipeAction(
            event.translationX,
            event.velocityX / 1000,
            windowWidth
          );
          if (action) {
            isLeaving.set(true);
            outgoingTranslateX.set(event.translationX);
            scheduleOnRN(beginSwipe, action, event.translationX, event.velocityX, true);
          } else {
            translateX.set(withSpring(0, { damping: 16, stiffness: 180 }));
          }
        }),
    [beginSwipe, isLeaving, outgoingItem, outgoingTranslateX, translateX, windowWidth]
  );

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, windowWidth * 1.4],
      [1, 0.65],
      Extrapolation.CLAMP
    ),
    transform: [
      { translateX: translateX.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-windowWidth, windowWidth],
          [-18, 18],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const centeredCardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ translateX: 0 }, { rotate: '0deg' }],
  }));

  const keepStampAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 20, 70], [0, 0.3, 1], Extrapolation.CLAMP),
  }));

  const deleteStampAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-70, -20, 0], [1, 0.3, 0], Extrapolation.CLAMP),
  }));

  const outgoingCardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(outgoingTranslateX.value),
      [0, windowWidth * 0.8, windowWidth * 1.05],
      [1, 0.8, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      { translateX: outgoingTranslateX.value },
      {
        rotate: `${interpolate(
          outgoingTranslateX.value,
          [-windowWidth, windowWidth],
          [-18, 18],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const outgoingKeepStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(outgoingTranslateX.value, [0, 20, 70], [0, 0.3, 1], Extrapolation.CLAMP),
  }));

  const outgoingDeleteStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(outgoingTranslateX.value, [-70, -20, 0], [1, 0.3, 0], Extrapolation.CLAMP),
  }));

  const handleRestore = useCallback(async () => {
    let backups = restoreBackup ?? [];
    if (pendingDeletes.length > 0) {
      try {
        const pendingBackups = await Promise.all(pendingDeletes);
        backups = [...backups, ...pendingBackups.flat()];
      } catch {
        return;
      }
    }
    if (backups.length === 0) return;
    setIsToastVisible(false);
    setRestoreBackup(null);
    try {
      await restoreItems(backups);
    } catch (error) {
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Failed to restore card'
      );
    }
  }, [pendingDeletes, restoreBackup, restoreItems]);

  const handleDismissToast = useCallback(() => {
    setIsToastVisible(false);
    setRestoreBackup(null);
  }, []);

  const openDetails = useCallback((item: LibraryItem) => {
    router.push({ pathname: '/card/[id]', params: { id: item.id } });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (state.status === 'ready' && items.length > 0) {
        setFloatingTabOverlay(
          <View
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              {
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: 92 + insets.bottom,
              },
            ]}
          >
            <View className="flex-row items-center justify-center gap-4 pt-5">
              <Button
                accessibilityLabel={translate('Delete card')}
                variant="secondary"
                icon={<X size={20} strokeWidth={2} />}
                text={translate('Delete')}
                onPress={() => beginSwipe('delete')}
                disabled={!currentItem || !!outgoingItem}
              />
              <Button
                accessibilityLabel={translate('Keep card')}
                variant="secondary"
                icon={<Check size={20} strokeWidth={2} />}
                text={translate('Keep')}
                onPress={() => beginSwipe('keep')}
                disabled={!currentItem || !!outgoingItem}
              />
            </View>
          </View>
        );
      } else {
        setFloatingTabOverlay(null);
      }

      return () => setFloatingTabOverlay(null);
    }, [
      beginSwipe,
      currentItem,
      insets.bottom,
      items.length,
      outgoingItem,
      setFloatingTabOverlay,
      state.status,
    ])
  );

  return (
    <View className="flex-1 bg-theme-canvas">
      <BoardBackdrop items={items} sourceId={sourceId} />
      <BlurView
        intensity={64}
        tint={isDark ? 'dark' : 'light'}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colorWithAlpha(themeColors.canvas, '8c') },
        ]}
      />

      <SafeAreaView className="flex-1 bg-transparent" edges={['top', 'left', 'right']}>
        <View className="flex-1 px-12" style={{ paddingBottom: 92 + insets.bottom }}>
          {state.status === 'loading' && (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator
                accessibilityLabel={translate('Loading cards')}
                color={themeColors.secondary}
              />
            </View>
          )}

          {state.status === 'error' && (
            <View className="flex-1 items-center justify-center gap-3 px-4">
              <Text className="text-center font-sans text-base text-theme-secondary">
                <LocalizedText>Could not load your library.</LocalizedText>
              </Text>
            </View>
          )}

          {state.status === 'ready' && items.length === 0 && (
            <View className="flex-1 items-center justify-center px-4">
              <Text className="text-center font-sans-semibold text-lg text-theme-foreground">
                <LocalizedText>No cards to review yet</LocalizedText>
              </Text>
              <Text className="mt-2 text-center font-sans text-base text-theme-secondary">
                <LocalizedText>Cards you save will appear here.</LocalizedText>
              </Text>
            </View>
          )}

          {state.status === 'ready' && items.length > 0 && (
            <>
              <View className="flex-1 justify-center">
                {currentItem && (
                  <View
                    className="w-full flex-1 self-center justify-center"
                    style={{ maxWidth: windowWidth * 0.6 }}
                  >
                    <GestureDetector gesture={panGesture}>
                      <Animated.View
                        key={currentItem.id}
                        testID="review-current-card"
                        pointerEvents={outgoingItem ? 'none' : 'auto'}
                        style={[
                          { flex: 1 },
                          outgoingItem ? centeredCardAnimatedStyle : cardAnimatedStyle,
                        ]}
                      >
                        <ScrollView
                          className="flex-1"
                          showsVerticalScrollIndicator={false}
                          contentContainerStyle={{
                            justifyContent: 'center',
                            flexGrow: 1,
                          }}
                        >
                          <ItemCard item={currentItem} onPress={openDetails} />
                        </ScrollView>
                        <Animated.View
                          pointerEvents="none"
                          className="absolute right-3 top-5 rounded-lg border-2 border-emerald-400 px-3 py-1"
                          style={[{ transform: [{ rotate: '-12deg' }] }, keepStampAnimatedStyle]}
                        >
                          <Text className="font-sans-bold text-xl tracking-widest text-theme-green">
                            <LocalizedText>KEEP</LocalizedText>
                          </Text>
                        </Animated.View>
                        <Animated.View
                          pointerEvents="none"
                          className="absolute left-3 top-5 rounded-lg border-2 border-rose-400 px-3 py-1"
                          style={[{ transform: [{ rotate: '12deg' }] }, deleteStampAnimatedStyle]}
                        >
                          <Text className="font-sans-bold text-xl tracking-widest text-theme-pink">
                            <LocalizedText>DELETE</LocalizedText>
                          </Text>
                        </Animated.View>
                      </Animated.View>
                    </GestureDetector>
                  </View>
                )}
                {outgoingItem && (
                  <View
                    className="w-full flex-1 self-center justify-center"
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      { maxWidth: windowWidth * 0.6, alignSelf: 'center' },
                    ]}
                  >
                    <Animated.View
                      key={outgoingItem.id}
                      testID="review-outgoing-card"
                      style={[{ flex: 1 }, outgoingCardAnimatedStyle]}
                    >
                      <ScrollView
                        className="flex-1"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                          justifyContent: 'center',
                          flexGrow: 1,
                        }}
                      >
                        <ItemCard item={outgoingItem} />
                      </ScrollView>
                      <Animated.View
                        pointerEvents="none"
                        className="absolute right-3 top-5 rounded-lg border-2 border-emerald-400 px-3 py-1"
                        style={[{ transform: [{ rotate: '-12deg' }] }, outgoingKeepStampStyle]}
                      >
                        <Text className="font-sans-bold text-xl tracking-widest text-theme-green">
                          <LocalizedText>KEEP</LocalizedText>
                        </Text>
                      </Animated.View>
                      <Animated.View
                        pointerEvents="none"
                        className="absolute left-3 top-5 rounded-lg border-2 border-rose-400 px-3 py-1"
                        style={[{ transform: [{ rotate: '12deg' }] }, outgoingDeleteStampStyle]}
                      >
                        <Text className="font-sans-bold text-xl tracking-widest text-theme-pink">
                          <LocalizedText>DELETE</LocalizedText>
                        </Text>
                      </Animated.View>
                    </Animated.View>
                  </View>
                )}
                {!currentItem && !outgoingItem && (
                  <View className="items-center justify-center">
                    <ActivityIndicator
                      accessibilityLabel={translate('Preparing review cards')}
                      color={themeColors.secondary}
                    />
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        <RestoreToast
          visible={isToastVisible}
          count={(restoreBackup?.length ?? 0) + pendingDeletes.length}
          bottomOffset={160 + insets.bottom}
          onRestore={() => void handleRestore()}
          onDismiss={handleDismissToast}
        />
      </SafeAreaView>
    </View>
  );
}

const BoardBackdrop = memo(
  function BoardBackdrop({ items, sourceId }: { items: LibraryItem[]; sourceId: string }) {
    const previewItems = items.slice(0, 8);
    const columns = [
      previewItems.filter((_, index) => index % 2 === 0),
      previewItems.filter((_, index) => index % 2 === 1),
    ];

    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 24 }}
        >
          <View className="flex-row items-start gap-3">
            {columns.map((column, columnIndex) => (
              <View key={columnIndex} className="flex-1 gap-3">
                {column.map((item) => (
                  <View key={item.id} testID={`review-background-card-${item.id}`}>
                    <ItemCard
                      item={item}
                      compactAudioWaveform
                      compactMedia
                      compactTikTokThumbnail
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  },
  (previous, next) => previous.sourceId === next.sourceId && previous.items === next.items
);
