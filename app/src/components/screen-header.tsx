import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing, WebTabBarInset } from '@/constants/theme';

type Props = { title: string; subtitle?: string; children?: React.ReactNode };

/** Large title used at the top of each tab, with room for the tab bar on web. */
export function ScreenHeader({ title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === 'web' ? WebTabBarInset : insets.top + Spacing.two;

  return (
    <View style={[styles.container, { paddingTop }]}>
      <View style={styles.titles}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  titles: {
    gap: Spacing.half,
  },
});
