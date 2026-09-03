import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { THUMBS } from '@/data/thumbs';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = { code: string; size?: number; caught?: boolean };

/** Bundled square thumbnail for a species, with a highlight ring once it has been caught. */
export function SpeciesThumb({ code, size = 48, caught = false }: Props) {
  const theme = useTheme();
  const source = THUMBS[code];
  const radius = Spacing.two + 2;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radius + 2,
          borderColor: caught ? theme.highlight : 'transparent',
          backgroundColor: theme.backgroundSelected,
        },
      ]}>
      {source ? (
        <Image source={source} style={[styles.image, { borderRadius: radius }]} contentFit="cover" />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: theme.textSecondary }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2,
    padding: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.4,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
});
