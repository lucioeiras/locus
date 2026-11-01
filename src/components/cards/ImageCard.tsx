import { translate } from '@/lib/i18n';
import { Image as ExpoImage } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

cssInterop(ExpoImage, { className: 'style' });

type NoteProps = {
  url: string;
  title?: string;
  images?: string[];
  showCarousel?: boolean;
  onAspectRatioChange?: (ratio: number) => void;
};

export const ImageCard = ({
  url,
  title,
  images,
  showCarousel = false,
  onAspectRatioChange,
}: NoteProps) => {
  const [aspectRatio, setAspectRatio] = useState(1); // Default to a square until loaded
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();
  const gallery = images?.length ? images : [url];
  const hasGallery = gallery.length > 1;
  const carouselVisible = showCarousel && hasGallery && containerWidth > 0;

  return (
    <View
      className="w-full"
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      {carouselVisible ? (
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / containerWidth);
            setCurrentIndex(Math.max(0, Math.min(nextIndex, gallery.length - 1)));
          }}
        >
          {gallery.map((image, index) => (
            <ExpoImage
              key={`${image}-${index}`}
              source={{ uri: image }}
              style={{ width: containerWidth, aspectRatio }}
              className="rounded-xl"
              contentFit="cover"
              onLoad={(event) => {
                if (index === 0 && event.source.width && event.source.height) {
                  const ratio = event.source.width / event.source.height;
                  setAspectRatio(ratio);
                  onAspectRatioChange?.(ratio);
                }
              }}
            />
          ))}
        </ScrollView>
      ) : (
        <ExpoImage
          source={{ uri: url }}
          className="w-full rounded-xl"
          style={{ aspectRatio }}
          contentFit="cover"
          onLoad={(event) => {
            if (event.source.width && event.source.height) {
              const ratio = event.source.width / event.source.height;
              setAspectRatio(ratio);
              onAspectRatioChange?.(ratio);
            }
          }}
        />
      )}

      {carouselVisible && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            width: windowWidth,
            marginLeft: (containerWidth - windowWidth) / 2,
          }}
          contentContainerStyle={{
            gap: 8,
            paddingTop: 10,
            paddingLeft: Math.max(0, (windowWidth - containerWidth) / 2),
            paddingRight: 16,
          }}
        >
          {gallery.map((image, index) => (
            <Pressable
              key={`thumbnail-${image}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`${translate('Image')} ${index + 1} / ${gallery.length}`}
              accessibilityState={{ selected: currentIndex === index }}
              onPress={(event) => {
                event.stopPropagation();
                setCurrentIndex(index);
                carouselRef.current?.scrollTo({ x: index * containerWidth, animated: false });
              }}
              className={`overflow-hidden rounded-lg border-2 ${currentIndex === index ? 'border-theme-foreground' : 'border-transparent'}`}
            >
              <ExpoImage
                source={{ uri: image }}
                style={{ width: 64, height: 64, borderRadius: 8 }}
                contentFit="cover"
                className="rounded-lg bg-theme-surface"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {hasGallery && (
        <View
          accessibilityLabel={`${gallery.length} ${translate('images')}`}
          className="absolute right-2 top-2 rounded-full bg-black/75 px-3 py-1.5"
          pointerEvents="none"
        >
          <Text className="font-sans-semibold text-sm text-white">
            {carouselVisible ? `${currentIndex + 1} / ${gallery.length}` : `+${gallery.length - 1}`}
          </Text>
        </View>
      )}

      {title && (
        <Text
          className="font-sans-medium text-center text-xs text-theme-secondary leading-[1.6] mt-3"
          numberOfLines={2}
        >
          {title}
        </Text>
      )}
    </View>
  );
};
