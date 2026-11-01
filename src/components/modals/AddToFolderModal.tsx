import { ThemedModal as Modal } from '@/components/ThemedModal';
import { useAppTheme } from '@/lib/theme';
import { Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionFooter } from '@/components/ActionFooter';
import { Button } from '@/components/Button';
import { NewFolderModal } from '@/components/modals/NewFolderModal';
import { FolderTile } from '@/components/organize/FolderTile';
import { useLibrary } from '@/hooks/useLibrary';
import { getTagGroups } from '@/lib/library/organize';
import { getLibraryFolders, getSourceId, saveLibraryFolders } from '@/lib/library/storage';
import type { LibraryItem } from '@/lib/library/types';
import { LocalizedText } from '@/components/LocalizedText';
import { translate, useLocalization } from '@/lib/i18n';

type Props = {
  visible: boolean;
  items: LibraryItem[];
  onClose: () => void;
  onAdded?: (updatedItems: LibraryItem[]) => void;
};

export function AddToFolderModal({ visible, items, onClose, onAdded }: Props) {
  const { colors: themeColors } = useAppTheme();
  useLocalization();
  const { source, state, updateItems } = useLibrary();
  const insets = useSafeAreaInsets();
  const storageKey = `locus:folders:${getSourceId(source)}`;
  const [saved, setSaved] = useState<{ key: string; names: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const folderNames = saved?.key === storageKey ? saved.names : null;
  const libraryItems = useMemo(() => (state.status === 'ready' ? state.result.items : []), [state]);
  const itemsByTag = useMemo(
    () => new Map(getTagGroups(libraryItems).map((group) => [group.tag, group.items])),
    [libraryItems]
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;
    getLibraryFolders(source)
      .then((names) => {
        if (!active) return;
        setSaved({
          key: storageKey,
          names,
        });
      })
      .catch(() => {
        if (active) {
          setSaved({ key: storageKey, names: [] });
          Alert.alert(translate('Could not load folders'), translate('Please try again.'));
        }
      });
    return () => {
      active = false;
    };
  }, [visible, source, storageKey]);

  const addToFolder = async (name: string) => {
    if (saving || items.length === 0) return;
    setSaving(true);
    const updates = items.flatMap((item) =>
      item.tags?.some((tag) => tag.trim() === name)
        ? []
        : [{ itemId: item.id, updates: { tags: [...(item.tags ?? []), name] } }]
    );
    const updatedById = new Map(
      updates.map(({ itemId, updates: itemUpdates }) => [itemId, itemUpdates])
    );
    const updatedItems = items.map((item) => ({ ...item, ...updatedById.get(item.id) }));

    onAdded?.(updatedItems);
    setSaving(false);
    onClose();

    void updateItems(updates).catch((error: unknown) => {
      Alert.alert(
        translate('Could not add all cards'),
        error instanceof Error ? error.message : 'Please try again.'
      );
    });
  };

  const createFolder = async (name: string): Promise<boolean> => {
    if (folderNames === null) return false;
    if (folderNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      Alert.alert(translate('Folder already exists'), translate('Choose a different name.'));
      return false;
    }

    const next = [...folderNames, name];
    try {
      await saveLibraryFolders(source, next);
      setSaved({ key: storageKey, names: next });
      return true;
    } catch {
      Alert.alert(translate('Could not create folder'), translate('Please try again.'));
      return false;
    }
  };

  const confirmDeleteFolder = (name: string) => {
    if (saving || folderNames === null) return;
    Alert.alert(
      translate('Delete folder?'),
      `“${name}” will be removed from your folders and cards.`,
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Delete'),
          style: 'destructive',
          onPress: async () => {
            if (saving || folderNames === null) return;
            const next = folderNames.filter((folderName) => folderName !== name);
            try {
              const taggedItems = libraryItems.filter((item) =>
                item.tags?.some((tag) => tag.trim() === name)
              );
              await saveLibraryFolders(source, next);
              setSaved({ key: storageKey, names: next });

              const updates = taggedItems.map((item) => ({
                itemId: item.id,
                updates: { tags: item.tags?.filter((tag) => tag.trim() !== name) ?? [] },
              }));
              void updateItems(updates).catch((error: unknown) => {
                Alert.alert(
                  translate('Could not remove folder from all cards'),
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
            } catch {
              Alert.alert(translate('Could not delete folder'), translate('Please try again.'));
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-theme-canvas" style={{ paddingTop: Math.max(insets.top, 16) }}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow px-6 pb-12 pt-8"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2 px-2 pb-8">
            <Text className="font-sans-semibold text-2xl text-theme-foreground text-center">
              <LocalizedText>Add to folder</LocalizedText>
            </Text>
            <Text className="font-sans text-base text-theme-secondary text-center">
              {translate(items.length === 1 ? '1 card selected' : '%{count} cards selected', {
                count: items.length,
              })}
            </Text>
          </View>

          <View className="flex-row flex-wrap">
            {folderNames?.map((name) => {
              const alreadyAdded =
                items.length > 0 &&
                items.every((item) => item.tags?.some((tag) => tag.trim() === name));
              return (
                <FolderTile
                  key={`tag:${name}`}
                  title={name}
                  items={itemsByTag.get(name) ?? []}
                  disabled={items.length === 0 || alreadyAdded || saving}
                  onPress={() => addToFolder(name)}
                  onLongPress={() => confirmDeleteFolder(name)}
                />
              );
            })}
          </View>
          {folderNames === null && (
            <ActivityIndicator className="py-6" color={themeColors.secondary} />
          )}
          {folderNames?.length === 0 && (
            <View className="flex-1 items-center justify-center px-8 py-12">
              <Text className="font-sans-medium text-lg text-theme-bright">
                <LocalizedText>No folders yet</LocalizedText>
              </Text>
              <Text className="mt-2 text-center font-sans text-base text-theme-muted">
                <LocalizedText>Create a folder to organize these cards.</LocalizedText>
              </Text>
            </View>
          )}
        </ScrollView>

        <ActionFooter bottomInset={insets.bottom}>
          <Button
            accessibilityLabel={translate('Cancel')}
            onPress={handleClose}
            disabled={saving}
            icon={
              saving ? (
                <ActivityIndicator size={20} color={themeColors.secondary} />
              ) : (
                <X size={20} color={themeColors.foreground} strokeWidth={2} />
              )
            }
            text={translate('Cancel')}
          />
          <Button
            accessibilityLabel={translate('Create folder')}
            variant="secondary"
            onPress={() => setIsCreateOpen(true)}
            disabled={saving}
            icon={<Plus size={20} color={themeColors.foreground} strokeWidth={2} />}
            text={translate('New Folder')}
          />
        </ActionFooter>
      </View>
      <NewFolderModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createFolder}
      />
    </Modal>
  );
}
