import { AddActionIconSlot } from '@/components/AddActionIconSlot';
import { LocalizedText } from '@/components/LocalizedText';
import { translate, useLocalization } from '@/lib/i18n';
import { buildAudioWaveform, normalizeAudioMetering } from '@/lib/library/audioWaveform';
import { useAppTheme } from '@/lib/theme';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Clapperboard, FileText, Images, LinkIcon, Mic, SquarePen } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AddElementScreen() {
  const { colors: themeColors } = useAppTheme();
  useLocalization();
  const { controlItem, controlToken } = useLocalSearchParams<{
    controlItem?: string;
    controlToken?: string;
  }>();
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [isPickingPdf, setIsPickingPdf] = useState(false);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 100);
  const waveformSamplesRef = useRef<number[]>([]);
  const [isRecordingAction, setIsRecordingAction] = useState(false);

  useEffect(() => {
    if (recorderState.isRecording && recorderState.metering !== undefined) {
      waveformSamplesRef.current.push(normalizeAudioMetering(recorderState.metering));
    }
  }, [recorderState.isRecording, recorderState.metering, recorderState.durationMillis]);

  const handleRecordAudio = async () => {
    if (isRecordingAction) return;
    setIsRecordingAction(true);
    try {
      if (!recorderState.isRecording) {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            translate('Microphone access required'),
            translate('Allow microphone access to record audio.')
          );
          return;
        }
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
        await recorder.prepareToRecordAsync();
        waveformSamplesRef.current = [];
        recorder.record();
      } else {
        const finalMetering = recorder.getStatus().metering;
        if (finalMetering !== undefined) {
          waveformSamplesRef.current.push(normalizeAudioMetering(finalMetering));
        }
        await recorder.stop();
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        if (recorder.uri)
          router.replace({
            pathname: '/board',
            params: {
              newAudioUri: recorder.uri,
              newAudioDuration: String(recorderState.durationMillis ?? 0),
              newAudioWaveform: JSON.stringify(buildAudioWaveform(waveformSamplesRef.current)),
              newAudioTimestamp: Date.now().toString(),
            },
          });
      }
    } catch (error) {
      Alert.alert(
        translate('Audio recording failed'),
        error instanceof Error ? error.message : 'Try again.'
      );
    } finally {
      setIsRecordingAction(false);
    }
  };
  const handlePickImage = async () => {
    if (isPickingMedia) return;
    try {
      setIsPickingMedia(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      router.replace({
        pathname: '/board',
        params: {
          newImageAssets: JSON.stringify(
            result.assets.slice(0, 10).map((asset) => ({
              uri: asset.uri,
              fileName: asset.fileName ?? '',
              mimeType: asset.mimeType ?? '',
              assetId: asset.assetId ?? '',
            }))
          ),
          newImageTimestamp: Date.now().toString(),
        },
      });
    } catch (error) {
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Failed to pick image'
      );
    } finally {
      setIsPickingMedia(false);
    }
  };
  const handlePickMedia = async () => {
    if (isPickingMedia) return;
    try {
      setIsPickingMedia(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const videos = result.assets.filter((asset) => asset.type === 'video');
      if (videos.length === 1 && result.assets.length === 1) {
        const asset = videos[0];
        router.replace({
          pathname: '/board',
          params: {
            newVideoUri: asset.uri,
            newVideoFileName: asset.fileName ?? '',
            newVideoFileSize: asset.fileSize?.toString() ?? '',
            newVideoTimestamp: Date.now().toString(),
          },
        });
      } else if (videos.length === 0) {
        router.replace({
          pathname: '/board',
          params: {
            newImageAssets: JSON.stringify(
              result.assets.slice(0, 10).map((asset) => ({
                uri: asset.uri,
                fileName: asset.fileName ?? '',
                mimeType: asset.mimeType ?? '',
                assetId: asset.assetId ?? '',
              }))
            ),
            newImageTimestamp: Date.now().toString(),
          },
        });
      } else {
        Alert.alert(
          translate('Select images or one video'),
          translate('Choose up to 10 images, or select one video at a time.')
        );
      }
    } catch (e) {
      Alert.alert(translate('Error'), e instanceof Error ? e.message : 'Failed to pick media');
    } finally {
      setIsPickingMedia(false);
    }
  };

  const handlePickPdf = async () => {
    if (isPickingPdf) return;

    try {
      setIsPickingPdf(true);
      const result = await File.pickFileAsync({
        mimeTypes: ['application/pdf'],
      });

      if (result.canceled || !result.result) {
        return;
      }

      const file = result.result;

      router.replace({
        pathname: '/board',
        params: {
          newPdfUri: file.uri,
          newPdfFileName: file.name ?? '',
          newPdfTimestamp: Date.now().toString(),
        },
      });
    } catch (e) {
      console.error('Failed to pick PDF:', e);
      Alert.alert(translate('Error'), e instanceof Error ? e.message : 'Failed to pick PDF');
    } finally {
      setIsPickingPdf(false);
    }
  };

  const handleOpenNote = () => {
    router.replace({
      pathname: '/board',
      params: { newNote: Date.now().toString() },
    });
  };

  const handleOpenLink = () => {
    router.replace({
      pathname: '/board',
      params: { newLink: Date.now().toString() },
    });
  };

  const handleOpenBook = () => {
    router.replace({
      pathname: '/board',
      params: { newBook: Date.now().toString() },
    });
  };

  const handleOpenMovie = () => {
    router.replace({
      pathname: '/board',
      params: { newMovie: Date.now().toString() },
    });
  };

  const handleOpenTvShow = () => {
    router.replace({
      pathname: '/board',
      params: { newTvShow: Date.now().toString() },
    });
  };

  const handleOpenMusic = () => {
    router.replace({
      pathname: '/board',
      params: { newMusic: Date.now().toString() },
    });
  };

  const handleOpenGame = () => {
    router.replace({
      pathname: '/board',
      params: { newGame: Date.now().toString() },
    });
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      switch (controlItem) {
        case 'note':
          handleOpenNote();
          break;
        case 'link':
          handleOpenLink();
          break;
        case 'pdf':
          void handlePickPdf();
          break;
        case 'image':
          void handlePickImage();
          break;
        case 'video':
          void handlePickMedia();
          break;
        case 'audio':
          void handleRecordAudio();
          break;
        case 'book':
          handleOpenBook();
          break;
        case 'music':
          handleOpenMusic();
          break;
        case 'movie':
          handleOpenMovie();
          break;
        case 'tvshow':
          handleOpenTvShow();
          break;
        case 'game':
          handleOpenGame();
          break;
      }
    }, 0);

    return () => clearTimeout(timeout);
    // The screen is replaced after dispatch, so this should only run once per control tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlItem, controlToken]);

  return (
    <SafeAreaView className="flex-1 bg-theme-canvas items-center justify-center" edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: 1,
          paddingTop: 24,
          paddingBottom: 100,
        }}
        showsVerticalScrollIndicator={false}
        className="w-full"
      >
        <Text className="font-sans-medium text-2xl text-theme-foreground text-center w-full">
          {translate('Save what matters')}
        </Text>
        <Text className="font-sans text-base text-theme-secondary mt-3 text-center max-w-96">
          <LocalizedText>
            You can record audio, add notes, to-do's, quotes, links, movies, TV shows, games, PDFs,
            songs, X posts and Reddit posts, articles, books or YouTube videos
          </LocalizedText>
        </Text>

        <View className="mt-10 gap-4">
          <View className="flex-row flex-wrap justify-center gap-4">
            <Pressable
              onPress={handleOpenNote}
              className="p-6 max-w-80 justify-between h-40 w-40 bg-theme-foreground active:opacity-80 rounded-xl"
            >
              <SquarePen size={24} color={themeColors.inverse} strokeWidth={2} />
              <Text className="font-sans-semibold text-lg text-theme-canvas">
                <LocalizedText>A thought to remember</LocalizedText>
              </Text>
            </Pressable>

            <Pressable
              onPress={handleOpenLink}
              className="p-6 max-w-80 justify-between h-40 w-40 bg-theme-surface active:opacity-80 rounded-xl"
            >
              <LinkIcon size={24} color={themeColors.foreground} strokeWidth={2} />
              <Text className="font-sans-semibold text-lg text-theme-foreground">
                <LocalizedText>Found on the web</LocalizedText>
              </Text>
            </Pressable>
          </View>

          <View className="flex-row flex-wrap justify-center gap-4">
            <Pressable
              onPress={handlePickPdf}
              disabled={isPickingPdf}
              className="p-6 max-w-80 justify-between h-40 w-40 bg-theme-surface active:opacity-70 rounded-xl"
            >
              <AddActionIconSlot>
                {isPickingPdf ? (
                  <ActivityIndicator size={24} color={themeColors.foreground} />
                ) : (
                  <FileText size={24} color={themeColors.foreground} strokeWidth={2} />
                )}
              </AddActionIconSlot>
              <Text className="font-sans-semibold text-lg text-theme-foreground">
                <LocalizedText>Important document</LocalizedText>
              </Text>
            </Pressable>

            <Pressable
              onPress={handlePickMedia}
              disabled={isPickingMedia}
              className="p-6 max-w-80 justify-between h-40 w-40 bg-theme-surface active:opacity-70 rounded-xl"
            >
              <AddActionIconSlot>
                {isPickingMedia ? (
                  <ActivityIndicator size={24} color={themeColors.foreground} />
                ) : (
                  <Images size={24} color={themeColors.foreground} strokeWidth={2} />
                )}
              </AddActionIconSlot>
              <Text className="font-sans-semibold text-lg text-theme-foreground">
                <LocalizedText>A photo or video</LocalizedText>
              </Text>
            </Pressable>

            <Pressable
              onPress={handleRecordAudio}
              disabled={isRecordingAction}
              accessibilityRole="button"
              accessibilityLabel={translate(
                recorderState.isRecording ? 'Stop audio recording' : 'Record audio'
              )}
              className="p-6 max-w-80 justify-between h-40 w-40 bg-theme-surface active:opacity-70 rounded-xl"
            >
              <AddActionIconSlot>
                {isRecordingAction ? (
                  <ActivityIndicator size={24} color={themeColors.foreground} />
                ) : (
                  <Mic
                    size={24}
                    color={recorderState.isRecording ? themeColors.red : themeColors.foreground}
                    strokeWidth={2}
                  />
                )}
              </AddActionIconSlot>
              <Text className="font-sans-semibold text-lg text-theme-foreground">
                {recorderState.isRecording
                  ? translate('Recording · %{seconds}s', {
                      seconds: Math.floor((recorderState.durationMillis ?? 0) / 1000),
                    })
                  : translate('Speak my mind')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/board',
                  params: { newEntertainment: Date.now().toString() },
                })
              }
              accessibilityRole="button"
              className="p-6 max-w-80 justify-between h-40 w-40 bg-theme-surface active:opacity-80 rounded-xl"
            >
              <Clapperboard size={24} color={themeColors.foreground} strokeWidth={2} />
              <Text className="font-sans-semibold text-lg text-theme-foreground">
                <LocalizedText>To watch, read, or play</LocalizedText>
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
