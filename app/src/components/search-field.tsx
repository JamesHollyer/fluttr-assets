import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SearchField(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      placeholderTextColor={theme.textSecondary}
      returnKeyType="search"
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border },
        props.style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 16,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
