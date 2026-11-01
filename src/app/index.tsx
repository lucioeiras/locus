import { useAppTheme } from '@/lib/theme';
import { router } from 'expo-router';
import { ChevronRight, Cloud, Smartphone, FolderPlus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLibrary } from '@/hooks/useLibrary';
import type { LibrarySource, SavedFolder } from '@/lib/library/storage';
import { LocalizedText } from '@/components/LocalizedText';
import { translate, useLocalization } from '@/lib/i18n';

export default function FolderSelectScreen() {
  const { colors: themeColors } = useAppTheme();
  useLocalization();
  const {
    source,
    selectFolder,
    pickAndOpenFolder,
    recentFolders,
    removeRecentFolder,
    isInitialized,
    shouldAutoOpenBoard,
    consumeAutoOpen,
  } = useLibrary();

  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (isInitialized && shouldAutoOpenBoard) {
      consumeAutoOpen();
      router.replace('/board');
    }
  }, [isInitialized, shouldAutoOpenBoard, consumeAutoOpen]);

  if (!isInitialized || shouldAutoOpenBoard) {
    return (
      <View className="flex-1 bg-theme-canvas items-center justify-center">
        <ActivityIndicator color={themeColors.muted} />
      </View>
    );
  }

  const handlePickFolder = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const selected = await pickAndOpenFolder();
      if (selected) {
        router.push('/board');
      }
    } catch (e) {
      Alert.alert(translate('Error opening folder'), e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };

  const handleSelectFolder = async (targetSource: LibrarySource) => {
    if (opening) return;
    setOpening(true);
    try {
      await selectFolder(targetSource);
      router.push('/board');
    } catch (e) {
      Alert.alert(translate('Error opening folder'), e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };

  const handleRemoveFolder = (folder: SavedFolder) => {
    Alert.alert(
      translate('Remove folder'),
      `Remove "${folder.name}" from recent folders? Your actual files will not be deleted.`,
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Remove'),
          style: 'destructive',
          onPress: () => removeRecentFolder(folder.id),
        },
      ]
    );
  };

  const isCurrentSource = (target: LibrarySource) => {
    if (target.kind === 'local' && source.kind === 'local') return true;
    if (target.kind === 'folder' && source.kind === 'folder' && target.uri === source.uri)
      return true;
    return false;
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-canvas" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="h-full p-8 items-center justify-center"
        showsVerticalScrollIndicator={false}
      >
        <Text className="font-sans-medium text-4xl text-theme-foreground text-center">
          <LocalizedText>Welcome to</LocalizedText>{' '}
          <Text className="font-serif-italic text-4xl text-theme-blue text-center">
            {' '}
            <LocalizedText>Locus</LocalizedText>
          </Text>
        </Text>
        <Text className="font-sans text-lg text-theme-body mt-3 text-center">
          <LocalizedText>Open your space folder or create a new one.</LocalizedText>
        </Text>
        <Text className="font-sans text-base text-theme-secondary mt-3 text-center max-w-80">
          <LocalizedText>
            Locus is offline-first and believes files should remain under your control.
          </LocalizedText>
        </Text>

        <Pressable
          onPress={handlePickFolder}
          disabled={opening}
          className="w-full max-w-80 py-3 flex-row items-center justify-center gap-2 bg-theme-foreground rounded-full mt-8"
        >
          {opening ? (
            <ActivityIndicator size={20} color={themeColors.inverse} />
          ) : (
            <FolderPlus size={20} color={themeColors.inverse} />
          )}
          <Text className="font-sans-semibold text-lg text-theme-canvas">
            <LocalizedText>Select a folder</LocalizedText>
          </Text>
        </Pressable>

        {/* Section: Saved / Recent Folders */}
        <View className="mt-12 w-full">
          <Text className="font-sans-semibold text-xs uppercase tracking-wider text-theme-muted mb-3 px-1">
            <LocalizedText>Libraries & Recents</LocalizedText>
          </Text>

          <View className="gap-2.5">
            {recentFolders.map((item) => {
              const isLocal = item.source.kind === 'local';
              const isActive = isCurrentSource(item.source);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleSelectFolder(item.source)}
                  disabled={opening}
                  className="flex-row items-center justify-between rounded-2xl border border-theme-raised/80 bg-theme-surface/90 p-4 active:bg-zinc-850"
                >
                  <View className="flex-1 flex-row items-center gap-3.5 mr-2">
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-theme-raised/70">
                      {isLocal ? (
                        <Smartphone size={22} color={themeColors.secondary} strokeWidth={2} />
                      ) : (
                        <Cloud size={22} color={themeColors.secondary} strokeWidth={2} />
                      )}
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className="font-sans-semibold text-base text-theme-bright"
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        {isActive && (
                          <View className="rounded-full bg-theme-raised px-2 py-0.5">
                            <Text className="font-sans-medium text-[10px] text-theme-body">
                              <LocalizedText>Last opened</LocalizedText>
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="mt-0.5 font-sans text-xs text-theme-secondary">
                        {isLocal ? 'This Device • Library' : 'iCloud Drive / Files'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    {!isLocal && (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleRemoveFolder(item);
                        }}
                        hitSlop={10}
                        className="p-2 rounded-lg active:opacity-60"
                        accessibilityLabel={translate('Remove from recent folders')}
                      >
                        <Trash2 size={18} color={themeColors.muted} />
                      </Pressable>
                    )}
                    <ChevronRight size={18} color={themeColors.muted} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
