import { useAppTheme } from '@/lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  ArrowLeft,
  ArrowLeftRight,
  Circle,
  CircleX,
  Cpu,
  Download,
  FolderOpen,
  Languages,
  Mic,
  Trash2,
  Type,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppearanceSettings } from '@/components/AppearanceSettings';
import { Button } from '@/components/Button';
import { LinkOpeningSettings } from '@/components/LinkOpeningSettings';
import { LocalizedText } from '@/components/LocalizedText';
import { useLibrary } from '@/hooks/useLibrary';
import { useLocalAI } from '@/lib/ai/useLocalAI';
import { useWhisperModel } from '@/lib/ai/useWhisperModel';
import { useLocalization } from '@/lib/i18n';
import { languageOptions } from '@/lib/i18n/catalog';
import type { ArchiveRetentionDays } from '@/lib/library/archive';
import { ARCHIVE_RETENTION_OPTIONS, ARCHIVE_RETENTION_STORAGE_KEY } from '@/lib/library/archive';

export default function SettingsScreen() {
  const { colors: themeColors } = useAppTheme();
  const { preference, setPreference, t } = useLocalization();
  const { currentFolderName, pickAndOpenFolder, refresh } = useLibrary();
  const [openingFolder, setOpeningFolder] = useState(false);
  const [archiveRetention, setArchiveRetention] = useState<ArchiveRetentionDays>(0);
  useEffect(() => {
    AsyncStorage.getItem(ARCHIVE_RETENTION_STORAGE_KEY)
      .then((value) => {
        const days = Number(value);
        if (ARCHIVE_RETENTION_OPTIONS.includes(days as ArchiveRetentionDays)) {
          setArchiveRetention(days as ArchiveRetentionDays);
        }
      })
      .catch(() => {});
  }, []);
  const changeArchiveRetention = async (days: ArchiveRetentionDays) => {
    try {
      await AsyncStorage.setItem(ARCHIVE_RETENTION_STORAGE_KEY, String(days));
      setArchiveRetention(days);
      await refresh();
    } catch (error) {
      Alert.alert(
        t('Error'),
        error instanceof Error ? error.message : t('Could not save archived card retention')
      );
    }
  };
  const {
    modelConfig,
    isDownloaded,
    isDownloading,
    progress,
    bytesWritten,
    totalBytes,
    error,
    downloadModel,
    cancelDownload,
    deleteModel,
  } = useLocalAI();
  const whisper = useWhisperModel();

  const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const formattedWrittenMb = (bytesWritten / (1024 * 1024)).toFixed(1);
  const formattedTotalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  const whisperPercentage = Math.round(Math.max(0, Math.min(1, whisper.progress)) * 100);
  const whisperWrittenMb = (whisper.bytesWritten / (1024 * 1024)).toFixed(1);
  const whisperTotalMb = (whisper.totalBytes / (1024 * 1024)).toFixed(1);

  const handleChangeFolder = async () => {
    if (openingFolder) return;
    setOpeningFolder(true);
    try {
      if (await pickAndOpenFolder()) {
        router.replace('/board');
      }
    } finally {
      setOpeningFolder(false);
    }
  };

  const handleConfirmDelete = () => {
    Alert.alert(
      t('Remove AI model'),
      t(
        'Remove the local model from this device? You can download it again whenever you need AI tags.'
      ),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => void deleteModel(),
        },
      ]
    );
  };

  const handleConfirmDeleteWhisper = () => {
    Alert.alert(t('Remove transcription model'), t('Remove Whisper from this device?'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Remove'),
        style: 'destructive',
        onPress: () => void whisper.deleteModel(),
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-canvas" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pt-5 pb-40"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-8 pb-8 flex-row items-center gap-4">
          <Button
            accessibilityLabel={t('Back to profile')}
            size="small"
            icon={<ArrowLeft size={20} color={themeColors.foreground} />}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          />
          <Text className="font-sans-semibold text-2xl text-theme-foreground">
            <LocalizedText>Settings</LocalizedText>
          </Text>
        </View>

        <View className="gap-4 border-b border-theme-raised px-8 pt-0 pb-6">
          <View className="flex-row items-center gap-2">
            <Circle size={16} color={themeColors.heading} />
            <Text className="font-sans-semibold text-sm uppercase tracking-wider text-theme-heading">
              <LocalizedText>Current space</LocalizedText>
            </Text>
          </View>
          <Text className="font-sans text-base leading-relaxed text-theme-secondary">
            <LocalizedText>
              Cards, tags and local files in this space are kept together in one folder.
            </LocalizedText>
          </Text>
          <Pressable
            onPress={handleChangeFolder}
            disabled={openingFolder}
            accessibilityRole="button"
            accessibilityLabel={t('Change space folder. Current space: %{name}', {
              name: currentFolderName,
            })}
            accessibilityState={{
              disabled: openingFolder,
              busy: openingFolder,
            }}
            className="min-h-14 flex-row items-center gap-4 py-2 active:opacity-70"
          >
            <FolderOpen size={20} color={themeColors.body} />
            <View className="flex-1">
              <Text className="font-sans text-xs text-theme-muted">
                <LocalizedText>Folder</LocalizedText>
              </Text>
              <Text
                className="font-sans text-xl leading-tight text-theme-foreground"
                numberOfLines={2}
              >
                {currentFolderName}
              </Text>
            </View>
            {openingFolder ? (
              <ActivityIndicator size="small" color={themeColors.muted} />
            ) : (
              <ArrowLeftRight size={20} color={themeColors.secondary} />
            )}
          </Pressable>
        </View>

        <AppearanceSettings />
        <LinkOpeningSettings />

        <View className="gap-4 border-b border-theme-raised px-8 py-6">
          <View className="flex-row items-center gap-2">
            <Trash2 size={16} color={themeColors.heading} />
            <Text className="font-sans-semibold text-sm uppercase tracking-wider text-theme-heading">
              <LocalizedText>Archived cards</LocalizedText>
            </Text>
          </View>
          <Text className="font-sans text-base leading-relaxed text-theme-secondary">
            <LocalizedText>Choose when archived cards are automatically deleted.</LocalizedText>
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('Archived card retention')}
            className="gap-1"
          >
            {ARCHIVE_RETENTION_OPTIONS.map((days) => {
              const label = days === 0 ? 'Never' : '%{count} days';
              const translated = days === 0 ? t(label) : t(label, { count: days });
              return (
                <Pressable
                  key={days}
                  onPress={() => void changeArchiveRetention(days)}
                  accessibilityRole="radio"
                  accessibilityLabel={translated}
                  accessibilityState={{ checked: archiveRetention === days }}
                  className="min-h-12 flex-row items-center gap-3 py-2 active:opacity-70"
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border ${archiveRetention === days ? 'border-blue-400' : 'border-theme-strongBorder'}`}
                  >
                    {archiveRetention === days && (
                      <View className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                    )}
                  </View>
                  <Text className="font-sans text-base text-theme-foreground">{translated}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-4 border-b border-theme-raised px-8 py-6">
          <View className="flex-row items-center gap-2">
            <Languages size={16} color={themeColors.heading} />
            <Text className="font-sans-semibold text-sm uppercase tracking-wider text-theme-heading">
              <LocalizedText>Language</LocalizedText>
            </Text>
          </View>
          <Text className="font-sans text-base leading-relaxed text-theme-secondary">
            <LocalizedText>Choose the language used by Locus.</LocalizedText>
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('Select app language')}
            className="gap-1"
          >
            {languageOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => void setPreference(option.value)}
                accessibilityRole="radio"
                accessibilityLabel={t(option.label)}
                accessibilityState={{ checked: preference === option.value }}
                className="min-h-12 flex-row items-center gap-3 py-2 active:opacity-70"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded-full border ${preference === option.value ? 'border-blue-400' : 'border-theme-strongBorder'}`}
                >
                  {preference === option.value && (
                    <View className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                  )}
                </View>
                <Text className="font-sans text-base text-theme-foreground">{t(option.label)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-4 px-8 pt-6">
          <View className="flex-row items-center gap-2">
            <Type size={16} color={themeColors.heading} />
            <Text className="font-sans-semibold text-sm uppercase tracking-wider text-theme-heading">
              <LocalizedText>AI Model for Texts</LocalizedText>
            </Text>
          </View>
          <Text className="font-sans text-base leading-relaxed text-theme-secondary">
            <LocalizedText>
              Generate tags for notes and links with a model that runs on your device. After
              download, it works offline.
            </LocalizedText>
          </Text>
          <View className="flex-row items-center gap-3 py-2">
            <Cpu size={20} color={themeColors.body} />
            <View className="min-w-0 flex-1">
              <Text
                className="font-sans text-lg leading-tight text-theme-foreground"
                numberOfLines={2}
              >
                {modelConfig.displayName}
              </Text>
              <Text className="mt-1 font-sans text-sm text-theme-muted">
                {modelConfig.sizeFormatted} <LocalizedText>download</LocalizedText>
              </Text>
            </View>
            <Button
              accessibilityLabel={
                isDownloading
                  ? 'Cancel model download'
                  : isDownloaded
                    ? 'Remove downloaded AI model'
                    : 'Download AI model'
              }
              icon={
                isDownloading ? (
                  <CircleX size={20} color={themeColors.heading} />
                ) : isDownloaded ? (
                  <Trash2 size={20} color={themeColors.red} />
                ) : (
                  <Download size={20} color={themeColors.blue} strokeWidth={2} />
                )
              }
              onPress={
                isDownloading ? cancelDownload : isDownloaded ? handleConfirmDelete : downloadModel
              }
              size="small"
              variant="secondary"
              contentColor={
                isDownloaded
                  ? themeColors.red
                  : isDownloading
                    ? themeColors.heading
                    : themeColors.blue
              }
            />
          </View>
        </View>

        <View className="px-8 pb-6 mt-4">
          {isDownloading && (
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text className="font-sans-semibold text-sm text-theme-heading">
                    <LocalizedText>Downloading model</LocalizedText>
                  </Text>
                </View>
                <Text className="font-sans-semibold text-sm text-theme-blue">
                  {percentage}
                  <LocalizedText>%</LocalizedText>
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-theme-raised">
                <View className="h-full bg-blue-500" style={{ width: `${percentage}%` }} />
              </View>
              <Text className="font-sans text-xs text-theme-muted">
                {formattedWrittenMb} <LocalizedText>/ </LocalizedText>
                {formattedTotalMb} <LocalizedText>MB</LocalizedText>
              </Text>
            </View>
          )}
          {error && <Text className="mt-4 font-sans text-sm text-theme-red">{error}</Text>}
        </View>

        <View className="gap-4 border-t border-theme-raised px-8 pt-6">
          <View className="flex-row items-center gap-2">
            <Mic size={16} color={themeColors.heading} />
            <Text className="font-sans-semibold text-sm uppercase tracking-wider text-theme-heading">
              <LocalizedText>AI Model for Audio</LocalizedText>
            </Text>
          </View>
          <Text className="font-sans text-base leading-relaxed text-theme-secondary">
            <LocalizedText>
              Transcribe recorded audios on this device. The model works offline after download.
            </LocalizedText>
          </Text>
          <View className="flex-row items-center gap-3 py-2">
            <Cpu size={20} color={themeColors.body} />
            <View className="min-w-0 flex-1">
              <Text
                className="font-sans text-lg leading-tight text-theme-foreground"
                numberOfLines={2}
              >
                {whisper.modelConfig.displayName}
              </Text>
              <Text className="mt-1 font-sans text-sm text-theme-muted">
                {whisper.modelConfig.sizeFormatted} <LocalizedText>download</LocalizedText>
              </Text>
            </View>
            <Button
              accessibilityLabel={
                whisper.isDownloading
                  ? 'Cancel transcription model download'
                  : whisper.isDownloaded
                    ? 'Remove downloaded transcription model'
                    : 'Download transcription model'
              }
              icon={
                whisper.isDownloading ? (
                  <CircleX size={20} color={themeColors.heading} />
                ) : whisper.isDownloaded ? (
                  <Trash2 size={20} color={themeColors.red} />
                ) : (
                  <Download size={20} color={themeColors.blue} strokeWidth={2} />
                )
              }
              onPress={
                whisper.isDownloading
                  ? whisper.cancelDownload
                  : whisper.isDownloaded
                    ? handleConfirmDeleteWhisper
                    : whisper.downloadModel
              }
              size="small"
              variant="secondary"
              contentColor={
                whisper.isDownloaded
                  ? themeColors.red
                  : whisper.isDownloading
                    ? themeColors.heading
                    : themeColors.blue
              }
            />
          </View>
        </View>
        <View className="px-8 pb-6 mt-4">
          {whisper.isDownloading && (
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text className="font-sans-semibold text-sm text-theme-heading">
                    <LocalizedText>Downloading model</LocalizedText>
                  </Text>
                </View>
                <Text className="font-sans-semibold text-sm text-theme-blue">
                  {whisperPercentage}
                  <LocalizedText>%</LocalizedText>
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-theme-raised">
                <View className="h-full bg-blue-500" style={{ width: `${whisperPercentage}%` }} />
              </View>
              <Text className="font-sans text-xs text-theme-muted">
                {whisperWrittenMb} <LocalizedText>/ </LocalizedText>
                {whisperTotalMb} <LocalizedText>MB</LocalizedText>
              </Text>
            </View>
          )}
          {whisper.error && (
            <Text className="mt-4 font-sans text-sm text-theme-red">{whisper.error}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
