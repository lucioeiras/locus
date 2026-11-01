import { fireEvent, render } from '@testing-library/react-native';

import { CardPreview } from '@/components/card/CardPreview';
import type { ImageItem, NoteItem } from '@/lib/library/types';

jest.mock('@/components/card/ImageViewerModal', () => ({
  ImageViewerModal: ({
    visible,
    uri,
    onClose,
  }: {
    visible: boolean;
    uri: string;
    onClose: () => void;
  }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return visible ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={onClose}>
        <Text>Image preview</Text>
        <Text>{uri}</Text>
      </Pressable>
    ) : null;
  },
}));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), setPlaybackRate: jest.fn() }),
  useAudioPlayerStatus: () => ({ duration: 0, currentTime: 0, playbackRate: 1, playing: false }),
}));

describe('CardPreview', () => {
  it('renders the note body as Markdown', async () => {
    const item: NoteItem = {
      id: 'note-1',
      version: 1,
      type: 'note',
      text: '# Read later',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { getByText } = await render(
      <CardPreview
        item={item}
        title=""
        editedText={item.text}
        onTextChange={jest.fn()}
        onTextBlur={jest.fn()}
        onTextFocus={jest.fn()}
        onDismissEditingTags={jest.fn()}
      />
    );

    expect(getByText('Read later')).toBeTruthy();
  });

  it('opens and closes the full image preview when the image is pressed', async () => {
    const item: ImageItem = {
      id: 'image-1',
      version: 1,
      type: 'image',
      image: 'file:///image.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { getByRole, getByText, queryByText } = await render(
      <CardPreview
        item={item}
        title=""
        editedText=""
        onTextChange={jest.fn()}
        onTextBlur={jest.fn()}
        onTextFocus={jest.fn()}
        onDismissEditingTags={jest.fn()}
      />
    );

    expect(queryByText('Image preview')).toBeNull();
    fireEvent.press(getByRole('button', { name: 'Open image' }));
    expect(getByText('Image preview')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Close image' }));
    expect(queryByText('Image preview')).toBeNull();
  });

  it('does not add the image preview action to other card types', async () => {
    const item: NoteItem = {
      id: 'note-2',
      version: 1,
      type: 'note',
      text: 'A note',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { queryByRole } = await render(
      <CardPreview
        item={item}
        title=""
        editedText={item.text}
        onTextChange={jest.fn()}
        onTextBlur={jest.fn()}
        onTextFocus={jest.fn()}
        onDismissEditingTags={jest.fn()}
      />
    );

    expect(queryByRole('button', { name: 'Open image' })).toBeNull();
  });

  it('opens the image tapped in a tweet gallery', async () => {
    const item = {
      id: 'tweet-gallery',
      version: 1 as const,
      type: 'tweet' as const,
      url: 'https://x.com/user/status/1',
      author: 'A User',
      avatar: 'avatar.jpg',
      text: 'A tweet with images',
      images: ['first.jpg', 'second.jpg'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const view = await render(
      <CardPreview
        item={item}
        title=""
        editedText={item.text}
        onTextChange={jest.fn()}
        onTextBlur={jest.fn()}
        onTextFocus={jest.fn()}
        onDismissEditingTags={jest.fn()}
      />
    );

    fireEvent.press(view.getByTestId('tweet-post-image-1'));
    expect(view.getByText('Image preview')).toBeTruthy();
    expect(view.getByText('second.jpg')).toBeTruthy();
  });
});
