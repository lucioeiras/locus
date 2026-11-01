import { useAppTheme } from '@/lib/theme';
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  clearOverlayIfCurrent,
  useFloatingTabOverlay,
} from '@/components/menus/FloatingTabOverlay';
import { NewFolderModal } from '@/components/modals/NewFolderModal';
import { FolderTile } from '@/components/organize/FolderTile';
import { useLibrary } from '@/hooks/useLibrary';
import { getTagGroups } from '@/lib/library/organize';
import { getLibraryFolders, getSourceId, saveLibraryFolders } from '@/lib/library/storage';
import { translate, useLocalization } from '@/lib/i18n';

export default function OrganizeScreen() {
  const { colors: themeColors } = useAppTheme();
  useLocalization();
  const { source, state, setSearchQuery, clearSearchTag, updateItems } = useLibrary();
  const [saved, setSaved] = useState<{
    source: string;
    names: string[];
  } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const setFloatingTabOverlay = useFloatingTabOverlay();
  const insets = useSafeAreaInsets();
  const items = useMemo(() => (state.status === 'ready' ? state.result.items : []), [state]);
  const tagGroups = useMemo(() => getTagGroups(items), [items]);
  const itemsByTag = useMemo(
    () => new Map(tagGroups.map((group) => [group.tag, group.items])),
    [tagGroups]
  );
  const sourceId = getSourceId(source);
  const folderNames = saved?.source === sourceId ? saved.names : [];

  useFocusEffect(
    useCallback(() => {
      const overlay = (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 64 + insets.bottom,
            alignItems: 'center',
          }}
        >
          <Button
            accessibilityLabel={translate('Create folder')}
            variant="secondary"
            icon={<Plus size={20} color={themeColors.foreground} strokeWidth={2} />}
            text={translate('New Folder')}
            disabled={saved?.source !== sourceId}
            onPress={() => setIsCreateOpen(true)}
          />
        </View>
      );
      setFloatingTabOverlay(overlay);

      return () => setFloatingTabOverlay((current) => clearOverlayIfCurrent(current, overlay));
    }, [insets.bottom, saved?.source, setFloatingTabOverlay, sourceId, themeColors.foreground])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLibraryFolders(source)
        .then((names) => {
          if (!active) return;
          setSaved({ source: sourceId, names });
        })
        .catch(() => {
          if (active) {
            setSaved({ source: sourceId, names: [] });
            Alert.alert(translate('Could not load folders'), translate('Please try again.'));
          }
        });
      return () => {
        active = false;
      };
    }, [source, sourceId])
  );

  const openFolder = (kind: 'status' | 'tag', key: string) => {
    setSearchQuery('');
    clearSearchTag();
    router.navigate({
      pathname: '/board',
      params: { folderKind: kind, folderKey: key },
    });
  };

  const createFolder = async (name: string): Promise<boolean> => {
    if (saved?.source !== sourceId) return false;
    if (folderNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      Alert.alert(translate('Folder already exists'), translate('Choose a different name.'));
      return false;
    }

    const next = [...folderNames, name];
    try {
      await saveLibraryFolders(source, next);
      setSaved({ source: sourceId, names: next });
      return true;
    } catch {
      Alert.alert(translate('Could not create folder'), translate('Please try again.'));
      return false;
    }
  };

  const confirmDeleteFolder = (name: string) => {
    Alert.alert(translate('Delete folder?'), `“${name}” will be removed from your folders.`, [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Delete'),
        style: 'destructive',
        onPress: async () => {
          if (saved?.source !== sourceId) return;
          const next = folderNames.filter((folderName) => folderName !== name);
          try {
            const taggedItems = items.filter((item) =>
              item.tags?.some((tag) => tag.trim() === name)
            );
            await saveLibraryFolders(source, next);
            setSaved({ source: sourceId, names: next });

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
    ]);
  };

  if (state.status === 'loading')
    return (
      <View className="flex-1 justify-center bg-theme-canvas">
        <ActivityIndicator color={themeColors.secondary} />
      </View>
    );
  if (state.status === 'error')
    return (
      <View className="flex-1 justify-center bg-theme-canvas p-6">
        <Text className="text-center text-theme-foreground">{state.error}</Text>
      </View>
    );

  return (
    <SafeAreaView className="flex-1 bg-theme-canvas" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="px-6 pb-32 pt-8" showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap">
          {folderNames.map((name) => (
            <FolderTile
              key={`tag:${name}`}
              title={name}
              items={itemsByTag.get(name) ?? []}
              onPress={() => openFolder('tag', name)}
              onLongPress={() => confirmDeleteFolder(name)}
            />
          ))}
        </View>
      </ScrollView>

      <NewFolderModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createFolder}
      />
    </SafeAreaView>
  );
}
