import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { SpeciesThumb } from '@/components/species-thumb';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  code: string;
  commonName: string;
  scientificName: string;
  detail: string;
  catchCount: number;
};

export function SpeciesRow({ code, commonName, scientificName, detail, catchCount }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const caught = catchCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/species/[code]', params: { code } })}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed && styles.pressed]}>
      <SpeciesThumb code={code} caught={caught} />
      <View style={styles.text}>
        <ThemedText numberOfLines={1}>{commonName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sci}>
            {scientificName}
          </ThemedText>
          {'  ·  '}
          {detail}
        </ThemedText>
      </View>
      {caught && (
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          {catchCount === 1 ? 'Caught' : `×${catchCount}`}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  sci: {
    fontStyle: 'italic',
  },
});
