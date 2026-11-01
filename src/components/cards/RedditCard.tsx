import { Image as ExpoImage } from 'expo-image';
import { cssInterop } from 'nativewind';
import { RedditLogoIcon } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { decodeHTML } from 'entities';

import { cleanRedditDescription } from '@/lib/library/metadata';
import { LocalizedText } from '@/components/LocalizedText';

cssInterop(ExpoImage, { className: 'style' });

type RedditProps = {
  subredditAvatar: string;
  subredditName: string;
  postTitle: string;
  text?: string;
  image?: string;
  hideMedia?: boolean;
  onImagePress?: (uri: string, source: View | null) => void;
};

export const RedditCard = ({
  subredditAvatar,
  subredditName,
  postTitle,
  text,
  image,
  hideMedia = false,
  onImagePress,
}: RedditProps) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const imageRef = useRef<View>(null);

  const cleanText = cleanRedditDescription(text ? decodeHTML(text) : undefined);
  const cleanTitle = postTitle ? decodeHTML(postTitle) : '';
  const cleanImage =
    image && !image.includes('share.redd.it') && !image.includes('redditstatic.com')
      ? image
      : undefined;

  return (
    <View testID="reddit-card-base" className="w-full rounded-xl bg-theme-canvas">
      <View testID="reddit-card-tint" className="w-full p-5 gap-3 bg-theme-amber/10 rounded-xl">
        <View className="flex-row items-center gap-3">
          <ExpoImage source={{ uri: subredditAvatar }} className="w-6 h-6 rounded-full" />
          <Text className="font-sans-medium text-sm text-theme-body">{subredditName}</Text>
        </View>

        <Text className="font-sans-medium text-base text-theme-bright">{cleanTitle}</Text>

        {!hideMedia && cleanImage && (
          <Pressable
            ref={imageRef}
            testID="reddit-post-image"
            onPress={onImagePress ? () => onImagePress(cleanImage, imageRef.current) : undefined}
            disabled={!onImagePress}
          >
            <ExpoImage
              source={{ uri: cleanImage }}
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

        {cleanText && (
          <Text className="font-sans text-sm leading-[1.8] text-theme-body" numberOfLines={3}>
            {cleanText}
          </Text>
        )}

        <View className="flex-row items-center gap-1.5 mt-1">
          <RedditLogoIcon size={14} color="#F97315" weight="fill" />
          <Text className="font-sans-semibold text-sm text-theme-amber">
            <LocalizedText>Reddit</LocalizedText>
          </Text>
        </View>
      </View>
    </View>
  );
};
