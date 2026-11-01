import { ThemedModal as Modal } from '@/components/ThemedModal';
import { useAppTheme, type ThemeColors } from '@/lib/theme';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Check, ImagePlus, SquarePen, Type } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionFooter } from '@/components/ActionFooter';
import { Button } from '@/components/Button';
import { ModalCloseButton } from '@/components/ModalCloseButton';
import { ModalSaveButton } from '@/components/ModalSaveButton';
import { TagsBox } from '@/components/TagsBox';

import { LocalizedText } from '@/components/LocalizedText';
import { useLibrary } from '@/hooks/useLibrary';
import { translate, useLocalization } from '@/lib/i18n';
import type { PickedImageAsset } from '@/lib/library/storage';
import type { ImageItem } from '@/lib/library/types';
import { generateAutoTagsAsync, isGibberishOrMachineId } from '@/lib/tags/autoTags';

function getCleanImageTitle(fileName?: string | null): string {
  if (!fileName) return '';
  const nameWithoutExt = fileName.replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim();
  if (isGibberishOrMachineId(nameWithoutExt)) return '';
  return nameWithoutExt.replace(/[-_]+/g, ' ').trim();
}

const MAX_IMAGE_SELECTION = 10;

type NewImageModalProps = {
  visible: boolean;
  imageAsset: PickedImageAsset | null;
  imageAssets?: PickedImageAsset[];
  onClose: () => void;
  onDismiss?: () => void;
  onSaved?: (item: ImageItem) => void;
};

export function NewImageModal({
  visible,
  imageAsset,
  imageAssets,
  onClose,
  onDismiss,
  onSaved,
}: NewImageModalProps) {
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  useLocalization();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSaveChoice, setShowSaveChoice] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number>(4 / 3);
  const [editedSelection, setEditedSelection] = useState<{
    selectionKey: string;
    assets: PickedImageAsset[];
  } | null>(null);

  const titleInputRef = useRef<TextInput>(null);
  const tagsInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const autoTagsRef = useRef<string[]>([]);

  const { addImage, getTags } = useLibrary();
  const incomingAssets = imageAssets?.length
    ? imageAssets.slice(0, MAX_IMAGE_SELECTION)
    : imageAsset
      ? [imageAsset]
      : [];
  const selectionKey = incomingAssets.map((asset) => asset.assetId || asset.uri).join('\u0000');
  const selectedAssets =
    editedSelection?.selectionKey === selectionKey ? editedSelection.assets : incomingAssets;
  const primaryAsset = selectedAssets[0];
  const insets = useSafeAreaInsets();

  const existingTags = useMemo(
    () => (visible ? getTags().map((t) => t.tag) : []),
    [getTags, visible]
  );

  const updateAutoTags = useCallback((newAutoTags: string[]) => {
    const prevAutoTags = autoTagsRef.current;
    const combinedAutoTags = [...prevAutoTags];
    for (const t of newAutoTags) {
      if (!combinedAutoTags.includes(t)) {
        combinedAutoTags.push(t);
      }
    }
    autoTagsRef.current = combinedAutoTags;
    setAutoTags(combinedAutoTags);

    setTags((prev) => {
      const manualTags = prev.filter((t) => !prevAutoTags.includes(t));
      const merged = [...manualTags];
      for (const t of combinedAutoTags) {
        if (!merged.includes(t)) {
          merged.push(t);
        }
      }
      return merged;
    });
  }, []);

  const clearAutoTags = useCallback(() => {
    setTags((prev) => prev.filter((t) => !autoTagsRef.current.includes(t)));
    autoTagsRef.current = [];
    setAutoTags([]);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const cleanTitle = title.trim();
    const cleanNote = note.trim();
    const fallbackTitle = getCleanImageTitle(primaryAsset?.fileName);

    const textToAnalyze = cleanTitle || cleanNote || fallbackTitle;
    if (!textToAnalyze) {
      clearAutoTags();
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const auto = await generateAutoTagsAsync({
          title: cleanTitle || fallbackTitle,
          note: cleanNote,
          type: 'image',
          existingTags,
        });
        if (auto.length > 0) {
          updateAutoTags(auto);
        }
      } catch (e) {
        console.warn('Failed to generate image tags:', e);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [visible, title, note, primaryAsset, existingTags, updateAutoTags, clearAutoTags]);

  const handleClose = () => {
    if (saving) return;
    setTitle('');
    setTags([]);
    setAutoTags([]);
    autoTagsRef.current = [];
    setTagInput('');
    setNote('');
    setEditedSelection(null);
    onClose();
  };

  const handleEditSelection = async () => {
    if (saving) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      setEditedSelection({
        selectionKey,
        assets: result.assets.slice(0, MAX_IMAGE_SELECTION).map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          assetId: asset.assetId,
        })),
      });
      setAspectRatio(4 / 3);
    } catch (error) {
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Failed to open image picker'
      );
    }
  };

  const handleAddImages = async () => {
    const remainingSlots = MAX_IMAGE_SELECTION - selectedAssets.length;
    if (remainingSlots <= 0 || saving) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;

      setEditedSelection((current) => {
        const existing = current?.selectionKey === selectionKey ? current.assets : selectedAssets;
        const identities = new Set(existing.map((asset) => asset.assetId || asset.uri));
        const additions = result.assets
          .map((asset) => ({
            uri: asset.uri,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            assetId: asset.assetId,
          }))
          .filter((asset) => {
            const identity = asset.assetId || asset.uri;
            if (identities.has(identity)) return false;
            identities.add(identity);
            return true;
          });
        return {
          selectionKey,
          assets: [...existing, ...additions].slice(0, MAX_IMAGE_SELECTION),
        };
      });
    } catch (error) {
      Alert.alert(
        translate('Error'),
        error instanceof Error ? error.message : 'Failed to open image picker'
      );
    }
  };

  const saveImages = async (together: boolean) => {
    setShowSaveChoice(false);
    setSaving(true);
    try {
      const finalTags = [...tags];
      const pending = tagInput.replace(/^#/, '').trim();
      if (pending && !finalTags.includes(pending)) finalTags.push(pending);
      const savedAutoTags = autoTagsRef.current.filter((t) => finalTags.includes(t));
      const options = {
        title: title.trim() || undefined,
        note: note.trim() || undefined,
        tags: finalTags.length > 0 ? finalTags : undefined,
        autoTags: savedAutoTags.length > 0 ? savedAutoTags : undefined,
      };
      let savedItems: ImageItem[];
      if (together) {
        savedItems = [await addImage(selectedAssets, options)];
      } else {
        savedItems = [];
        for (const asset of selectedAssets) savedItems.push(await addImage(asset, options));
      }
      setTitle('');
      setTags([]);
      setAutoTags([]);
      autoTagsRef.current = [];
      setTagInput('');
      setNote('');
      setEditedSelection(null);
      if (savedItems[0]) onSaved?.(savedItems[0]);
      onClose();
    } catch (e) {
      console.error('Failed to save image:', e);
      Alert.alert(translate('Error'), e instanceof Error ? e.message : 'Failed to save image');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (selectedAssets.length === 0 || saving) return;
    if (selectedAssets.length > 1) {
      Keyboard.dismiss();
      setShowSaveChoice(true);
      return;
    }

    void saveImages(false);
  };

  if (!selectedAssets.length && !visible) {
    return null;
  }

  const canSave = selectedAssets.length > 0 && !saving;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      onDismiss={onDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View
          style={{
            paddingTop: Math.max(insets.top, 16),
          }}
          className="flex-1 w-full relative"
        >
          <ModalCloseButton onPress={handleClose} disabled={saving} />
          <ModalSaveButton>
            <Button
              size="small"
              accessibilityLabel={translate('Save image')}
              variant="primary"
              onPress={handleSave}
              disabled={!canSave}
              icon={
                saving ? (
                  <ActivityIndicator size={20} color={themeColors.inverse} />
                ) : (
                  <Check
                    size={20}
                    color={canSave ? themeColors.inverse : themeColors.muted}
                    strokeWidth={2}
                  />
                )
              }
            />
          </ModalSaveButton>
          <ScrollView
            className="flex-1 w-full"
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View className="flex-row px-8 py-8 pt-0 gap-8 items-center max-h-48 border-b border-theme-raised">
              {selectedAssets[0] && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={translate('Change selected images')}
                  accessibilityHint={translate('Opens the image picker to replace the selection')}
                  onPress={() => void handleEditSelection()}
                  className="h-full overflow-hidden bg-theme-surface border border-theme-raised"
                  style={{
                    maxHeight: 280,
                    aspectRatio: Math.min(Math.max(aspectRatio, 0.75), 1.9),
                    alignSelf: 'center',
                  }}
                >
                  <ExpoImage
                    source={{ uri: selectedAssets[0].uri }}
                    contentFit="cover"
                    style={StyleSheet.absoluteFill}
                    onLoad={(e) => {
                      if (e.source.width && e.source.height) {
                        setAspectRatio(e.source.width / e.source.height);
                      }
                    }}
                  />
                  {selectedAssets.length > 1 && (
                    <View className="absolute right-3 top-3 min-w-8 h-8 items-center justify-center rounded-full bg-black/80 px-3">
                      <Text className="font-sans-bold text-lg text-white">
                        +{selectedAssets.length - 1}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
              <View className="flex-1 gap-3">
                <Text className="font-sans-semibold text-2xl text-theme-foreground">
                  <LocalizedText>Add a new image</LocalizedText>
                </Text>
                <Text className="font-sans text-base text-theme-secondary leading-relaxed">
                  <LocalizedText>
                    Save images from your gallery to your board with tags and notes.
                  </LocalizedText>
                </Text>
              </View>
            </View>

            {/* Title Input */}
            <View className="flex-row items-center gap-4 py-5 px-8 border-b border-theme-raised">
              <Type size={20} color={themeColors.body} />

              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={setTitle}
                placeholder={translate('Add a title to this image')}
                placeholderTextColor={themeColors.muted}
                returnKeyType="next"
                onSubmitEditing={() => {
                  tagsInputRef.current?.focus();
                }}
                className="w-full font-sans text-xl text-theme-foreground leading-tight"
                style={styles.borderlessInput}
                underlineColorAndroid="transparent"
              />
            </View>

            {/* Tags section */}
            <TagsBox
              containerClassName="py-6 px-8 border-b border-theme-raised gap-4"
              tags={tags}
              autoTags={autoTags}
              onTagsChange={setTags}
              onAutoTagsChange={setAutoTags}
              tagInput={tagInput}
              onTagInputChange={setTagInput}
              inputRef={tagsInputRef}
              onSubmitEditing={() => {
                noteInputRef.current?.focus();
              }}
              onRemoveTag={(removed) => {
                autoTagsRef.current = autoTagsRef.current.filter((t) => t !== removed);
              }}
            />

            {/* Notes section */}
            <View className="flex-1 py-6 px-8 gap-4">
              <View className="flex-row items-center gap-2">
                <SquarePen size={14} color={themeColors.heading} strokeWidth={2} />
                <Text className="font-sans-semibold text-sm tracking-wider uppercase text-theme-heading">
                  <LocalizedText>Note</LocalizedText>
                </Text>
              </View>

              <Pressable onPress={() => noteInputRef.current?.focus()} className="w-full">
                <TextInput
                  ref={noteInputRef}
                  value={note}
                  onChangeText={setNote}
                  placeholder={translate('Add a text note to this image...')}
                  placeholderTextColor={themeColors.muted}
                  multiline
                  textAlignVertical="top"
                  className="w-full font-sans text-base text-theme-bright leading-relaxed min-h-[96px]"
                  style={styles.borderlessInput}
                  underlineColorAndroid="transparent"
                />
              </Pressable>
            </View>
          </ScrollView>

          {/* Action buttons at the bottom */}
          <ActionFooter buttonSize="small" bottomInset={insets.bottom} overlay>
            {selectedAssets.length > 0 && selectedAssets.length < MAX_IMAGE_SELECTION && (
              <Button
                accessibilityLabel={translate('Add images')}
                icon={<ImagePlus size={20} />}
                onPress={() => void handleAddImages()}
              />
            )}
          </ActionFooter>
          {showSaveChoice && (
            <View className="absolute inset-0 justify-end" style={{ zIndex: 30, elevation: 30 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={translate('Cancel')}
                onPress={() => setShowSaveChoice(false)}
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
              />
              <View
                className="bg-theme-canvas rounded-3xl mx-4 px-6 pt-6 gap-4 border border-theme-raised"
                style={{
                  marginBottom: Math.max(insets.bottom, 12) + 64,
                  paddingBottom: 24,
                }}
              >
                <Text className="font-sans-semibold text-2xl text-center text-theme-foreground">
                  <LocalizedText>How would you like to save these images?</LocalizedText>
                </Text>
                <Text className="font-sans text-base text-center text-theme-secondary">
                  {selectedAssets.length} {translate('images selected')}
                </Text>
                <Button
                  accessibilityLabel={translate('Separate cards')}
                  text={translate('Separate cards')}
                  variant="primary"
                  onPress={() => void saveImages(false)}
                />
                <Button
                  accessibilityLabel={translate('Same card')}
                  text={translate('Same card')}
                  onPress={() => void saveImages(true)}
                />
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (themeColors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      width: '100%',
      backgroundColor: themeColors.canvas,
    },
    scrollContent: {
      flexGrow: 1,
      paddingTop: 56,
      paddingBottom: 160,
    },
    borderlessInput: {
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
  });
