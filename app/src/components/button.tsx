import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled, style, ...rest }: Props) {
  const theme = useTheme();
  const background =
    variant === 'primary' ? theme.accent : variant === 'destructive' ? 'transparent' : theme.backgroundElement;
  const color =
    variant === 'primary' ? theme.accentText : variant === 'destructive' ? theme.danger : theme.text;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 },
        typeof style === 'function' ? style({ pressed, hovered: false }) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="smallBold" style={[styles.label, { color }]}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  label: {
    fontSize: 16,
  },
});
