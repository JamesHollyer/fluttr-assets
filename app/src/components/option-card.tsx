import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  leading?: React.ReactNode;
};

export function OptionCard({ label, hint, selected, onPress, leading }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.accent : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  leading: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
