import { useAppTheme } from '@/lib/theme';
import { Image as ExpoImage } from 'expo-image';
import { Disc, Quote } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MarkdownNote } from '@/components/card/MarkdownNote';
import { ItemCard } from '@/components/cards/ItemCard';
import { VinylRecord } from '@/components/effects/VinylRecord';
import { translate, useLocalization } from '@/lib/i18n';
import type { LibraryItem } from '@/lib/library/types';
import { ImageViewerModal } from '@/components/card/ImageViewerModal';
import { MusicPreviewPlayer } from './MusicPreviewPlayer';

type ImageSourceRect = { x: number; y: number; width: number; height: number };

type CardPreviewProps = {
  item: LibraryItem;
  title: string;
  editedText: string;
  onTextChange: (text: string) => void;
  onTextBlur: () => void;
  onTextFocus: () => void;
  onDismissEditingTags: () => void;
};

export function CardPreview({
  item,
  title,
  editedText,
  onTextChange,
  onTextBlur,
  onTextFocus,
  onDismissEditingTags,
}: CardPreviewProps) {
  const { colors: themeColors } = useAppTheme();
  useLocalization();
  const isMusic = item.type === 'music';
  const isNoteOrQuote = item.type === 'note' || item.type === 'quote';
  const displayItem: LibraryItem =
    title && 'title' in item ? ({ ...item, title } as LibraryItem) : item;
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [imageSourceRect, setImageSourceRect] = useState<ImageSourceRect | null>(null);
  const imageCardRef = useRef<View>(null);
  const musicPlayerRef = useRef<{
    play: () => void;
    pause: () => void;
    playing: boolean;
  } | null>(null);
  const handleToggleMusic = useCallback(() => {
    if (!musicPlayerRef.current) return;
    if (musicPlayerRef.current.playing) musicPlayerRef.current.pause();
    else musicPlayerRef.current.play();
  }, []);
  const handleOpenImage = useCallback((uri: string, source: View | null) => {
    setImageViewerUri(uri);
    source?.measureInWindow((x, y, width, height) => {
      setImageSourceRect({ x, y, width, height });
    });
  }, []);
  const handleOpenSavedImage = useCallback(() => {
    handleOpenImage(item.type === 'image' ? item.image : '', imageCardRef.current);
  }, [handleOpenImage, item]);
  return (
    <View
      className={`w-full px-6 py-8 min-h-[300px] relative ${
        item.type === 'note' ? 'items-start justify-start' : 'items-center justify-center'
      }`}
    >
      <Pressable
        onPress={() => {
          onDismissEditingTags();
        }}
        style={StyleSheet.absoluteFill}
      />

      {isMusic && (
        <View className="w-full max-w-sm items-center gap-4">
          <Pressable
            onPress={item.previewUrl ? handleToggleMusic : undefined}
            className="relative items-center justify-center my-2 active:opacity-90"
            style={{ width: 320, height: 230 }}
          >
            <View
              style={{
                position: 'absolute',
                left: 106,
                top: 15,
                zIndex: 1,
              }}
            >
              <VinylRecord size={200} coverUri={item.cover} isSpinning={isPlayingMusic} />
            </View>

            <View
              style={{
                position: 'absolute',
                width: 214,
                height: 214,
                left: 12,
                top: 8,
                zIndex: 2,
                borderRadius: 10,
                overflow: 'hidden',
                backgroundColor: themeColors.surface,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.12)',
                shadowColor: '#000000',
                shadowOffset: { width: 6, height: 4 },
                shadowOpacity: 0.65,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              {item.cover ? (
                <ExpoImage
                  source={{ uri: item.cover }}
                  style={{ width: '100%', height: '100%', borderRadius: 9 }}
                  contentFit="cover"
                />
              ) : (
                <View className="w-full h-full items-center justify-center bg-theme-raised">
                  <Disc size={64} color={themeColors.muted} strokeWidth={2} />
                </View>
              )}

              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 3.5,
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                }}
              />
            </View>
          </Pressable>

          {item.previewUrl && (
            <MusicPreviewPlayer
              previewUrl={item.previewUrl}
              onPlayingChange={setIsPlayingMusic}
              playerRef={musicPlayerRef}
            />
          )}
        </View>
      )}

      {!isNoteOrQuote && !isMusic && (
        <View ref={item.type === 'image' ? imageCardRef : undefined} className="w-full max-w-sm">
          {item.type === 'image' ? (
            <ItemCard
              item={displayItem}
              hideTitleAndAuthor
              showAudioPlaybackRate
              showImageCarousel={item.type === 'image'}
              onPress={handleOpenSavedImage}
              accessibilityLabel={translate('Open image')}
              accessibilityHint={translate('Opens image preview with zoom controls')}
            />
          ) : (
            <ItemCard
              item={displayItem}
              hideTitleAndAuthor
              showAudioPlaybackRate
              onImagePress={
                item.type === 'tweet' || item.type === 'reddit' ? handleOpenImage : undefined
              }
            />
          )}
        </View>
      )}

      {/* If it's a note or quote: show text without background in bigger font size like new note modal */}
      {isNoteOrQuote && (
        <View className="w-full max-w-lg px-2">
          {item.type === 'quote' ? (
            <View className="items-center w-full py-2">
              <Quote size={18} color="#71717B" style={{ transform: [{ rotate: '180deg' }] }} />
              <TextInput
                value={editedText}
                onChangeText={onTextChange}
                onBlur={onTextBlur}
                onFocus={onTextFocus}
                multiline
                placeholder={translate('Type quote here...')}
                placeholderTextColor={themeColors.muted}
                className="w-full font-sans-medium text-2xl text-theme-foreground leading-10 text-center mt-6 mb-11"
                style={{ backgroundColor: 'transparent' }}
                underlineColorAndroid="transparent"
              />
              <Quote size={18} color="#71717B" />
            </View>
          ) : (
            <MarkdownNote markdown={editedText} onMarkdownChange={onTextChange} />
          )}
        </View>
      )}
      {imageViewerUri && (
        <ImageViewerModal
          uri={imageViewerUri}
          visible
          sourceRect={imageSourceRect}
          images={
            item.type === 'tweet'
              ? item.images
              : item.type === 'image'
                ? (item.images ?? [item.image])
                : undefined
          }
          onClose={() => setImageViewerUri(null)}
        />
      )}
    </View>
  );
}
