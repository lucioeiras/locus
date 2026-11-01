import { router } from 'expo-router';
import { useIncomingShare, type SharePayload } from 'expo-sharing';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NewImageModal } from '@/components/modals/NewImageModal';
import { NewLinkModal } from '@/components/modals/NewLinkModal';
import { NewNoteModal } from '@/components/modals/NewNoteModal';
import { NewPdfModal } from '@/components/modals/NewPdfModal';
import type { PickedImageAsset, PickedPdfAsset } from '@/lib/library/storage';
import { LocalizedText } from '@/components/LocalizedText';

type IncomingCard =
  | { kind: 'link'; url: string; title?: string }
  | { kind: 'note'; text: string }
  | { kind: 'image'; asset: PickedImageAsset }
  | { kind: 'pdf'; asset: PickedPdfAsset };

function fileNameFromUri(uri: string): string | undefined {
  const lastSegment = uri.split(/[/?#]/).filter(Boolean).at(-1);
  if (!lastSegment) return undefined;
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

function cardFromPayload(payload: SharePayload): IncomingCard | null {
  const value = payload.value.trim();
  if (!value) return null;

  if (
    payload.shareType === 'image' ||
    (payload.shareType === 'file' && payload.mimeType?.startsWith('image/'))
  ) {
    return {
      kind: 'image',
      asset: {
        uri: value,
        fileName: fileNameFromUri(value),
        mimeType: payload.mimeType,
      },
    };
  }

  if (
    payload.shareType === 'file' &&
    (payload.mimeType === 'application/pdf' || /\.pdf(?:[?#]|$)/i.test(value))
  ) {
    return {
      kind: 'pdf',
      asset: {
        uri: value,
        fileName: fileNameFromUri(value),
        mimeType: 'application/pdf',
      },
    };
  }

  if (payload.shareType === 'url' || payload.shareType === 'text') {
    const match = value.match(/https?:\/\/[^\s<>]+/i);
    if (match) {
      const url = match[0].replace(/[),.;!?]+$/, '');
      const title = value.replace(match[0], '').trim();
      return { kind: 'link', url, title: title || undefined };
    }
    return { kind: 'note', text: value };
  }

  return null;
}

export default function HandleShareScreen() {
  const { sharedPayloads, clearSharedPayloads } = useIncomingShare();
  const card = useMemo(
    () => sharedPayloads.map(cardFromPayload).find((item): item is IncomingCard => item !== null),
    [sharedPayloads]
  );

  const finish = () => {
    clearSharedPayloads();
    router.dismissAll();
    router.replace('/(tabs)/board');
  };

  return (
    <View className="flex-1 bg-theme-canvas items-center justify-center px-8">
      {!card && (
        <>
          <Text className="font-sans-semibold text-xl text-theme-foreground text-center">
            <LocalizedText>Nothing to add from this share</LocalizedText>
          </Text>
          <Text className="font-sans text-base text-theme-secondary text-center mt-3">
            <LocalizedText>Share a link, text, image, or PDF to create a card.</LocalizedText>
          </Text>
          <Pressable onPress={finish} className="bg-blue-500 rounded-xl px-6 py-3 mt-6">
            <Text className="font-sans-semibold text-white">
              <LocalizedText>Back to board</LocalizedText>
            </Text>
          </Pressable>
        </>
      )}
      {card?.kind === 'link' && (
        <NewLinkModal
          key={`${card.url}:${card.title ?? ''}`}
          visible
          initialUrl={card.url}
          initialTitle={card.title}
          onClose={finish}
        />
      )}
      {card?.kind === 'note' && (
        <NewNoteModal key={card.text} visible initialText={card.text} onClose={finish} />
      )}
      {card?.kind === 'image' && (
        <NewImageModal key={card.asset.uri} visible imageAsset={card.asset} onClose={finish} />
      )}
      {card?.kind === 'pdf' && (
        <NewPdfModal key={card.asset.uri} visible pdfAsset={card.asset} onClose={finish} />
      )}
    </View>
  );
}
