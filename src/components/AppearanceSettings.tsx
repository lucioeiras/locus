import { useLocalization } from '@/lib/i18n';
import { useAppTheme, type ThemePreference } from '@/lib/theme';
import { Sun } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

const options: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSettings() {
  const { preference, setPreference, colors } = useAppTheme();
  const { t } = useLocalization();
  return (
    <View className="gap-4 border-b border-theme-raised px-8 py-6">
      <View className="flex-row items-center gap-2">
        <Sun size={16} color={colors.heading} />
        <Text className="font-sans-semibold text-sm uppercase tracking-wider text-theme-heading">
          {t('Appearance')}
        </Text>
      </View>
      <Text className="font-sans text-base leading-relaxed text-theme-secondary">
        {t('Choose the appearance used by Locus.')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('Select app appearance')}
        className="gap-1"
      >
        {options.map(({ value, label }) => (
          <Pressable
            key={value}
            onPress={() => void setPreference(value)}
            accessibilityRole="radio"
            accessibilityLabel={t(label)}
            accessibilityState={{ checked: preference === value }}
            testID={`appearance-${value}`}
            className="min-h-12 flex-row items-center gap-3 py-2 active:opacity-70"
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded-full border ${preference === value ? 'border-theme-blue' : 'border-theme-strongBorder'}`}
            >
              {preference === value && <View className="h-2.5 w-2.5 rounded-full bg-theme-blue" />}
            </View>
            <Text className="font-sans text-base text-theme-foreground">{t(label)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
