import { LocalizedText } from '@/components/LocalizedText';
import { useAppTheme } from '@/lib/theme';
import { decodeHTML } from 'entities';
import { Image as ExpoImage } from 'expo-image';
import { Play } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { TiktokLogoIcon } from 'phosphor-react-native';
import { Text, View } from 'react-native';

cssInterop(ExpoImage, { className: 'style' });

type TikTokCardProps = {
  videoTitle: string;
  thumbnail: string;
  compactThumbnail?: boolean;
  compactHeight?: number;
};

export function TikTokCard({
  videoTitle,
  thumbnail,
  compactThumbnail = false,
  compactHeight,
}: TikTokCardProps) {
  const { isDark } = useAppTheme();
  const compact = compactHeight !== undefined;

  return (
    <View className="w-full" style={compact ? { height: compactHeight } : undefined}>
      <View
        testID="video-thumbnail-container"
        className="relative w-full rounded-t-xl overflow-hidden"
        style={
          compact
            ? { height: compactHeight / 2 }
            : { aspectRatio: compactThumbnail ? 3 / 4 : 9 / 16 }
        }
      >
        <ExpoImage source={{ uri: thumbnail }} className="w-full h-full" contentFit="cover" />
        <View className="absolute inset-0 bg-black/50 items-center justify-center">
          <Play size={compact ? 24 : 36} color="#FFFFFF" fill="#FFFFFF" />
        </View>
      </View>

      <View
        testID={compact ? 'pinned-title-container' : 'tiktok-title-container'}
        className={`w-full bg-cyan-500/10 rounded-b-xl ${compact ? 'justify-center px-3' : 'p-5 gap-3'}`}
        style={compact ? { height: compactHeight / 2 } : undefined}
      >
        <Text
          className={
            compact
              ? 'font-sans-medium text-lg leading-6 text-theme-foreground'
              : 'font-sans-medium text-lg leading-[1.6] text-theme-foreground'
          }
          numberOfLines={compact ? 2 : 3}
        >
          {decodeHTML(videoTitle)}
        </Text>

        {!compact && (
          <View className="flex-row items-center gap-2 mt-2">
            <TiktokLogoIcon size={14} color="#25F4EE" weight="fill" />
            <Text
              testID="tiktok-brand-label"
              className={`font-sans-semibold text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}
            >
              <LocalizedText>TikTok</LocalizedText>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
