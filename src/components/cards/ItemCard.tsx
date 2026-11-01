import { useAppTheme } from '@/lib/theme';
import { Check } from 'lucide-react-native';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getLinkableTitle, type LinkableItem } from '@/lib/library/links';
import type { LibraryItem } from '@/lib/library/types';

import { ArticleCard } from './ArticleCard';
import { BookCard } from './BookCard';
import { GameCard } from './GameCard';
import { ImageCard } from './ImageCard';
import { LinkCard } from './LinkCard';
import { MovieCard } from './MovieCard';
import { MusicCard } from './MusicCard';
import { NoteCard } from './NoteCard';
import { PdfCard } from './PdfCard';
import { QuoteCard } from './QuoteCard';
import { RedditCard } from './RedditCard';
import { TweetCard } from './TweetCard';
import { TikTokCard } from './TikTokCard';
import { YouTubeCard } from './YouTubeCard';
import { VideoCard } from './VideoCard';
import { AudioCard } from './AudioCard';
import { TvShowCard } from './TvShowCard';

type ItemCardProps = {
  item: LibraryItem;
  linkedItem?: LinkableItem;
  hideTitleAndAuthor?: boolean;
  showAudioPlaybackRate?: boolean;
  compactAudioWaveform?: boolean;
  stackedAudioControls?: boolean;
  compactTikTokThumbnail?: boolean;
  compactMedia?: boolean;
  showImageCarousel?: boolean;
  fixedHeight?: number;
  fixedHeightBackgroundColor?: string;
  isEditing?: boolean;
  isSelected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress?: (item: LibraryItem) => void;
  onLongPress?: (item: LibraryItem) => void;
  onNoteTextChange?: (itemId: string, text: string) => void;
  onPinnedAspectRatioChange?: (ratio: number) => void;
  onImagePress?: (uri: string, source: View | null) => void;
};

/** Maps a library item (from JSON) to the matching card component with edition mode support. */
export const ItemCard = memo(function ItemCard({
  item,
  linkedItem,
  hideTitleAndAuthor = false,
  showAudioPlaybackRate = false,
  compactAudioWaveform = false,
  stackedAudioControls = false,
  compactTikTokThumbnail = false,
  compactMedia = false,
  showImageCarousel = false,
  fixedHeight,
  fixedHeightBackgroundColor,
  isEditing = false,
  isSelected = false,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
  onNoteTextChange,
  onPinnedAspectRatioChange,
  onImagePress,
}: ItemCardProps) {
  const { colors: themeColors } = useAppTheme();
  const hasInteractiveTweetMedia =
    item.type === 'tweet' && ((item.images?.length ?? 0) > 1 || Boolean(item.video?.url));
  const isInteractiveTweet = hasInteractiveTweetMedia && !isEditing;
  const interactiveTweetPress = isInteractiveTweet ? onPress : undefined;
  const interactiveTweetLongPress = isInteractiveTweet ? onLongPress : undefined;

  const renderCardContent = useCallback(() => {
    switch (item.type) {
      case 'note':
        return (
          <NoteCard
            text={item.text}
            title={hideTitleAndAuthor ? undefined : item.title}
            linkedItem={linkedItem}
            onMarkdownChange={
              onNoteTextChange ? (text) => onNoteTextChange(item.id, text) : undefined
            }
          />
        );
      case 'quote':
        return (
          <QuoteCard
            text={item.text}
            title={hideTitleAndAuthor ? undefined : item.title}
            linkedTitle={linkedItem ? getLinkableTitle(linkedItem) : undefined}
          />
        );
      case 'image':
        return (
          <ImageCard
            url={item.image}
            images={item.images ?? [item.image]}
            showCarousel={showImageCarousel}
            title={hideTitleAndAuthor ? undefined : item.title}
            onAspectRatioChange={onPinnedAspectRatioChange}
          />
        );
      case 'pdf':
        return (
          <PdfCard url={item.pdf} title={item.title} hideTitleAndAuthor={hideTitleAndAuthor} />
        );
      case 'video':
        return <VideoCard uri={item.video} title={hideTitleAndAuthor ? undefined : item.title} />;
      case 'audio':
        return (
          <AudioCard
            uri={item.audio}
            title={hideTitleAndAuthor ? undefined : item.title}
            waveform={item.waveform}
            showPlaybackRate={showAudioPlaybackRate}
            compactWaveform={compactAudioWaveform}
            stackedControls={stackedAudioControls}
          />
        );
      case 'link':
        return (
          <LinkCard
            favicon={item.favicon}
            siteTitle={item.siteTitle}
            title={item.title}
            description={item.description}
            url={item.url}
          />
        );
      case 'article':
        return (
          <ArticleCard
            articleTitle={item.title}
            thumbnail={item.thumbnail}
            origin={item.origin}
            progressStatus={item.progressStatus}
            compactHeight={fixedHeight}
          />
        );
      case 'youtube':
        return (
          <YouTubeCard
            videoTitle={item.title}
            thumbnail={item.thumbnail}
            progressStatus={item.progressStatus}
            compactHeight={fixedHeight}
          />
        );
      case 'tiktok':
        return (
          <TikTokCard
            videoTitle={item.title}
            thumbnail={item.thumbnail}
            compactThumbnail={compactTikTokThumbnail}
            compactHeight={fixedHeight}
          />
        );
      case 'tweet':
        return (
          <TweetCard
            avatar={item.avatar}
            author={item.author}
            text={item.text}
            images={item.images}
            video={item.video}
            hideMedia={compactMedia}
            onImagePress={onImagePress}
            onPress={interactiveTweetPress ? () => interactiveTweetPress(item) : undefined}
            onLongPress={
              interactiveTweetLongPress ? () => interactiveTweetLongPress(item) : undefined
            }
          />
        );
      case 'reddit':
        return (
          <RedditCard
            subredditAvatar={item.subredditAvatar}
            subredditName={item.subreddit}
            postTitle={hideTitleAndAuthor ? '' : item.title}
            text={item.text}
            image={item.image}
            hideMedia={compactMedia}
            onImagePress={onImagePress}
          />
        );
      case 'book':
        return (
          <BookCard
            title={item.title}
            hideTitleAndAuthor={hideTitleAndAuthor}
            cover={item.cover}
            coverAspectRatio={item.coverAspectRatio}
            publisher={item.publisher}
            publishedDate={item.publishedDate}
            pageCount={item.pageCount}
            progressStatus={item.progressStatus}
          />
        );
      case 'music':
        return (
          <MusicCard
            title={item.title}
            artist={item.artist}
            cover={item.cover}
            hideTitleAndAuthor={hideTitleAndAuthor}
            subtleVinylShadow={!fixedHeight}
          />
        );
      case 'movie':
        return (
          <MovieCard
            title={item.title}
            hideTitleAndAuthor={hideTitleAndAuthor}
            poster={item.poster}
            releaseYear={item.releaseYear}
            voteAverage={item.voteAverage}
            genres={item.genres}
            runtime={item.runtime}
            progressStatus={item.progressStatus}
            onAspectRatioChange={onPinnedAspectRatioChange}
          />
        );
      case 'tvshow':
        return (
          <TvShowCard
            title={item.title}
            poster={item.poster}
            progressStatus={item.progressStatus}
            hideTitleAndAuthor={hideTitleAndAuthor}
            onAspectRatioChange={onPinnedAspectRatioChange}
          />
        );
      case 'game':
        return (
          <GameCard
            title={item.title}
            cover={item.cover}
            hideTitleAndAuthor={hideTitleAndAuthor}
            progressStatus={item.progressStatus}
          />
        );
    }
  }, [
    compactAudioWaveform,
    compactMedia,
    showImageCarousel,
    compactTikTokThumbnail,
    fixedHeight,
    hideTitleAndAuthor,
    interactiveTweetLongPress,
    interactiveTweetPress,
    item,
    linkedItem,
    onNoteTextChange,
    onPinnedAspectRatioChange,
    onImagePress,
    showAudioPlaybackRate,
    stackedAudioControls,
  ]);

  const cardContent = useMemo(renderCardContent, [renderCardContent]);

  const cardBody = (
    <View
      testID={fixedHeight ? 'item-card-fixed-height' : undefined}
      className="w-full relative"
      style={
        fixedHeight || isSelected
          ? {
              ...(fixedHeight ? { height: fixedHeight } : {}),
              ...(isSelected
                ? {
                    shadowColor: '#3b82f6',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.4,
                    shadowRadius: 8,
                    elevation: 8,
                  }
                : {}),
            }
          : undefined
      }
    >
      <View
        testID="item-card-content"
        className={
          item.type === 'music' && !fixedHeight
            ? 'w-full'
            : item.type === 'image' && showImageCarousel
              ? 'w-full overflow-visible'
              : 'w-full overflow-hidden'
        }
        style={{
          ...(fixedHeight
            ? {
                height: '100%',
                backgroundColor: fixedHeightBackgroundColor ?? themeColors.surface,
              }
            : {}),
          overflow:
            item.type === 'music' || (item.type === 'image' && showImageCarousel)
              ? 'visible'
              : 'hidden',
        }}
      >
        {cardContent}
      </View>

      {isSelected && (
        <View
          testID="item-card-selection-outline"
          pointerEvents="none"
          className="absolute inset-0 rounded-xl border-[3px] border-blue-500 z-10"
        />
      )}

      {isEditing && (
        <View className="absolute top-5 right-5 z-20">
          <View
            className={`w-6 h-6 rounded-full items-center justify-center ${
              isSelected
                ? 'bg-blue-500 border-2 border-blue-500'
                : 'bg-theme-surface border-2 border-theme-foreground'
            }`}
          >
            {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={2} />}
          </View>
        </View>
      )}
    </View>
  );

  if (hasInteractiveTweetMedia) {
    return (
      <View className="w-full">
        {cardBody}
        {!isInteractiveTweet && (onPress || onLongPress) && (
          <Pressable
            onPress={onPress ? () => onPress(item) : undefined}
            onLongPress={onLongPress ? () => onLongPress(item) : undefined}
            delayLongPress={350}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress ? () => onPress(item) : undefined}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      delayLongPress={350}
      accessibilityRole={accessibilityLabel ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) =>
        pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : undefined
      }
      className="w-full"
    >
      {cardBody}
    </Pressable>
  );
});
