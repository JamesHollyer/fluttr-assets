import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" style={styles.center}>
        {title}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.five,
    gap: Spacing.one,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
