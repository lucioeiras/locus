import { useAppTheme } from '@/lib/theme';
import {
  Archive,
  ArchiveRestore,
  FolderMinus,
  FolderPlus,
  Pin,
  Trash2,
  X,
} from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { LocalizedText } from '@/components/LocalizedText';
import { translate, useLocalization } from '@/lib/i18n';

type CardSelectionBarProps = {
  visible: boolean;
  selectedCount: number;
  bottomOffset?: number;
  onDelete: () => void;
  onAddToFolder: () => void;
  removeFromFolderLabel?: string;
  onRemoveFromFolder?: () => void;
  pinActionLabel?: string;
  onTogglePin?: () => void;
  archiveActionLabel?: string;
  onToggleArchive?: () => void;
  onCancel: () => void;
};

export function CardSelectionBar({
  visible,
  selectedCount,
  bottomOffset = 0,
  onDelete,
  onAddToFolder,
  removeFromFolderLabel,
  onRemoveFromFolder,
  pinActionLabel,
  onTogglePin,
  archiveActionLabel,
  onToggleArchive,
  onCancel,
}: CardSelectionBarProps) {
  const { colors: themeColors } = useAppTheme();
  useLocalization();
  if (!visible) return null;

  const hasSelection = selectedCount > 0;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 0,
        bottom: bottomOffset,
        left: 0,
        alignItems: 'center',
      }}
    >
      <View className="items-center gap-3">
        <View className="flex-row items-center gap-2">
          <Button
            accessibilityLabel={translate('Cancel selection')}
            variant="secondary"
            icon={<X size={24} color={themeColors.foreground} strokeWidth={2} />}
            onPress={onCancel}
          />

          {pinActionLabel && onTogglePin && (
            <Button
              accessibilityLabel={pinActionLabel}
              variant="secondary"
              contentColor={themeColors.foreground}
              icon={<Pin size={24} color={themeColors.foreground} strokeWidth={2} />}
              disabled={!hasSelection}
              onPress={onTogglePin}
            />
          )}
          <Button
            accessibilityLabel={translate('Add selected cards to folder')}
            variant="secondary"
            contentColor={themeColors.foreground}
            icon={<FolderPlus size={24} color={themeColors.foreground} strokeWidth={2} />}
            disabled={!hasSelection}
            onPress={onAddToFolder}
          />
          {removeFromFolderLabel && onRemoveFromFolder && (
            <Button
              accessibilityLabel={translate(removeFromFolderLabel)}
              variant="secondary"
              contentColor={themeColors.foreground}
              icon={<FolderMinus size={24} color={themeColors.foreground} strokeWidth={2} />}
              disabled={!hasSelection}
              onPress={onRemoveFromFolder}
            />
          )}
          {archiveActionLabel && onToggleArchive && (
            <Button
              accessibilityLabel={translate(archiveActionLabel)}
              variant="secondary"
              contentColor={themeColors.foreground}
              icon={
                archiveActionLabel === 'Unarchive selected cards' ? (
                  <ArchiveRestore size={24} color={themeColors.foreground} strokeWidth={2} />
                ) : (
                  <Archive size={24} color={themeColors.foreground} strokeWidth={2} />
                )
              }
              disabled={!hasSelection}
              onPress={onToggleArchive}
            />
          )}
          <Button
            accessibilityLabel={translate('Delete selected cards')}
            variant="secondary"
            shadowColor="#EF4444"
            shadowOpacity={hasSelection ? 0.2 : 0}
            icon={
              <Trash2
                size={24}
                color={hasSelection ? '#EF4444' : themeColors.secondary}
                strokeWidth={2}
              />
            }
            disabled={!hasSelection}
            onPress={onDelete}
          />
        </View>

        <Text className="font-sans-medium text-base text-theme-foreground">
          {hasSelection ? (
            <>
              <Text className="text-theme-foreground font-sans-bold">
                {selectedCount}
                {'  '}
              </Text>
              <Text className="text-theme-secondary font-sans-semibold">
                {' '}
                <LocalizedText>selected</LocalizedText>
              </Text>
            </>
          ) : (
            <Text className="text-theme-secondary">
              <LocalizedText>Select cards</LocalizedText>
            </Text>
          )}
        </Text>
      </View>
    </View>
  );
}
