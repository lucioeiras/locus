import { ThemedModal as Modal } from '@/components/ThemedModal';
import { translate, useLocalization } from '@/lib/i18n';
import { Image as ExpoImage, type ImageLoadEventData } from 'expo-image';
import { X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedExpoImage = Animated.createAnimatedComponent(ExpoImage);

type ImageSourceRect = { x: number; y: number; width: number; height: number };

function CarouselSlide({
  uri,
  isActive,
  position,
  aspectRatio,
  viewport,
  hasEnteredViewer,
  left,
  top,
  width,
  height,
  scale,
  translateX,
  translateY,
  carouselDragX,
  onLoad,
  onError,
}: {
  uri: string;
  isActive: boolean;
  position: number;
  aspectRatio: number;
  viewport: { width: number; height: number };
  hasEnteredViewer: boolean;
  left: SharedValue<number>;
  top: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  carouselDragX: SharedValue<number>;
  onLoad: (event: ImageLoadEventData) => void;
  onError?: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const entering = isActive && !hasEnteredViewer;
    return {
      position: 'absolute',
      left: entering ? left.value : position * (viewport.width + 2),
      top: entering ? top.value : (viewport.height - viewport.width / aspectRatio) / 2,
      width: entering ? width.value : viewport.width,
      height: entering ? height.value : viewport.width / aspectRatio,
      transform: [
        { translateX: translateX.value },
        { translateX: carouselDragX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <AnimatedExpoImage
      source={{ uri }}
      recyclingKey={uri}
      transition={0}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel={translate('Image preview')}
      onLoad={onLoad}
      onError={onError}
      style={style}
    />
  );
}

export function ImageViewerModal({
  uri,
  visible,
  sourceRect,
  images,
  onClose,
}: {
  uri: string;
  visible: boolean;
  sourceRect: ImageSourceRect | null;
  images?: string[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  useLocalization();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(() => {
    const index = images?.indexOf(uri) ?? -1;
    return index >= 0 ? index : 0;
  });
  const [activeAspectRatio, setActiveAspectRatio] = useState(
    sourceRect && sourceRect.height > 0 ? sourceRect.width / sourceRect.height : 1
  );
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const [hasEnteredViewer, setHasEnteredViewer] = useState(false);
  const activeAspectRatioRef = useRef(activeAspectRatio);
  const hasLoadedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const scale = useSharedValue(1);
  const pinchStartScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const carouselDragX = useSharedValue(0);
  const isTransitioning = useSharedValue(false);
  const left = useSharedValue(sourceRect?.x ?? 0);
  const top = useSharedValue(sourceRect?.y ?? 0);
  const width = useSharedValue(sourceRect?.width ?? 0);
  const height = useSharedValue(sourceRect?.height ?? 0);
  const backdropOpacity = useSharedValue(0);
  const currentUri = images?.[currentImageIndex] ?? uri;
  useEffect(() => {
    if (images && images.length > 1) {
      void ExpoImage.prefetch(images).catch(() => false);
    }
  }, [images]);

  const finishTransition = (nextIndex: number) => {
    setCurrentImageIndex(nextIndex);
    carouselDragX.value = 0;
    isTransitioning.value = false;
  };

  const animateIntoView = (
    viewWidth = viewport.width,
    viewHeight = viewport.height,
    aspectRatio = activeAspectRatioRef.current
  ) => {
    if (!sourceRect || !viewWidth || !viewHeight || hasStartedRef.current) return;
    hasStartedRef.current = true;
    const targetWidth = viewWidth;
    const targetHeight = targetWidth / aspectRatio;
    const config = { duration: 340, easing: Easing.out(Easing.cubic) };

    left.value = withTiming(0, config);
    top.value = withTiming((viewHeight - targetHeight) / 2, config);
    width.value = withTiming(targetWidth, config, (finished) => {
      if (finished) runOnJS(setHasEnteredViewer)(true);
    });
    height.value = withTiming(targetHeight, config);
    backdropOpacity.value = withTiming(1, config);
  };

  const handleImageLoad = (event: ImageLoadEventData) => {
    const aspectRatio =
      event.source.width > 0 && event.source.height > 0
        ? event.source.width / event.source.height
        : activeAspectRatioRef.current;
    activeAspectRatioRef.current = aspectRatio;
    setImageAspectRatios((ratios) => ({ ...ratios, [currentUri]: aspectRatio }));
    setActiveAspectRatio(aspectRatio);
    hasLoadedRef.current = true;
    setIsImageLoaded(true);
    animateIntoView(viewport.width, viewport.height, aspectRatio);
  };

  const handleImageError = () => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setIsImageLoaded(true);
      animateIntoView();
    }
  };

  const handleAdjacentImageLoad = (imageUri: string, event: ImageLoadEventData) => {
    if (event.source.width <= 0 || event.source.height <= 0) return;
    setImageAspectRatios((ratios) => ({
      ...ratios,
      [imageUri]: event.source.width / event.source.height,
    }));
  };

  const handleLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const nextViewport = event.nativeEvent.layout;
    setViewport(nextViewport);
    if (hasLoadedRef.current && !hasStartedRef.current && sourceRect) {
      animateIntoView(nextViewport.width, nextViewport.height, activeAspectRatioRef.current);
    }
  };

  const closeViewer = () => {
    if (!sourceRect || !hasStartedRef.current) {
      onClose();
      return;
    }
    const config = { duration: 240, easing: Easing.in(Easing.cubic) };
    left.value = withTiming(sourceRect.x, config);
    top.value = withTiming(sourceRect.y, config);
    width.value = withTiming(sourceRect.width, config);
    height.value = withTiming(sourceRect.height, config, (finished) => {
      if (finished) runOnJS(onClose)();
    });
    scale.value = withTiming(1, config);
    translateX.value = withTiming(0, config);
    translateY.value = withTiming(0, config);
    backdropOpacity.value = withTiming(0, config);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      pinchStartScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(pinchStartScale.value * event.scale, 5));
      if (scale.value === 1) {
        translateX.value = 0;
        translateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
      carouselDragX.value = 0;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) {
        if (images && images.length > 1 && !isTransitioning.value) {
          carouselDragX.value = event.translationX;
        }
        return;
      }
      const maxX = (viewport.width * (scale.value - 1)) / 2;
      const maxY = (viewport.height * (scale.value - 1)) / 2;
      translateX.value = Math.max(-maxX, Math.min(maxX, panStartX.value + event.translationX));
      translateY.value = Math.max(-maxY, Math.min(maxY, panStartY.value + event.translationY));
    })
    .onEnd((event) => {
      if (scale.value > 1 || isTransitioning.value || !images || images.length < 2) {
        return;
      }
      const shouldChangeImage = Math.abs(event.translationX) >= 60;
      if (!shouldChangeImage) {
        carouselDragX.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
        return;
      }
      const direction = event.translationX < 0 ? 1 : -1;
      const nextIndex = (currentImageIndex + direction + images.length) % images.length;
      if (!viewport.width) return;
      isTransitioning.value = true;
      carouselDragX.value = withTiming(
        -direction * (viewport.width + 2),
        {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished) runOnJS(finishTransition)(nextIndex);
        }
      );
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_, success) => {
      if (!success) return;
      if (scale.value > 1) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
      } else {
        scale.value = 2.5;
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeViewer}
    >
      <View className="flex-1" onLayout={handleLayout}>
        <Animated.View
          pointerEvents="none"
          className="absolute inset-0 bg-black"
          style={backdropStyle}
        />
        <GestureDetector gesture={gesture}>
          <View className="flex-1">
            {(images?.length ? images : [currentUri]).map((imageUri, index, gallery) => {
              const relativeIndex = (index - currentImageIndex + gallery.length) % gallery.length;
              const position =
                relativeIndex > gallery.length / 2 ? relativeIndex - gallery.length : relativeIndex;
              const isActive = index === currentImageIndex;

              return (
                <CarouselSlide
                  key={index}
                  uri={imageUri}
                  isActive={isActive}
                  position={position}
                  aspectRatio={imageAspectRatios[imageUri] ?? activeAspectRatio}
                  viewport={viewport}
                  hasEnteredViewer={hasEnteredViewer}
                  left={left}
                  top={top}
                  width={width}
                  height={height}
                  scale={scale}
                  translateX={translateX}
                  translateY={translateY}
                  carouselDragX={carouselDragX}
                  onLoad={
                    isActive ? handleImageLoad : (event) => handleAdjacentImageLoad(imageUri, event)
                  }
                  onError={isActive ? handleImageError : undefined}
                />
              );
            })}
          </View>
        </GestureDetector>
        {isImageLoaded && (
          <Pressable
            onPress={closeViewer}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={translate('Close image')}
            className="absolute right-4 h-11 w-11 items-center justify-center rounded-full bg-black/60"
            style={{ top: insets.top + 12 }}
          >
            <X size={24} color="#FFFFFF" />
          </Pressable>
        )}
        {isImageLoaded && images && images.length > 1 && (
          <View
            pointerEvents="none"
            accessibilityRole="text"
            accessibilityLabel={`${currentImageIndex + 1} / ${images.length}`}
            className="absolute bottom-8 self-center rounded-full bg-black/65 px-3 py-1.5"
          >
            <Text className="font-sans-medium text-sm text-white">
              {currentImageIndex + 1} / {images.length}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
