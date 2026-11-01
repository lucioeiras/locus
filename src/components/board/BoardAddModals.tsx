import { AddToFolderModal } from '@/components/modals/AddToFolderModal';
import { NewAudioModal } from '@/components/modals/NewAudioModal';
import { NewBookModal } from '@/components/modals/NewBookModal';
import { NewEntertainmentModal } from '@/components/modals/NewEntertainmentModal';
import { NewGameModal } from '@/components/modals/NewGameModal';
import { NewImageModal } from '@/components/modals/NewImageModal';
import { NewLinkModal } from '@/components/modals/NewLinkModal';
import { NewMovieModal } from '@/components/modals/NewMovieModal';
import { NewMusicModal } from '@/components/modals/NewMusicModal';
import { NewNoteModal } from '@/components/modals/NewNoteModal';
import { NewPdfModal } from '@/components/modals/NewPdfModal';
import { NewVideoModal } from '@/components/modals/NewVideoModal';
import { NewTvShowModal } from '@/components/modals/NewTvShowModal';
import type {
  PickedAudioAsset,
  PickedImageAsset,
  PickedPdfAsset,
  PickedVideoAsset,
} from '@/lib/library/storage';
import type { LibraryItem } from '@/lib/library/types';

type Props = {
  isNoteDrawerOpen: boolean;
  isLinkModalOpen: boolean;
  isBookModalOpen: boolean;
  isMusicModalOpen: boolean;
  isMovieModalOpen: boolean;
  isTvShowModalOpen: boolean;
  isGameModalOpen: boolean;
  isEntertainmentModalOpen: boolean;
  isImageModalOpen: boolean;
  isPdfModalOpen: boolean;
  isVideoModalOpen: boolean;
  isAudioModalOpen: boolean;
  isFolderPickerOpen: boolean;
  pendingImage: PickedImageAsset | null;
  pendingImages?: PickedImageAsset[];
  pendingPdf: PickedPdfAsset | null;
  pendingVideo: PickedVideoAsset | null;
  pendingAudio: PickedAudioAsset | null;
  selectedItems: LibraryItem[];
  onClose: (
    item:
      | 'note'
      | 'link'
      | 'book'
      | 'music'
      | 'movie'
      | 'tvshow'
      | 'game'
      | 'image'
      | 'pdf'
      | 'video'
      | 'audio'
  ) => void;
  onDismiss: () => void;
  onCloseEntertainment: () => void;
  onCloseFolderPicker: () => void;
  onAddedToFolder: () => void;
};

export function BoardAddModals({
  isNoteDrawerOpen,
  isLinkModalOpen,
  isBookModalOpen,
  isMusicModalOpen,
  isMovieModalOpen,
  isTvShowModalOpen,
  isGameModalOpen,
  isEntertainmentModalOpen,
  isImageModalOpen,
  isPdfModalOpen,
  isVideoModalOpen,
  isAudioModalOpen,
  isFolderPickerOpen,
  pendingImage,
  pendingImages,
  pendingPdf,
  pendingVideo,
  pendingAudio,
  selectedItems,
  onClose,
  onDismiss,
  onCloseEntertainment,
  onCloseFolderPicker,
  onAddedToFolder,
}: Props) {
  return (
    <>
      <NewNoteModal
        visible={isNoteDrawerOpen}
        onClose={() => onClose('note')}
        onDismiss={onDismiss}
      />
      <NewLinkModal
        visible={isLinkModalOpen}
        onClose={() => onClose('link')}
        onDismiss={onDismiss}
      />
      <NewBookModal
        visible={isBookModalOpen}
        onClose={() => onClose('book')}
        onDismiss={onDismiss}
      />
      <NewMusicModal
        visible={isMusicModalOpen}
        onClose={() => onClose('music')}
        onDismiss={onDismiss}
      />
      <NewMovieModal
        visible={isMovieModalOpen}
        onClose={() => onClose('movie')}
        onDismiss={onDismiss}
      />
      <NewTvShowModal
        visible={isTvShowModalOpen}
        onClose={() => onClose('tvshow')}
        onDismiss={onDismiss}
      />
      <NewGameModal
        visible={isGameModalOpen}
        onClose={() => onClose('game')}
        onDismiss={onDismiss}
      />
      <NewEntertainmentModal
        visible={isEntertainmentModalOpen}
        onClose={onCloseEntertainment}
        onDismiss={onDismiss}
      />
      <NewImageModal
        visible={isImageModalOpen}
        imageAsset={pendingImage}
        imageAssets={pendingImages}
        onClose={() => onClose('image')}
        onDismiss={onDismiss}
      />
      <NewPdfModal
        visible={isPdfModalOpen}
        pdfAsset={pendingPdf}
        onClose={() => onClose('pdf')}
        onDismiss={onDismiss}
      />
      <NewVideoModal
        key={pendingVideo?.uri ?? 'empty-video'}
        visible={isVideoModalOpen}
        videoAsset={pendingVideo}
        onClose={() => onClose('video')}
        onDismiss={onDismiss}
      />
      <NewAudioModal
        visible={isAudioModalOpen}
        asset={pendingAudio}
        onClose={() => onClose('audio')}
      />
      <AddToFolderModal
        visible={isFolderPickerOpen}
        items={selectedItems}
        onClose={onCloseFolderPicker}
        onAdded={onAddedToFolder}
      />
    </>
  );
}
