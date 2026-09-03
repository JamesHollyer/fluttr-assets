import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Species } from '@/db/species';

type Props = Pick<
  Species,
  'commonName' | 'imageUrl' | 'imageWidth' | 'imageHeight' | 'imageArtist' | 'imageLicense' | 'imagePage'
>;

/** Lead photo with its Commons credit. Renders a quiet placeholder when there is no photo. */
export function SpeciesPhoto({
  commonName,
  imageUrl,
  imageWidth,
  imageHeight,
  imageArtist,
  imageLicense,
  imagePage,
}: Props) {
  const theme = useTheme();

  if (!imageUrl) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          No photo yet
        </ThemedText>
      </View>
    );
  }

  // Keep the photo's own proportions, but never taller than 4:3 so the page stays scannable.
  const ratio = imageWidth && imageHeight ? Math.max(imageWidth / imageHeight, 4 / 3) : 4 / 3;
  const credit = [imageArtist, imageLicense].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: imageUrl }}
        accessibilityLabel={`Photo of ${commonName}`}
        contentFit="cover"
        transition={200}
        cachePolicy="disk"
        style={[styles.image, { aspectRatio: ratio, backgroundColor: theme.backgroundElement }]}
      />
      {credit ? (
        <Pressable
          accessibilityRole="link"
          disabled={!imagePage}
          onPress={() => imagePage && Linking.openURL(imagePage)}
          hitSlop={6}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.credit}>
            Photo: {credit}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  image: {
    width: '100%',
    borderRadius: Spacing.three,
  },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credit: {
    fontSize: 12,
    lineHeight: 16,
  },
});
