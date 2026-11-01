import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { cssInterop } from 'nativewind';
import { TwitterLogoIcon } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LocalizedText } from '@/components/LocalizedText';
import { useAppTheme } from '@/lib/theme';
import { decodeHTML } from 'entities';

cssInterop(ExpoImage, { className: 'style' });

function TweetVideoPlayer({
  videoUrl,
  aspectRatio = 16 / 9,
  isDetail = false,
}: {
  videoUrl: string;
  aspectRatio?: number;
  isDetail?: boolean;
}) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
  });

  const safeAspectRatio =
    aspectRatio && !isNaN(aspectRatio) && aspectRatio > 0
      ? Math.max(0.85, Math.min(1.778, aspectRatio))
      : 16 / 9;

  return (
    <View
      className="w-full rounded-xl overflow-hidden bg-sky-950 items-center justify-center"
      style={{
        width: '100%',
        aspectRatio: safeAspectRatio,
        maxHeight: isDetail ? 440 : 220,
      }}
    >
      <VideoView
        style={{ width: '100%', height: '100%' }}
        player={player}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}

type TweetProps = {
  avatar: string;
  author: string;
  text: string;
  images?: string[];
  video?: {
    url: string;
    thumbnail?: string;
    width?: number;
    height?: number;
    aspectRatio?: number;
  };
  isDetail?: boolean;
  hideMedia?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onImagePress?: (uri: string, source: View | null) => void;
};

export const TweetCard = ({
  avatar,
  author,
  text,
  images = [],
  video,
  isDetail = false,
  hideMedia = false,
  onPress,
  onLongPress,
  onImagePress,
}: TweetProps) => {
  const { isDark } = useAppTheme();
  const [aspectRatio, setAspectRatio] = useState(1);
  const singleImageRef = useRef<View>(null);
  const cleanText = text ? decodeHTML(text) : '';
  const hasMultipleImages = images.length > 1;

  return (
    <View testID="tweet-card-base" className="w-full rounded-xl bg-theme-canvas">
      <View testID="tweet-card-tint" className="w-full p-5 gap-4 relative bg-sky-500/10 rounded-xl">
        {onPress && (
          <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={350}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Header: avatar + author + text */}
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          disabled={!onPress && !onLongPress}
          style={({ pressed }) =>
            pressed && onPress ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : undefined
          }
        >
          <View className="flex-row items-center gap-2">
            <ExpoImage source={{ uri: avatar }} className="w-6 h-6 rounded-full" />
            <Text className="font-sans-semibold text-sm text-theme-bright">{author}</Text>
          </View>

          <Text
            className="font-sans text-base leading-[1.8] text-theme-foreground mt-4"
            numberOfLines={8}
          >
            {cleanText}
          </Text>
        </Pressable>

        {/* Video */}
        {!hideMedia && video?.url ? (
          <TweetVideoPlayer
            videoUrl={video.url}
            aspectRatio={video.aspectRatio}
            isDetail={isDetail}
          />
        ) : !hideMedia && video?.thumbnail ? (
          <ExpoImage
            source={{ uri: video.thumbnail }}
            className="w-full rounded-xl"
            style={{
              width: '100%',
              aspectRatio: video.aspectRatio || 16 / 9,
              maxHeight: 220,
            }}
            contentFit="cover"
          />
        ) : null}

        {/* Single Image */}
        {!hideMedia && !video && images.length === 1 && (
          <Pressable
            ref={singleImageRef}
            testID="tweet-post-image-0"
            onPress={onImagePress ? () => onImagePress(images[0], singleImageRef.current) : onPress}
            onLongPress={onLongPress}
            delayLongPress={350}
            disabled={!onPress && !onLongPress && !onImagePress}
            style={({ pressed }) =>
              pressed && (onPress || onImagePress)
                ? { opacity: 0.85, transform: [{ scale: 0.98 }] }
                : undefined
            }
          >
            <ExpoImage
              source={{ uri: images[0] }}
              className="w-full rounded-lg"
              style={{
                aspectRatio: Math.max(0.75, Math.min(1.778, aspectRatio)),
                maxHeight: 220,
              }}
              contentFit="cover"
              onLoad={(e) => {
                if (e.source.width && e.source.height) {
                  const ratio = e.source.width / e.source.height;
                  setAspectRatio(Math.max(0.75, Math.min(1.778, ratio)));
                }
              }}
            />
          </Pressable>
        )}

        {!hideMedia && !video && hasMultipleImages && (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -28 }}
            contentContainerStyle={{ paddingHorizontal: 28, gap: 8 }}
          >
            {images.map((img, index) => {
              const imageElement = (
                <ExpoImage
                  source={{ uri: img }}
                  className="w-36 h-32 rounded-lg bg-theme-raised"
                  contentFit="cover"
                />
              );

              const imageRef = { current: null as View | null };
              return (
                <Pressable
                  key={index}
                  testID={`tweet-post-image-${index}`}
                  onPress={onImagePress ? () => onImagePress(img, imageRef.current) : onPress}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  disabled={!onPress && !onLongPress && !onImagePress}
                  style={({ pressed }) =>
                    pressed && (onPress || onLongPress || onImagePress)
                      ? { opacity: 0.85, transform: [{ scale: 0.98 }] }
                      : undefined
                  }
                >
                  <View
                    ref={(node) => {
                      imageRef.current = node;
                    }}
                  >
                    {imageElement}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Footer: Twitter logo */}
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          disabled={!onPress && !onLongPress}
          style={({ pressed }) =>
            pressed && onPress ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : undefined
          }
          className="flex-row items-center gap-1.5 mt-2"
        >
          <TwitterLogoIcon size={14} color="#0EA5E9" weight="fill" />
          <Text
            testID="tweet-brand-label"
            className={`font-sans-semibold text-sm ${isDark ? 'text-sky-400' : 'text-sky-700'}`}
          >
            <LocalizedText>Twitter</LocalizedText>
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
