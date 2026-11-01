import { fireEvent, render } from '@testing-library/react-native';

import { ItemCard } from '@/components/cards/ItemCard';
import type { LibraryItem } from '@/lib/library/types';

jest.mock('@/components/PdfPreview', () => ({ PdfPreview: () => null }));
jest.mock('@/components/cards/VideoCard', () => ({
  VideoCard: ({ title }: { title?: string }) => {
    const mockReact = jest.requireActual('react');
    const { Text: MockText } = jest.requireActual('react-native');
    return title ? mockReact.createElement(MockText, null, title) : null;
  },
}));

const base = {
  version: 1 as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const examples: [LibraryItem, string][] = [
  [{ ...base, id: 'note', type: 'note', text: 'Note body', title: 'A note' }, 'Note body'],
  [{ ...base, id: 'quote', type: 'quote', text: 'A quote', title: 'Quote source' }, 'A quote'],
  [{ ...base, id: 'image', type: 'image', image: 'image.jpg', title: 'An image' }, 'An image'],
  [{ ...base, id: 'pdf', type: 'pdf', pdf: 'files/report.pdf', title: 'A report' }, 'A report'],
  [
    { ...base, id: 'video', type: 'video', video: 'videos/clip.mp4', title: 'A local video' },
    'A local video',
  ],
  [
    {
      ...base,
      id: 'link',
      type: 'link',
      url: 'https://www.example.com/path',
      siteTitle: 'Example',
      description: 'A link description',
      favicon: 'favicon.jpg',
    },
    'Example',
  ],
  [
    {
      ...base,
      id: 'article',
      type: 'article',
      url: 'https://example.com/article',
      title: 'An article',
      origin: 'Example News',
      thumbnail: 'article.jpg',
    },
    'An article',
  ],
  [
    {
      ...base,
      id: 'youtube',
      type: 'youtube',
      url: 'https://youtube.com/watch?v=abc',
      title: 'A video',
      thumbnail: 'video.jpg',
    },
    'A video',
  ],
  [
    {
      ...base,
      id: 'tiktok',
      type: 'tiktok',
      url: 'https://www.tiktok.com/@person/video/123',
      title: 'A TikTok video',
      thumbnail: 'tiktok.jpg',
    },
    'A TikTok video',
  ],
  [
    {
      ...base,
      id: 'tweet',
      type: 'tweet',
      url: 'https://x.com/user/status/1',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'A post',
    },
    'A post',
  ],
  [
    {
      ...base,
      id: 'reddit',
      type: 'reddit',
      url: 'https://reddit.com/r/test/1',
      subreddit: 'r/test',
      subredditAvatar: 'reddit.jpg',
      title: 'A discussion',
      text: 'Reddit content',
    },
    'A discussion',
  ],
  [
    {
      ...base,
      id: 'book',
      type: 'book',
      isbn: '1234567890',
      title: 'A book',
      authors: ['An Author'],
      cover: 'book.jpg',
    },
    'A book',
  ],
  [
    {
      ...base,
      id: 'music',
      type: 'music',
      title: 'A song',
      artist: 'A Singer',
      cover: 'album.jpg',
    },
    'A song',
  ],
  [
    {
      ...base,
      id: 'movie',
      type: 'movie',
      tmdbId: 1,
      title: 'A movie',
      poster: 'poster.jpg',
    },
    'A movie',
  ],
  [{ ...base, id: 'game', type: 'game', title: 'A game', cover: 'game.jpg' }, 'A game'],
];

describe('ItemCard', () => {
  it.each(examples)('renders the %s item variant', async (item, expectedText) => {
    const { getByText } = await render(<ItemCard item={item} />);
    expect(getByText(expectedText)).toBeTruthy();
  });

  it('renders TikTok with a vertical thumbnail and without progress status', async () => {
    const tiktok = examples.find(([item]) => item.type === 'tiktok')?.[0];
    if (!tiktok) throw new Error('Missing TikTok test item');

    const { getByTestId, getByText, queryByText } = await render(<ItemCard item={tiktok} />);
    expect(getByTestId('video-thumbnail-container').props.style).toMatchObject({
      aspectRatio: 9 / 16,
    });
    expect(getByText('TikTok')).toBeTruthy();
    expect(queryByText('Want to watch')).toBeNull();
  });

  it('preserves the 16:9 YouTube thumbnail aspect ratio', async () => {
    const youtube = examples.find(([item]) => item.type === 'youtube')?.[0];
    if (!youtube) throw new Error('Missing YouTube test item');

    const { getByTestId } = await render(<ItemCard item={youtube} />);
    expect(getByTestId('youtube-thumbnail-container').props.style).toMatchObject({
      aspectRatio: 16 / 9,
    });
  });

  it.each([
    ['youtube', 'youtube-card-base', 'youtube-title-container', 'bg-theme-pink/10'],
    ['tweet', 'tweet-card-base', 'tweet-card-tint', 'bg-sky-500/10'],
    ['reddit', 'reddit-card-base', 'reddit-card-tint', 'bg-theme-amber/10'],
  ] as const)(
    'places a theme canvas base beneath the %s card tint',
    async (type, baseTestId, tintTestId, tintClass) => {
      const item = examples.find(([candidate]) => candidate.type === type)?.[0];
      if (!item) throw new Error(`Missing ${type} test item`);

      const { getByTestId } = await render(<ItemCard item={item} />);
      expect(getByTestId(baseTestId).props.className).toContain('bg-theme-canvas');
      expect(getByTestId(tintTestId).props.className).toContain(tintClass);
    }
  );

  it.each([
    ['youtube', 'youtube-thumbnail-container', undefined],
    ['youtube', 'youtube-thumbnail-container', 100],
    ['tiktok', 'video-thumbnail-container', undefined],
    ['tiktok', 'video-thumbnail-container', 100],
  ] as const)(
    'clips %s thumbnails and overlays inside %s (fixed height: %s)',
    async (type, thumbnailTestId, fixedHeight) => {
      const item = examples.find(([candidate]) => candidate.type === type)?.[0];
      if (!item) throw new Error(`Missing ${type} test item`);
      const view = await render(<ItemCard item={item} fixedHeight={fixedHeight} />);
      const container = view.getByTestId(thumbnailTestId);
      expect(container.props.className).toContain('rounded-t-xl');
      expect(container.props.className).toContain('overflow-hidden');
    }
  );

  it('reduces the TikTok thumbnail height in the pinned-card layout', async () => {
    const tiktok = examples.find(([item]) => item.type === 'tiktok')?.[0];
    if (!tiktok) throw new Error('Missing TikTok test item');

    const { getByTestId } = await render(<ItemCard item={tiktok} compactTikTokThumbnail />);
    expect(getByTestId('video-thumbnail-container').props.style).toMatchObject({
      aspectRatio: 3 / 4,
    });
  });

  it('applies a fixed height to compact card previews', async () => {
    const note = examples.find(([item]) => item.type === 'note')?.[0];
    if (!note) throw new Error('Missing note test item');

    const { getByTestId } = await render(<ItemCard item={note} fixedHeight={100} />);
    expect(getByTestId('item-card-fixed-height').props.style).toMatchObject({ height: 100 });
  });

  it.each([
    ['article', 'article-thumbnail'],
    ['youtube', 'youtube-thumbnail-container'],
    ['tiktok', 'video-thumbnail-container'],
  ] as const)(
    '%s pinned preview splits its height evenly between thumbnail and title',
    async (type, thumbnailTestId) => {
      const item = examples.find(([candidate]) => candidate.type === type)?.[0];
      if (!item) throw new Error(`Missing ${type} test item`);

      const { getByTestId } = await render(<ItemCard item={item} fixedHeight={100} />);
      expect(getByTestId(thumbnailTestId).props.style).toMatchObject({ height: 50 });
      expect(getByTestId('pinned-title-container').props.style).toMatchObject({ height: 50 });
    }
  );

  it('keeps game covers square', async () => {
    const game = examples.find(([item]) => item.type === 'game')?.[0];
    if (!game) throw new Error('Missing game test item');

    const { getByTestId } = await render(<ItemCard item={game} />);
    expect(getByTestId('game-cover-container').props.style).toMatchObject({ aspectRatio: 1 });
  });

  it('allows the music vinyl shadow to extend past normal and pinned card content', async () => {
    const music = examples.find(([item]) => item.type === 'music')?.[0];
    if (!music) throw new Error('Missing music test item');

    const boardCard = await render(<ItemCard item={music} />);
    expect(boardCard.getByTestId('item-card-content').props.style.overflow).toBe('visible');

    const pinnedCard = await render(<ItemCard item={music} fixedHeight={100} />);
    expect(pinnedCard.getByTestId('item-card-content').props.style.overflow).toBe('visible');
  });

  it('keeps author identity and text while hiding media for pinned X and Reddit cards', async () => {
    const tweet: LibraryItem = {
      ...base,
      id: 'tweet-text-only',
      type: 'tweet',
      url: 'https://x.com/user/status/3',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'Only this post body',
      images: ['image.jpg'],
    };
    const reddit: LibraryItem = {
      ...base,
      id: 'reddit-text-only',
      type: 'reddit',
      url: 'https://reddit.com/r/test/2',
      subreddit: 'r/test',
      subredditAvatar: 'reddit.jpg',
      title: 'Hidden title',
      text: 'Only this Reddit body',
      image: 'image.jpg',
    };

    const tweetScreen = await render(<ItemCard item={tweet} compactMedia />);
    expect(tweetScreen.getByText('Only this post body')).toBeTruthy();
    expect(tweetScreen.getByText('A User')).toBeTruthy();
    await tweetScreen.unmount();

    const redditScreen = await render(<ItemCard item={reddit} compactMedia hideTitleAndAuthor />);
    expect(redditScreen.getByText('Only this Reddit body')).toBeTruthy();
    expect(redditScreen.queryByText('Hidden title')).toBeNull();
    expect(redditScreen.getByText('r/test')).toBeTruthy();
  });

  it('passes press actions the original item and supports selection display', async () => {
    const item = examples[0][0];
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { getByText } = await render(
      <ItemCard item={item} isEditing isSelected onPress={onPress} onLongPress={onLongPress} />
    );

    await fireEvent.press(getByText('Note body'));
    expect(onPress).toHaveBeenCalledWith(item);
  });

  it('rounds the selection outline to match the card corners', async () => {
    const item = examples[0][0];
    const { getByTestId } = await render(<ItemCard item={item} isEditing isSelected />);

    expect(getByTestId('item-card-selection-outline').props.className).toContain('rounded-xl');
  });

  it('makes multi-image tweets interactive inside the tweet card', async () => {
    const item: LibraryItem = {
      ...base,
      id: 'tweet-gallery',
      type: 'tweet',
      url: 'https://x.com/user/status/2',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'Gallery post',
      images: ['one.jpg', 'two.jpg'],
    };
    const onPress = jest.fn();
    const { getByText } = await render(<ItemCard item={item} onPress={onPress} />);

    await fireEvent.press(getByText('Gallery post'));
    expect(onPress).toHaveBeenCalledWith(item);
  });

  it('routes a tapped tweet image to the detail image viewer callback', async () => {
    const item: LibraryItem = {
      ...base,
      id: 'tweet-image',
      type: 'tweet',
      url: 'https://x.com/user/status/4',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'Image post',
      images: ['tweet.jpg'],
    };
    const onImagePress = jest.fn();
    const { getByTestId } = await render(<ItemCard item={item} onImagePress={onImagePress} />);

    await fireEvent.press(getByTestId('tweet-post-image-0'));
    expect(onImagePress.mock.calls[0]?.[0]).toBe('tweet.jpg');
  });

  it('routes the selected image from a tweet gallery to the detail image viewer callback', async () => {
    const item: LibraryItem = {
      ...base,
      id: 'tweet-image-gallery',
      type: 'tweet',
      url: 'https://x.com/user/status/5',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'Gallery post',
      images: ['first.jpg', 'second.jpg'],
    };
    const onImagePress = jest.fn();
    const { getByTestId } = await render(<ItemCard item={item} onImagePress={onImagePress} />);

    await fireEvent.press(getByTestId('tweet-post-image-1'));
    expect(onImagePress.mock.calls[0]?.[0]).toBe('second.jpg');
  });

  it('routes a Reddit post image to the detail image viewer callback', async () => {
    const item: LibraryItem = {
      ...base,
      id: 'reddit-image',
      type: 'reddit',
      url: 'https://reddit.com/r/test/7',
      subreddit: 'r/test',
      subredditAvatar: 'reddit.jpg',
      title: 'Image post',
      image: 'reddit-post.jpg',
    };
    const onImagePress = jest.fn();
    const { getByTestId } = await render(<ItemCard item={item} onImagePress={onImagePress} />);

    await fireEvent.press(getByTestId('reddit-post-image'));
    expect(onImagePress.mock.calls[0]?.[0]).toBe('reddit-post.jpg');
  });

  it('does not offer image zoom for a tweet without an image', async () => {
    const item: LibraryItem = {
      ...base,
      id: 'tweet-no-image',
      type: 'tweet',
      url: 'https://x.com/user/status/6',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'Text only',
    };
    const onImagePress = jest.fn();
    const view = await render(<ItemCard item={item} onImagePress={onImagePress} />);

    expect(view.queryByTestId('tweet-post-image-0')).toBeNull();
    expect(onImagePress).not.toHaveBeenCalled();
  });

  it('does not offer image zoom for a Reddit post with filtered boilerplate art', async () => {
    const item: LibraryItem = {
      ...base,
      id: 'reddit-no-image',
      type: 'reddit',
      url: 'https://reddit.com/r/test/6',
      subreddit: 'r/test',
      subredditAvatar: 'reddit.jpg',
      title: 'Text only',
      image: 'https://redditstatic.com/avatar.png',
    };
    const onImagePress = jest.fn();
    const view = await render(<ItemCard item={item} onImagePress={onImagePress} />);

    expect(view.queryByTestId('reddit-post-image')).toBeNull();
    expect(onImagePress).not.toHaveBeenCalled();
  });
});
